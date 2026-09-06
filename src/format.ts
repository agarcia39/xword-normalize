// Normalizes crossword grids that were typed or pasted by hand.
//
// The mess this deals with, in practice: people use '#', '*' or a solid
// block glyph for black squares interchangeably, they use '.', '_', '?'
// or a bare space for an unfilled white square, rows get padded with
// trailing spaces that then get stripped by whatever they pasted through,
// and the whole block often ends up uniformly indented because it was
// quoted in an email or a chat message.
//
// This does not try to guess a puzzle's real content. It only makes the
// character-level representation consistent so the rest of a toolchain
// (a solver, a renderer, a diff) can assume one format.

export type CellKind = 'block' | 'empty' | 'letter'

export interface NormalizeOptions {
  /** Characters that mean "black square". */
  blockChars?: string[]
  /** Characters that mean "white square, no letter yet". */
  emptyChars?: string[]
  /** Character to emit for a black square. */
  outputBlock?: string
  /** Character to emit for an empty white square. */
  outputEmpty?: string
  /** Upper-case any letters found. */
  uppercase?: boolean
  /** Drop leading/trailing lines that are entirely whitespace. */
  trimBlankBorders?: boolean
  /** Drop leading/trailing rows and columns that are entirely black squares. */
  trimBlockedBorders?: boolean
}

export interface NormalizeResult {
  grid: string[][]
  width: number
  height: number
  warnings: string[]
}

const DEFAULT_BLOCK_CHARS = ['#', '*', '■'] // '#', '*', '■'
const DEFAULT_EMPTY_CHARS = ['.', '_', '?', ' ']

interface ResolvedOptions {
  blockChars: string[]
  emptyChars: string[]
  outputBlock: string
  outputEmpty: string
  uppercase: boolean
  trimBlankBorders: boolean
  trimBlockedBorders: boolean
}

function resolveOptions(opts: NormalizeOptions): ResolvedOptions {
  return {
    blockChars: opts.blockChars ?? DEFAULT_BLOCK_CHARS,
    emptyChars: opts.emptyChars ?? DEFAULT_EMPTY_CHARS,
    outputBlock: opts.outputBlock ?? '#',
    outputEmpty: opts.outputEmpty ?? '.',
    uppercase: opts.uppercase ?? true,
    trimBlankBorders: opts.trimBlankBorders ?? true,
    trimBlockedBorders: opts.trimBlockedBorders ?? true,
  }
}

export function splitLines(input: string): string[] {
  return input.split(/\r\n|\r|\n/)
}

// Quoted-through-chat grids are usually indented by a fixed amount on
// every line. Strip the common leading whitespace so that isn't mistaken
// for meaningful empty columns.
function dedent(lines: string[]): string[] {
  let common = Infinity
  for (const line of lines) {
    if (line.trim().length === 0) continue
    const leading = line.match(/^[ \t]*/)?.[0].length ?? 0
    common = Math.min(common, leading)
  }
  if (!Number.isFinite(common) || common === 0) return lines
  return lines.map((line) => line.slice(common))
}

function trimBorders(lines: string[]): string[] {
  let start = 0
  let end = lines.length
  while (start < end && lines[start].trim().length === 0) start++
  while (end > start && lines[end - 1].trim().length === 0) end--
  return lines.slice(start, end)
}

function classify(
  ch: string,
  opts: ResolvedOptions,
): { kind: CellKind; unrecognized?: boolean } {
  if (opts.blockChars.includes(ch)) return { kind: 'block' }
  if (opts.emptyChars.includes(ch)) return { kind: 'empty' }
  if (/[a-zA-Z]/.test(ch)) return { kind: 'letter' }
  return { kind: 'block', unrecognized: true }
}

// A row or column of nothing but black squares carries no letters and no
// words, so it's border padding rather than puzzle content - the kind of
// thing that shows up when someone pads a grid out to a round size.
function trimBlockedBorders(
  grid: string[][],
  blockChar: string,
): { grid: string[][]; rowsTrimmed: number; colsTrimmed: number } {
  const totalRows = grid.length
  let top = 0
  let bottom = totalRows
  while (top < bottom && grid[top].every((cell) => cell === blockChar)) top++
  while (bottom > top && grid[bottom - 1].every((cell) => cell === blockChar)) bottom--
  const rows = grid.slice(top, bottom)
  const rowsTrimmed = totalRows - rows.length

  if (rows.length === 0) {
    return { grid: rows, rowsTrimmed, colsTrimmed: 0 }
  }

  const totalCols = rows[0].length
  let left = 0
  let right = totalCols
  while (left < right && rows.every((row) => row[left] === blockChar)) left++
  while (right > left && rows.every((row) => row[right - 1] === blockChar)) right--
  const colsTrimmed = totalCols - (right - left)

  return { grid: rows.map((row) => row.slice(left, right)), rowsTrimmed, colsTrimmed }
}

