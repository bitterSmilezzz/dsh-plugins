/**
 * dsh-vision-bridge 纯函数：图片块嗅探 / 检测 / 深度重写 / 引用收集。
 * 零依赖（不 import 任何包），便于单独测试。
 * @module dsh-vision-bridge/lib/images
 */

/** 按扩展名声明的图片媒体类型（嗅探兜底）。 */
export const IMAGE_EXTENSIONS = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

/** 从字节嗅探图片格式（附件存储为无扩展名的内容寻址文件，不能依赖扩展名）。 */
export function sniffMediaType(bytes) {
  if (!bytes || bytes.length < 4) return undefined
  const head = (offset, length) => {
    const out = []
    for (let i = 0; i < length; i += 1) out.push(bytes[offset + i])
    return String.fromCharCode(...out)
  }
  if (bytes.length >= 8 && head(0, 8) === '\x89PNG\r\n\x1a\n') return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 12 && head(0, 4) === 'RIFF' && head(8, 4) === 'WEBP') return 'image/webp'
  if (bytes.length >= 6 && (head(0, 6) === 'GIF87a' || head(0, 6) === 'GIF89a')) return 'image/gif'
  return undefined
}

/** 一棵内容块树里是否含有图片（递归进入 tool-result）。 */
export function hasImageIn(blocks) {
  if (!Array.isArray(blocks)) return false
  return blocks.some((block) => {
    if (!block || typeof block !== 'object') return false
    if (block.type === 'image') return true
    if (block.type === 'tool-result') return hasImageIn(block.content)
    return false
  })
}

/**
 * 深度重写内容块树里的图片块。replacer(block) 返回替换块数组（空数组=删除）。
 * 与 harness 自己的图片遍历一致：递归进入 tool-result（否则内置 read_image 记录的
 * 图片会从嵌套里漏出去，下一轮被纯文本适配器拒绝）。
 */
export function rewriteImageBlocksDeep(blocks, replacer) {
  if (!Array.isArray(blocks)) return { blocks, changed: false }
  let changed = false
  const next = []
  for (const block of blocks) {
    if (!block || typeof block !== 'object') {
      next.push(block)
      continue
    }
    if (block.type === 'image') {
      const replacement = replacer(block)
      if (Array.isArray(replacement)) {
        next.push(...replacement)
        changed = true
      } else {
        next.push(block)
      }
      continue
    }
    if (block.type === 'tool-result' && hasImageIn(block.content)) {
      const nested = rewriteImageBlocksDeep(block.content, replacer)
      if (nested.changed) {
        next.push({ ...block, content: nested.blocks })
        changed = true
      } else {
        next.push(block)
      }
      continue
    }
    next.push(block)
  }
  return { blocks: next, changed }
}

/** 收集一棵内容块树里的所有图片 attachment 引用（递归进入 tool-result）。 */
export function collectImageRefs(blocks, out = []) {
  if (!Array.isArray(blocks)) return out
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue
    if (block.type === 'image' && block.attachment && block.attachment.attachmentId) {
      out.push(block.attachment)
    }
    if (block.type === 'tool-result') collectImageRefs(block.content, out)
  }
  return out
}

/**
 * 一次递归遍历同时收集图片引用与含图标记。等价于 `hasImageIn` + `collectImageRefs`
 * 各自递归，但只走一遍树（pre-step / llm-stream 每步都会扫描整棵消息树，双遍历
 * 在长会话里是纯浪费）。`hasImage` 语义与 `hasImageIn` 一致（任何 image 块，含无
 * attachmentId 的）；`refs` 只收集有 attachmentId 的引用（与 `collectImageRefs` 一致）。
 */
export function scanImageBlocks(blocks) {
  const refs = []
  let hasImage = false
  const walk = (node) => {
    if (!Array.isArray(node)) return
    for (const block of node) {
      if (!block || typeof block !== 'object') continue
      if (block.type === 'image') {
        hasImage = true
        if (block.attachment && block.attachment.attachmentId) refs.push(block.attachment)
        continue
      }
      if (block.type === 'tool-result') walk(block.content)
    }
  }
  walk(blocks)
  return { refs, hasImage }
}
