import test from 'node:test'
import assert from 'node:assert/strict'
import { hashString, dedupeBy, mergeConfig, sanitizeSettings } from '../lib/index.js'

test('hashString is stable hex', () => {
  assert.equal(hashString('a'), hashString('a'))
  assert.notEqual(hashString('a'), hashString('b'))
  assert.match(hashString('a'), /^[0-9a-f]{8}$/)
})

test('dedupeBy keeps first occurrence', () => {
  const out = dedupeBy([{ id: 1 }, { id: 1 }, { id: 2 }], (x) => x.id)
  assert.deepEqual(out, [{ id: 1 }, { id: 2 }])
})

test('mergeConfig merges plain objects and concatenates arrays', () => {
  const merged = mergeConfig({ a: [1], b: { c: 1 } }, { a: [1, 2], b: { d: 2 } })
  assert.deepEqual(merged.a, [1, 2])
  assert.deepEqual(merged.b, { c: 1, d: 2 })
})

test('sanitizeSettings drops secret keys recursively', () => {
  const clean = sanitizeSettings({ apiKey: 'x', nested: { token: 'y', ok: 1 } })
  assert.deepEqual(clean, { nested: { ok: 1 } })
})