export function normalizeGrid(
  input: string,
  options: NormalizeOptions = {},
): NormalizeResult {
  const opts = resolveOptions(options)
  const warnings: string[] = []

  let lines = splitLines(input)
  lines = dedent(lines)
  if (opts.trimBlankBorders) {
    const before = lines.length
    lines = trimBorders(lines)
    if (lines.length !== before) {
      warnings.push('dropped blank leading/trailing lines')
    }
  }

  // A line that's blank in the middle of the grid is almost certainly a
  // mistake (a stray newline from pasting), but dropping it silently
  // would shift every row below it, so it's kept and flagged instead.
  lines.forEach((line, i) => {
    if (line.trim().length === 0) {
      warnings.push(`line ${i + 1} is blank but is not a border line`)
    }
  })

  const width = lines.reduce((max, line) => Math.max(max, line.length), 0)
  const height = lines.length

  const grid: string[][] = []
  const unrecognizedSeen = new Set<string>()

  lines.forEach((line, rowIndex) => {
    const row: string[] = []
    for (let col = 0; col < width; col++) {
      const ch = line[col]
      if (ch === undefined) {
        // Ragged row, shorter than the widest one. Trailing black
        // squares are the most common thing to get eaten by an editor
        // that strips trailing whitespace, so pad with a block.
        row.push(opts.outputBlock)
        continue
      }
      const { kind, unrecognized } = classify(ch, opts)
      if (unrecognized && !unrecognizedSeen.has(ch)) {
        unrecognizedSeen.add(ch)
        warnings.push(
          `unrecognized character ${JSON.stringify(ch)} on line ${rowIndex + 1}, treated as a block`,
        )
      }
      if (kind === 'block') row.push(opts.outputBlock)
      else if (kind === 'empty') row.push(opts.outputEmpty)
      else row.push(opts.uppercase ? ch.toUpperCase() : ch)
    }
    if (line.length < width) {
      warnings.push(`line ${rowIndex + 1} was padded from ${line.length} to ${width} columns`)
    }
    grid.push(row)
  })

  let finalGrid = grid
  let finalWidth = width
  let finalHeight = height

  if (opts.trimBlockedBorders) {
    const trimmed = trimBlockedBorders(grid, opts.outputBlock)
    if (trimmed.rowsTrimmed > 0) {
      warnings.push(`trimmed ${trimmed.rowsTrimmed} fully-blocked border row(s)`)
    }
    if (trimmed.colsTrimmed > 0) {
      warnings.push(`trimmed ${trimmed.colsTrimmed} fully-blocked border column(s)`)
    }
    finalGrid = trimmed.grid
    finalHeight = finalGrid.length
    finalWidth = finalGrid[0]?.length ?? 0
  }

  return { grid: finalGrid, width: finalWidth, height: finalHeight, warnings }
}

export function toText(grid: string[][]): string {
  return grid.map((row) => row.join('')).join('\n')
}

export interface NumberedCell {
  row: number
  col: number
  number: number
  /** This cell is the first square of an across entry. */
  across: boolean
  /** This cell is the first square of a down entry. */
  down: boolean
}

// Standard crossword numbering: a white cell gets a number if it starts
// an across entry (nothing open to its left, something open to its
// right) or a down entry (same, vertically), and it gets exactly one
// number even when it starts both. This is the numbering scheme clue
// lists are written against, so it's what lets a bare list of clues be
// matched back up to grid positions.
export function numberGrid(grid: string[][], blockChar = '#'): NumberedCell[] {
  const height = grid.length
  const width = grid[0]?.length ?? 0
  const cells: NumberedCell[] = []
  let next = 1
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (grid[r][c] === blockChar) continue
      const startsAcross =
        (c === 0 || grid[r][c - 1] === blockChar) && c + 1 < width && grid[r][c + 1] !== blockChar
      const startsDown =
        (r === 0 || grid[r - 1][c] === blockChar) && r + 1 < height && grid[r + 1][c] !== blockChar
      if (startsAcross || startsDown) {
        cells.push({ row: r, col: c, number: next, across: startsAcross, down: startsDown })
        next++
      }
    }
  }
  return cells
}

