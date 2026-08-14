# PegDrop

A mobile-first, static Peggle-inspired mechanics game designed for GitHub Pages.

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

The game world is 12 × 20 units.

Coordinates may be fractional.

Red pegs are assigned from the normal pegs using a seed each time the level starts.

## Save data

Progress and career stats use browser `localStorage`.

The Settings menu supports:

- Export Save
- Import Save
- Reset Progress
- Aim sensitivity
- Aim guide toggle



## Added gameplay behavior

- Gravity-aware dotted aim prediction, including wall/ceiling and peg bounces.
- Ceiling is a solid bounce wall.
- Hit pegs light up and disappear 10 seconds after their individual hit time.
- HUD shows remaining red pegs.
- Peg hits show score popups.
- Final red peg triggers slow motion, zoom, shake, flash, and particles.
- A new best level score stores its exact seed as `bestSeed`.
- Generated shape levels 006 through 026 are included and already listed in `levels/index.json`.
