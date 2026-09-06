# xword-normalize

Crossword grids that get typed by hand or copied out of chat/email end up
inconsistent in ways that don't matter to a human reading them but break
anything trying to parse them: black squares as `#` in one line and `*` in
another, empty squares as `.` or `_` or just a space, rows padded with
trailing spaces that vanish the moment something strips whitespace, the
whole grid indented by four spaces because it was quoted somewhere.

This normalizes a grid like that into one consistent form: `#` for a black
square, `.` for an empty white square, and uppercase letters for anything
filled in.

## Example

Input (`messy.txt`), copied out of a Slack message — note the indentation,
the mixed block characters, and the short last line:

```
    #..#....
    .*.....#
    ..#..?..
    .......
```

Run it:

```sh
npm run build
node dist/cli.js messy.txt
```

Output:

```
#..#....
.#.....#
..#.....
.......#
```

with warnings on stderr:

```
warning: line 4 was padded from 7 to 8 columns
```

## Library usage

```ts
import { normalizeGrid, toText, hasRotationalSymmetry } from './src/format.js'

const result = normalizeGrid(rawGridText)
console.log(toText(result.grid))
console.log(result.warnings)
console.log(hasRotationalSymmetry(result.grid))
```

`normalizeGrid` takes an options object if the defaults don't match your
source format — for example if your grids use `.` for a black square
instead of an empty one:

```ts
normalizeGrid(rawGridText, {
  blockChars: ['.', '#'],
  emptyChars: ['_'],
})
```

## Reading Across Lite text puzzles

Across Lite's plain-text export format (`<ACROSS PUZZLE V2>`, with `<GRID>`,
`<ACROSS>`, `<DOWN>` sections and so on) bundles a solution grid with its
clues. `parseAcrossLiteText` reads one of these into title, author,
copyright, notepad, the raw grid text, and clue lists matched up to their
grid numbers:

```ts
import { parseAcrossLiteText } from './src/acrosslite.js'

const puzzle = parseAcrossLiteText(rawExportText)
console.log(puzzle.title, puzzle.across[0]) // { number: 1, text: '...' }
```

Clues in this format are listed without their numbers, in reading order,
so `parseAcrossLiteText` recomputes the standard numbering from the grid
and zips it against each clue list; a mismatched clue count shows up as a
warning rather than a silent misalignment.

The CLI can normalize a puzzle's grid straight out of this format:

```sh
node dist/cli.js --acrosslite puzzle.txt
```

This runs `normalizeGrid` with block/empty markers set for a solution grid
(`.` is a black square, and there's no separate "empty" marker since every
white cell is filled in), and prints the title and clue counts to stderr
alongside the usual warnings.

## Validating a grid's shape

Once a grid is normalized, `validateGrid` checks two structural things
that `normalizeGrid` doesn't: that every white cell is reachable from
every other white cell (a real crossword is one interlocking puzzle, not
several stitched together), and that no across or down entry is shorter
than a minimum length (3 by default, the usual American-crossword rule):

```ts
import { normalizeGrid, validateGrid } from './src/format.js'

const { grid } = normalizeGrid(rawGridText)
const result = validateGrid(grid)
console.log(result.connected, result.shortEntries, result.errors)
```

The CLI runs it with `--validate` and prints any problems to stderr.

## What it does not do

It doesn't check whether every letter cell is part of both an across and
a down entry, and it doesn't know anything about the letters themselves -
no dictionary, no word-list checking. It only fixes the character-level
representation and checks the grid's shape. Symmetry checking is exposed
as a separate function because plenty of real puzzles (cryptics,
diagramless grids) aren't symmetric on purpose.

## Development

```sh
npm test
```

Runs the unit tests for `normalizeGrid` with Node's built-in test runner
(`node --test`), no test framework installed.

## Status

Early. The normalizer handles ragged rows, mixed block/empty markers,
indentation, and fully-blocked border rows/columns. It reads the Across
Lite text interchange format, and it checks a normalized grid's shape for
connectivity and minimum entry length. It does not yet read the binary
.puz format, and there's no per-format preset for the CLI beyond
`--acrosslite` yet.

## License

MIT, see [LICENSE](LICENSE).
