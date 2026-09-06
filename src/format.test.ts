import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeGrid, toText, hasRotationalSymmetry, numberGrid, validateGrid } from './format.js'

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

test('numberGrid assigns one number per entry start, shared when a cell starts both directions', () => {
  const grid = [
    ['A', 'B', 'C'],
    ['D', 'E', 'F'],
    ['G', 'H', 'I'],
  ]
  const cells = numberGrid(grid, '#')
  assert.deepEqual(
    cells.map((cell) => [cell.row, cell.col, cell.number, cell.across, cell.down]),
    [
      [0, 0, 1, true, true],
      [0, 1, 2, false, true],
      [0, 2, 3, false, true],
      [1, 0, 4, true, false],
      [2, 0, 5, true, false],
    ],
  )
})

test('numberGrid skips block squares and cells that start neither direction', () => {
  const grid = [
    ['A', '#', 'B'],
    ['C', 'D', 'E'],
  ]
  const cells = numberGrid(grid, '#')
  assert.deepEqual(
    cells.map((cell) => [cell.row, cell.col, cell.number, cell.across, cell.down]),
    [
      [0, 0, 1, false, true],
      [0, 2, 2, false, true],
      [1, 0, 3, true, false],
    ],
  )
})

test('validateGrid reports no errors for a fully connected grid with long enough entries', () => {
  const grid = [
    ['A', 'B', 'C'],
    ['D', 'E', 'F'],
    ['G', 'H', 'I'],
  ]
  const result = validateGrid(grid)
  assert.equal(result.connected, true)
  assert.equal(result.unreachableCells, 0)
  assert.deepEqual(result.shortEntries, [])
  assert.deepEqual(result.errors, [])
})

test('validateGrid detects a grid split into disconnected regions by a solid block row', () => {
  const grid = [
    ['A', 'A', 'A'],
    ['#', '#', '#'],
    ['B', 'B', 'B'],
  ]
  const result = validateGrid(grid)
  assert.equal(result.connected, false)
  assert.equal(result.unreachableCells, 3)
  assert.ok(result.errors.some((e) => e.includes("not fully connected: 3 white cell(s)")))
})

test('validateGrid flags across and down entries shorter than the minimum length', () => {
  const grid = [
    ['A', 'B', '#'],
    ['C', 'D', 'E'],
    ['#', 'F', 'G'],
  ]
  const result = validateGrid(grid)
  assert.equal(result.connected, true)
  assert.equal(result.shortEntries.length, 4)
  assert.deepEqual(
    result.shortEntries.map((e) => [e.row, e.col, e.direction, e.length]).sort(),
    [
      [0, 0, 'across', 2],
      [0, 0, 'down', 2],
      [1, 2, 'down', 2],
      [2, 1, 'across', 2],
    ].sort(),
  )
})

test('validateGrid honors a custom minWordLength', () => {
  const grid = [
    ['A', 'B', '#'],
    ['C', 'D', 'E'],
    ['#', 'F', 'G'],
  ]
  const result = validateGrid(grid, { minWordLength: 2 })
  assert.deepEqual(result.shortEntries, [])
  assert.deepEqual(result.errors, [])
})

test('validateGrid honors a custom blockChar', () => {
  const grid = [
    ['A', '.', 'B'],
    ['C', 'D', 'E'],
    ['.', 'F', 'G'],
  ]
  const result = validateGrid(grid, { blockChar: '.' })
  assert.equal(result.connected, true)
  assert.equal(result.shortEntries.length, 4)
})

test('validateGrid treats an empty grid as trivially valid', () => {
  const result = validateGrid([])
  assert.equal(result.connected, true)
  assert.equal(result.unreachableCells, 0)
  assert.deepEqual(result.errors, [])
})
