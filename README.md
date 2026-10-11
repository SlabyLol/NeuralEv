# NeuralEv

**Neural Omni Evolution** – One stickman at a time, placeable objects, neural evolution.

## Core rules

- **Only one stickman** is active.
- When it **dies**, the next trial (next genome) starts automatically.
- After all trials of a generation finish → evolution (crossover + mutation) → next generation.

## Placeable objects

| Object | Effect |
|--------|--------|
| 💚 **Help** | Pickup: +score, +energy (respawns) |
| 💀 **Death** | Touch → instant kill |
| 🪨 **Fall** | Falls from above after delay, kills on hit, then resets |
| 🟫 **Platform** | Solid surface to stand on |
| 🔼 **Spring** | Launches stickman upward |

**How to place:** choose a tool in the second toolbar → left-click on canvas.  
**Remove:** right-click an object.

## Modes

Walk Right · Balance · Jump Height · Reach Target · Survive Hazards · Free Play + Editor

## Files

```
index.html
css/style.css
js/net.js
js/stick.js
js/objects.js      ← placeable help / death / fall / platform / spring
js/population.js   ← sequential single-stickman trials
js/export.js
js/ui.js
js/main.js
```

## .neural-omni.nom

Binary + obfuscated. Not human-readable in a text editor.

## GitHub Pages

Settings → Pages → Deploy from branch `main` / root  
→ https://slabylol.github.io/NeuralEv/

---

NeuralEv · single stickman · placeable objects · generations
