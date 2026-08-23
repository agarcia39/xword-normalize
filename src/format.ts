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

function splitLines(input: string): string[] {
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
