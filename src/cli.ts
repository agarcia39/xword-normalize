import { readFileSync } from 'node:fs'
import { normalizeGrid, toText, hasRotationalSymmetry } from './format.js'

function readInput(path?: string): string {
  if (path) return readFileSync(path, 'utf8')
  return readFileSync(0, 'utf8') // stdin
}

function main(argv: string[]): void {
  const args = argv.slice(2)
  const checkSymmetry = args.includes('--check-symmetry')
  const filePath = args.find((a) => !a.startsWith('--'))

  const input = readInput(filePath)
  const result = normalizeGrid(input)

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
