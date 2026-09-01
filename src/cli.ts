import { readFileSync } from 'node:fs'
import { normalizeGrid, toText, hasRotationalSymmetry } from './format.js'
import { parseAcrossLiteText } from './acrosslite.js'

function readInput(path?: string): string {
  if (path) return readFileSync(path, 'utf8')
  return readFileSync(0, 'utf8') // stdin
}

function main(argv: string[]): void {
  const args = argv.slice(2)
  const checkSymmetry = args.includes('--check-symmetry')
  const fromAcrossLite = args.includes('--acrosslite')
  const filePath = args.find((a) => !a.startsWith('--'))

  const input = readInput(filePath)

  let gridInput = input
  if (fromAcrossLite) {
    const puzzle = parseAcrossLiteText(input)
    for (const warning of puzzle.warnings) {
      process.stderr.write(`warning: ${warning}\n`)
    }
    if (puzzle.title) process.stderr.write(`title: ${puzzle.title}\n`)
    process.stderr.write(
      `${puzzle.across.length} across clue(s), ${puzzle.down.length} down clue(s)\n`,
    )
    // The solution grid uses '.' for black squares and letters everywhere
    // else, so normalizeGrid needs to be told there's no separate "empty"
    // marker rather than reading '.' as an unfilled white square.
    gridInput = puzzle.gridText
  }

  const result = fromAcrossLite
    ? normalizeGrid(gridInput, { blockChars: ['.'], emptyChars: [] })
    : normalizeGrid(gridInput)

  process.stdout.write(toText(result.grid) + '\n')

  for (const warning of result.warnings) {
    process.stderr.write(`warning: ${warning}\n`)
  }

  if (checkSymmetry) {
    const symmetric = hasRotationalSymmetry(result.grid)
    process.stderr.write(
      symmetric
        ? 'rotational symmetry: yes\n'
        : 'rotational symmetry: no\n',
    )
  }
}

main(process.argv)
