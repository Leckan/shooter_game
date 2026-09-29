# Bay 7

A one-on-one 3D arena shooter in the browser. You and a single computer rival, Kite, fight in a closed pit. First to empty the other's integrity bar wins the round.

## Play

The game uses JavaScript modules, so open it through a local server rather than as a file.

```bash
python3 -m http.server
```

Then visit the address printed in the terminal, usually [http://127.0.0.1:8000](http://127.0.0.1:8000).

## Controls

| Key | Action |
| --- | --- |
| ↑ / ↓ | Move forward and back |
| ← / → | Turn |
| Space | Shoot |
| Click | Look with the mouse |
| Enter | Start a match, or rematch |

When Kite charges a shot, a red beam marks where it will land. Turn and walk off the beam, then put the crosshair on Kite and fire. Round wins stay on the scoreboard until you reload the page.

## Project

- `index.html` — page, HUD, and start screen
- `style.css` — layout and HUD styling
- `game.js` — arena, player, rival, and combat
- `vendor/` — [Three.js](https://threejs.org/) (MIT), used for the 3D view
