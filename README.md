# NeuralEv

**Neural Omni Evolution** – Stick figures controlled by evolving neural connections.

## Features

- Multi-segment stick figure (torso, head, arms, thighs, shins) driven by neural torques
- Stable physics with strong damping → no wild “fighting” oscillations
- Agents **cannot leave the screen** (hard bounds + bounce)
- 7 modes: Walk Right, Balance, Jump, Reach Target, Dance, Climb, Free Play + Editor
- Generational evolution (elitism + crossover + mutation)
- Live neural-connection visualization
- **Neural Editor** (Free Play mode): click any connection, adjust weight with slider
- Export / Import population as binary `.neural-omni.nom` (obfuscated, not human-readable)
- Modular code structure

## File layout

```
index.html
css/style.css
js/net.js          – neural network
js/stick.js        – stick figure physics + drawing + screen bounds
js/population.js   – population & generations
js/export.js       – .neural-omni.nom binary format
js/ui.js           – UI, brain view, editor
js/main.js         – main loop & canvas
```

## .neural-omni.nom format

Binary container (version 2):
- Magic `NOM1`
- Generation, population size, network size, architecture
- Weights as float32 with XOR obfuscation

Not intended for manual editing in a text editor.

## Enable GitHub Pages

1. Repo → **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` / `/ (root)`
4. Save → https://slabylol.github.io/NeuralEv/

## Controls

| Control | Action |
|---------|--------|
| Play / Pause | Run simulation |
| Step | Single physics step |
| Reset | New random population |
| Next Gen | Force next generation |
| Mode | Change fitness objective |
| Speed / Mutation | Simulation speed & mutation rate |
| Export / Import | Save or load `.neural-omni.nom` |
| Click stick / list | Select agent |
| Free Play + click brain edge | Edit that connection weight |

---

NeuralEv · stable · bounded · editable · modular
