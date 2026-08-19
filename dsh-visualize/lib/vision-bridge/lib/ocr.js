/**
 * dsh-vision-bridge — 本地 OCR provider。
 *
 * 第一版只做 Windows OCR：用 PowerShell 子进程调用 WinRT Windows.Media.Ocr，
 * 零新增运行时依赖。macOS / Linux 当前返回不可用，由云视觉链兜底。
 */
import { spawn } from 'node:child_process'

const WINDOWS_OCR_SCRIPT = `
param([string]$Path)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime]
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
})[0]
function Await($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}
$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($Path)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($null -eq $engine) {
  throw 'No Windows OCR language pack is installed for the current user profile languages.'
}
$result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
$lines = @()
foreach ($line in $result.Lines) {
  $lines += $line.Text
}
$lines -join "\`n"
`

function runPowerShell(script, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const exe = process.platform === 'win32' ? 'powershell.exe' : 'pwsh'
    const child = spawn(exe, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script, ...args], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`Windows OCR timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8') })
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0 && stdout.trim() !== '') {
        resolve(stdout.trim())
      } else if (code === 0) {
        reject(new Error('Windows OCR returned empty output'))
      } else {
        reject(new Error(`Windows OCR failed (exit ${code}): ${stderr.trim().slice(0, 500) || stdout.trim().slice(0, 500)}`))
      }
    })
  })
}

/**
 * 用 Windows OCR 提取图片文字。
 * @param {string} filePath 绝对图片路径
 * @param {number} timeoutMs 超时
 * @returns {Promise<string>} OCR 文本
 */
export async function ocrImageWindows(filePath, timeoutMs = 120000) {
  if (process.platform !== 'win32') {
    throw new Error('Windows OCR is only available on Windows')
  }
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new Error('ocrImageWindows requires a non-empty file path')
  }
  return runPowerShell(WINDOWS_OCR_SCRIPT, [filePath], timeoutMs)
}

/**
 * 当前平台是否有本地 OCR 可用。Windows 返回 true（实际运行失败仍由调用方降级），
 * 其他平台返回 false。
 */
export function hasLocalOcr() {
  return process.platform === 'win32'
}