// Standard American-style crosswords are symmetric under a 180-degree
// rotation of the block pattern. Not every grid needs to satisfy this
// (cryptics and diagramless puzzles often don't), so this is informational
// rather than something normalizeGrid enforces.
export function hasRotationalSymmetry(grid: string[][], blockChar = '#'): boolean {
  const height = grid.length
  if (height === 0) return true
  const width = grid[0].length
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const isBlock = grid[r][c] === blockChar
      const mirror = grid[height - 1 - r][width - 1 - c] === blockChar
      if (isBlock !== mirror) return false
    }
  }
  return true
}

export interface ValidateOptions {
  /** Shortest entry length allowed before it's flagged. American-style
   *  crosswords conventionally require at least 3 letters per entry. */
  minWordLength?: number
  blockChar?: string
}

export interface ShortEntry {
  row: number
  col: number
  direction: 'across' | 'down'
  length: number
}

export interface ValidationResult {
  connected: boolean
  unreachableCells: number
  shortEntries: ShortEntry[]
  errors: string[]
}

// Every white cell in a real crossword has to be reachable from every
// other white cell by crossing only other white cells - that's what makes
// it one interlocking puzzle instead of several unrelated ones stitched
// together. Returns the count of white cells that aren't reachable from
// the rest, so a caller can tell "fine" from "one stray cell" from
// "half the grid is cut off".
function countUnreachableCells(grid: string[][], blockChar: string): number {
  const height = grid.length
  const width = grid[0]?.length ?? 0
  const seen: boolean[][] = grid.map((row) => row.map(() => false))

  let start: [number, number] | null = null
  let totalWhite = 0
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (grid[r][c] === blockChar) continue
      totalWhite++
      if (!start) start = [r, c]
    }
  }
  if (!start) return 0

  const stack: [number, number][] = [start]
  seen[start[0]][start[1]] = true
  let reached = 0
  while (stack.length > 0) {
    const [r, c] = stack.pop()!
    reached++
    for (const [dr, dc] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const nr = r + dr
      const nc = c + dc
      if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue
      if (seen[nr][nc] || grid[nr][nc] === blockChar) continue
      seen[nr][nc] = true
      stack.push([nr, nc])
    }
  }
  return totalWhite - reached
}

// Scans each row for across runs and each column for down runs of white
// cells, the same way numberGrid finds entry starts, but reporting every
// run's length instead of just where entries of length >= 2 begin.
function findShortEntries(grid: string[][], blockChar: string, minLength: number): ShortEntry[] {
  const height = grid.length
  const width = grid[0]?.length ?? 0
  const entries: ShortEntry[] = []

  for (let r = 0; r < height; r++) {
    let runStart = -1
    for (let c = 0; c <= width; c++) {
      const open = c < width && grid[r][c] !== blockChar
      if (open && runStart === -1) runStart = c
      if (!open && runStart !== -1) {
        const length = c - runStart
        if (length < minLength) entries.push({ row: r, col: runStart, direction: 'across', length })
        runStart = -1
      }
    }
  }

  for (let c = 0; c < width; c++) {
    let runStart = -1
    for (let r = 0; r <= height; r++) {
      const open = r < height && grid[r][c] !== blockChar
      if (open && runStart === -1) runStart = r
      if (!open && runStart !== -1) {
        const length = r - runStart
        if (length < minLength) entries.push({ row: runStart, col: c, direction: 'down', length })
        runStart = -1
      }
    }
  }

  return entries
}

// Checks the two things about a grid's shape that aren't part of the
// character-level cleanup normalizeGrid does: that every white cell is
// part of one connected puzzle, and that every entry meets a minimum
// length. It doesn't know or care what letters are in the grid - a
// solution grid and a blank template validate the same way.
export function validateGrid(grid: string[][], options: ValidateOptions = {}): ValidationResult {
  const minWordLength = options.minWordLength ?? 3
  const blockChar = options.blockChar ?? '#'

  const unreachableCells = countUnreachableCells(grid, blockChar)
  const shortEntries = findShortEntries(grid, blockChar, minWordLength)

  const errors: string[] = []
  if (unreachableCells > 0) {
    errors.push(
      `grid is not fully connected: ${unreachableCells} white cell(s) can't be reached from the rest`,
    )
  }
  for (const entry of shortEntries) {
    errors.push(
      `${entry.direction} entry at row ${entry.row + 1}, col ${entry.col + 1} is only ${entry.length} cell(s) long, minimum is ${minWordLength}`,
    )
  }

  return { connected: unreachableCells === 0, unreachableCells, shortEntries, errors }
}
