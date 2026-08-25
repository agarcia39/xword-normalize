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

## What it does not do

It doesn't validate that a grid is a legal crossword (word lengths,
connectivity, whether every letter cell is part of both an across and a
down entry). It only fixes the character-level representation. Symmetry
checking is exposed as a separate function because plenty of real puzzles
(cryptics, diagramless grids) aren't symmetric on purpose.

## Development

```sh
npm test
```

Runs the unit tests for `normalizeGrid` with Node's built-in test runner
(`node --test`), no test framework installed.

## Status

Early. The normalizer handles ragged rows, mixed block/empty markers,
indentation, and fully-blocked border rows/columns. It does not yet read
any of the common puzzle file formats directly (see below).

## License

MIT, see [LICENSE](LICENSE).
