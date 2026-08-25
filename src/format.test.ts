import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeGrid, toText, hasRotationalSymmetry } from './format.js'

test('normalizes mixed block and empty markers to the defaults', () => {
  const result = normalizeGrid('#*■\n._?')
  assert.equal(toText(result.grid), '###\n...')
  assert.equal(result.width, 3)
  assert.equal(result.height, 2)
})

test('uppercases letters by default', () => {
  const result = normalizeGrid('cat\ndog')
  assert.equal(toText(result.grid), 'CAT\nDOG')
})

test('leaves letters alone when uppercase is disabled', () => {
  const result = normalizeGrid('cat\ndog', { uppercase: false })
  assert.equal(toText(result.grid), 'cat\ndog')
})

test('pads a ragged row with the output block character and warns', () => {
  const result = normalizeGrid('abc\nab')
  assert.equal(toText(result.grid), 'ABC\nAB#')
  assert.ok(result.warnings.some((w) => w.includes('padded from 2 to 3')))
})

test('strips common leading indentation without touching relative alignment', () => {
  const result = normalizeGrid('    #.#\n    .#.')
  assert.equal(toText(result.grid), '#.#\n.#.')
})

test('drops leading and trailing blank lines by default', () => {
  const result = normalizeGrid('\n  \n#.#\n.#.\n\n')
  assert.equal(toText(result.grid), '#.#\n.#.')
  assert.ok(result.warnings.some((w) => w.includes('dropped blank leading/trailing lines')))
})

test('keeps a blank line in the middle of the grid but flags it', () => {
  const result = normalizeGrid('#.#\n\n.#.')
  assert.equal(result.grid.length, 3)
  assert.ok(result.warnings.some((w) => w.includes('line 2 is blank but is not a border line')))
})

test('treats an unrecognized character as a block and warns once per character', () => {
  const result = normalizeGrid('a%b\nc%d')
  assert.equal(toText(result.grid), 'A#B\nC#D')
  const percentWarnings = result.warnings.filter((w) => w.includes(JSON.stringify('%')))
  assert.equal(percentWarnings.length, 1)
})

test('trims a fully-blocked border row without touching columns', () => {
  const result = normalizeGrid('###\n.#.\n#.#')
  assert.equal(toText(result.grid), '.#.\n#.#')
  assert.equal(result.height, 2)
  assert.equal(result.width, 3)
  assert.ok(result.warnings.some((w) => w.includes('trimmed 1 fully-blocked border row')))
  assert.ok(!result.warnings.some((w) => w.includes('border column')))
})

test('trims a fully-blocked border column without touching rows', () => {
  const result = normalizeGrid('#.#\n#..\n#.#')
  assert.equal(toText(result.grid), '.#\n..\n.#')
  assert.equal(result.height, 3)
  assert.equal(result.width, 2)
  assert.ok(result.warnings.some((w) => w.includes('trimmed 1 fully-blocked border column')))
  assert.ok(!result.warnings.some((w) => w.includes('border row')))
})

test('leaves an all-blocked grid empty rather than throwing', () => {
  const result = normalizeGrid('##\n##')
  assert.equal(result.grid.length, 0)
  assert.equal(result.width, 0)
  assert.equal(result.height, 0)
})

test('respects custom block and empty character sets', () => {
  const result = normalizeGrid('.#\n#.', { blockChars: ['.'], emptyChars: ['#'] })
  assert.equal(toText(result.grid), '#.\n.#')
})

test('custom output characters are honored when padding ragged rows', () => {
  const result = normalizeGrid('ab\na', { outputBlock: 'X', outputEmpty: 'o' })
  assert.equal(toText(result.grid), 'AB\nAX')
})

test('hasRotationalSymmetry detects a symmetric block pattern', () => {
  const result = normalizeGrid('#..\n...\n..#')
  assert.equal(hasRotationalSymmetry(result.grid), true)
})

test('hasRotationalSymmetry detects an asymmetric block pattern', () => {
  const result = normalizeGrid('#..\n...\n...')
  assert.equal(hasRotationalSymmetry(result.grid), false)
})

test('empty input normalizes to an empty grid', () => {
  const result = normalizeGrid('')
  assert.equal(result.grid.length, 0)
  assert.equal(result.width, 0)
  assert.equal(result.height, 0)
})
