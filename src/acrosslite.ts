// Reads the "Across Lite text" interchange format: the plain-text .txt
// export that Across Lite, Crossword Compiler and most other constructor
// tools all produce, as opposed to the binary .puz format. It looks like:
//
//   <ACROSS PUZZLE V2>
//   <TITLE>
//   Monday, June 3
//   <AUTHOR>
//   Jane Doe / Will Someone, editor
//   <COPYRIGHT>
//   (c) 2024 Some Syndicate
//   <SIZE>
//   15x15
//   <GRID>
//   ABC.DEF........
//   ...
//   <ACROSS>
//   Clue for the first across entry
//   Clue for the second across entry
//   <DOWN>
//   Clue for the first down entry
//   <NOTEPAD>
//   Any constructor's notes.
//
// The grid uses '.' for a black square and a letter for every solved
// cell - this is a solution grid, not a blank template. Clues are listed
// without their numbers, one per line, in the same order the entries
// appear reading the grid left-to-right, top-to-bottom. Matching a clue
// back to a grid position means recomputing the standard numbering and
// zipping it against the clue list in order.

import { splitLines, numberGrid } from './format.js'

export interface AcrossLiteClue {
  number: number
  text: string
}

export interface AcrossLitePuzzle {
  title: string
  author: string
  copyright: string
  width: number
  height: number
  /** Raw grid text: one row per line, '.' for black squares, letters for solved cells. */
  gridText: string
  across: AcrossLiteClue[]
  down: AcrossLiteClue[]
  notepad: string
  warnings: string[]
}

const HEADER_PATTERN = /^<ACROSS PUZZLE( V2)?>$/
const TAG_PATTERN = /^<([A-Z]+)>$/

function section(sections: Map<string, string[]>, name: string): string[] {
  return sections.get(name) ?? []
}

export function parseAcrossLiteText(input: string): AcrossLitePuzzle {
  const warnings: string[] = []
  const lines = splitLines(input)

  let i = 0
  while (i < lines.length && lines[i].trim().length === 0) i++
  if (!HEADER_PATTERN.test(lines[i]?.trim() ?? '')) {
    throw new Error('not an Across Lite text puzzle: missing "<ACROSS PUZZLE>" header')
  }
  i++

  const sections = new Map<string, string[]>()
  let current: string | null = null
  for (; i < lines.length; i++) {
    const tag = lines[i].match(TAG_PATTERN)
    if (tag) {
      current = tag[1]
      if (!sections.has(current)) sections.set(current, [])
      continue
    }
    if (current) section(sections, current).push(lines[i])
  }

  const title = section(sections, 'TITLE').join('\n').trim()
  const author = section(sections, 'AUTHOR').join('\n').trim()
  const copyright = section(sections, 'COPYRIGHT').join('\n').trim()
  const notepad = section(sections, 'NOTEPAD').join('\n').trim()

  const sizeLine = section(sections, 'SIZE')[0]?.trim() ?? ''
  const sizeMatch = sizeLine.match(/^(\d+)x(\d+)$/)
  if (!sizeMatch) {
    throw new Error(`could not parse <SIZE> section: ${JSON.stringify(sizeLine)}`)
  }
  const width = Number(sizeMatch[1])
  const height = Number(sizeMatch[2])

  const gridLines = section(sections, 'GRID').filter((line) => line.length > 0)
  if (gridLines.length !== height) {
    warnings.push(`<SIZE> declares ${height} rows but <GRID> has ${gridLines.length}`)
  }
  gridLines.forEach((line, idx) => {
    if (line.length !== width) {
      warnings.push(`grid row ${idx + 1} has ${line.length} column(s), expected ${width}`)
    }
  })
  const gridText = gridLines.join('\n')

  const acrossLines = section(sections, 'ACROSS').filter((line) => line.trim().length > 0)
  const downLines = section(sections, 'DOWN').filter((line) => line.trim().length > 0)

  const grid = gridLines.map((line) => line.split(''))
  const numbering = numberGrid(grid, '.')
  const acrossStarts = numbering.filter((cell) => cell.across)
  const downStarts = numbering.filter((cell) => cell.down)

  if (acrossStarts.length !== acrossLines.length) {
    warnings.push(
      `grid has ${acrossStarts.length} across entries but <ACROSS> lists ${acrossLines.length} clue(s)`,
    )
  }
  if (downStarts.length !== downLines.length) {
    warnings.push(
      `grid has ${downStarts.length} down entries but <DOWN> lists ${downLines.length} clue(s)`,
    )
  }

  const across = acrossLines.map((text, idx) => ({
    number: acrossStarts[idx]?.number ?? idx + 1,
    text: text.trim(),
  }))
  const down = downLines.map((text, idx) => ({
    number: downStarts[idx]?.number ?? idx + 1,
    text: text.trim(),
  }))

  return { title, author, copyright, width, height, gridText, across, down, notepad, warnings }
}
