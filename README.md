# PegDrop

A mobile-first, static Peggle-inspired mechanics game designed for GitHub Pages.

## Upload to GitHub Pages

Upload the contents of this folder to the root of a GitHub repository.

Your repository root should contain:

- `index.html`
- `style.css`
- `game.js`
- `storage.js`
- `levels/`
- `editor/`

Then enable GitHub Pages for the repository using the repository's root branch/folder.

## Controls

- Drag left/right anywhere on the game board to adjust aim.
- Release after dragging to keep the chosen aim.
- Tap without dragging to fire.
- Red pegs must all be cleared.
- Blue pegs are normal scoring pegs.
- When a shot finishes, one remaining blue peg can become pink if no pink peg already exists.
- A maximum of three pink pegs can spawn in a level.
- Hitting a pink peg gives 500 points and doubles scoring for subsequent peg hits during the same shot.
- Pink pegs are never placed directly in level JSON.

## Level format

Levels are stored as `levels/001.json`, `levels/002.json`, etc.

Example:

```json
{
  "id": "001",
  "balls": 10,
  "redPercentMin": 35,
  "redPercentMax": 45,
  "pegs": [
    { "x": 2, "y": 4 },
    { "x": 4.5, "y": 6 }
  ]
}
```

The game world is 12 × 20 units.

Coordinates may be fractional.

Red pegs are assigned from the normal pegs using a seed each time the level starts.

Add new level IDs to `levels/index.json`.

## Editor

Open:

`/editor/`

The editor supports:

- Whole-grid placement
- Half-grid placement
- Shift-click fractional placement
- Red randomization preview
- JSON download
- Ball count
- Min/max red percentage

For now, the editor's Test Level button stores the current level locally and explains how to add it to the main game. Direct in-editor gameplay is a natural next feature.

## Save data

Progress and career stats use browser `localStorage`.

The Settings menu supports:

- Export Save
- Import Save
- Reset Progress
- Aim sensitivity
- Aim guide toggle

## Notes

This is a starter build. Physics, scoring balance, peg radius, launcher speed, pink score, and difficulty values are intentionally easy to tune in `game.js`.
