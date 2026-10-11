# NeuralEv

**Neural Omni Evolution** – Stick figure controlled by evolving neural connections.

Live on GitHub Pages after enabling Pages (Settings → Pages → Deploy from branch `main` / root).

## Features

- Stick figure driven by a feed-forward neural network (joint torques)
- Multiple modes: Walk Right, Balance, Jump Height, Reach Target, Dance, Climb, Free Play
- Generational evolution: high scorers reproduce with crossover + mutation
- Live neural-connection visualization
- Export / Import population as binary `.neural-omni.nom` (intentionally unreadable in a text editor)
- English UI
- Pure client-side (HTML + Canvas + JS) – works offline once loaded

## File format `.neural-omni.nom`

Binary container:
- Magic `NOM1`
- Version, generation, population size, network size
- Weights as float32 with simple XOR obfuscation

Not meant to be edited by hand.

## Controls

| Control | Action |
|---------|--------|
| Play / Pause | Run or pause simulation |
| Step | Single physics step |
| Reset | New random population |
| Next Gen | Force next generation |
| Mode | Change fitness objective |
| Speed / Mutation | Simulation speed & mutation rate |
| Export / Import | Save or load `.neural-omni.nom` |

Click a stick figure or an entry in the population list to inspect its brain.

## Enable GitHub Pages

1. Repo → **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` / `/ (root)`
4. Save → site will be at `https://slabylol.github.io/NeuralEv/`

---

NeuralEv · neuroevolution · stick figure · neural connections · generations · scorer
