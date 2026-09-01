import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseAcrossLiteText } from './acrosslite.js'

const SAMPLE = `<ACROSS PUZZLE V2>
<TITLE>
Test Puzzle
<AUTHOR>
Test Author
<COPYRIGHT>
(c) 2024 Test
<SIZE>
3x3
<GRID>
ABC
D.E
FGH
<ACROSS>
Clue one across
Clue two across
<DOWN>
Clue one down
Clue two down
<NOTEPAD>
Some notes
`

test('parses metadata, grid, and clues into a structured puzzle', () => {
  const puzzle = parseAcrossLiteText(SAMPLE)
  assert.equal(puzzle.title, 'Test Puzzle')
  assert.equal(puzzle.author, 'Test Author')
  assert.equal(puzzle.copyright, '(c) 2024 Test')
  assert.equal(puzzle.notepad, 'Some notes')
  assert.equal(puzzle.width, 3)
  assert.equal(puzzle.height, 3)
  assert.equal(puzzle.gridText, 'ABC\nD.E\nFGH')
  assert.deepEqual(puzzle.warnings, [])
})

test('matches clues to grid positions using the standard numbering', () => {
  const puzzle = parseAcrossLiteText(SAMPLE)
  assert.deepEqual(puzzle.across, [
    { number: 1, text: 'Clue one across' },
    { number: 3, text: 'Clue two across' },
  ])
  assert.deepEqual(puzzle.down, [
    { number: 1, text: 'Clue one down' },
    { number: 2, text: 'Clue two down' },
  ])
})

test('warns when the clue count does not match the grid entry count', () => {
  const withMissingClue = SAMPLE.replace('Clue two across\n', '')
  const puzzle = parseAcrossLiteText(withMissingClue)
  assert.ok(
    puzzle.warnings.some((w) => w.includes('2 across entries but <ACROSS> lists 1 clue')),
  )
})

test('warns when a grid row does not match the declared width', () => {
  const withShortRow = SAMPLE.replace('D.E', 'D.')
  const puzzle = parseAcrossLiteText(withShortRow)
  assert.ok(puzzle.warnings.some((w) => w.includes('grid row 2 has 2 column(s), expected 3')))
})

test('throws when the header tag is missing', () => {
  const withoutHeader = SAMPLE.replace('<ACROSS PUZZLE V2>\n', '')
  assert.throws(() => parseAcrossLiteText(withoutHeader), /missing "<ACROSS PUZZLE>" header/)
})

test('throws when the size section cannot be parsed', () => {
  const withBadSize = SAMPLE.replace('3x3', 'not-a-size')
  assert.throws(() => parseAcrossLiteText(withBadSize), /could not parse <SIZE>/)
})
