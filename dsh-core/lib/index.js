/**
 * dsh-core — shared utilities for the scene-based DSH plugin monorepo.
 *
 * These helpers are intentionally dependency-free so every bundle / installer
 * can import them without dragging a package graph.
 */

/** Stable FNV-1a 32-bit hash, hex string. Useful for content-hash dedupe. */
export function hashString(input) {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** Deduplicate an array by a string key. Keeps first occurrence. */
export function dedupeBy(items, keyFn) {
  const seen = new Set()
  const out = []
  for (const item of items) {
    const key = keyFn(item)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

/** Deep-merge plain objects/arrays (arrays are concatenated then deduped). */
export function mergeConfig(base, patch) {
  if (Array.isArray(base) || Array.isArray(patch)) {
    return dedupeBy([...(Array.isArray(base) ? base : []), ...(Array.isArray(patch) ? patch : [])], (x) =>
      JSON.stringify(x),
    )
  }
  if (base && patch && typeof base === 'object' && typeof patch === 'object') {
    const out = { ...base }
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue
      out[key] = key in out ? mergeConfig(out[key], value) : value
    }
    return out
  }
  return patch === undefined ? base : patch
}

/** Mask a settings object for distribution: drops known secret fields. */
export function sanitizeSettings(settings, secretKeys = ['apiKey', 'token', 'secret']) {
  if (Array.isArray(settings)) return settings.map((x) => sanitizeSettings(x, secretKeys))
  if (settings && typeof settings === 'object') {
    const out = {}
    for (const [key, value] of Object.entries(settings)) {
      const lowerKey = key.toLowerCase()
      if (secretKeys.some((k) => lowerKey.includes(k.toLowerCase()))) continue
      out[key] = sanitizeSettings(value, secretKeys)
    }
    return out
  }
  return settings
}
