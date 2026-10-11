/** NeuralEv – Population & generation logic */

const POP_SIZE = 28;

class Population {
  constructor() {
    this.agents = [];
    this.generation = 1;
    this.bestEver = 0;
    this.selected = 0;
    this.init();
  }

  init() {
    this.agents = [];
    for (let i = 0; i < POP_SIZE; i++) {
      this.agents.push(new Stick(new Net()));
    }
    this.generation = 1;
    this.bestEver = 0;
    this.selected = 0;
  }

  step(dt, mode) {
    let alive = 0;
    for (const a of this.agents) {
      a.step(dt, mode);
      if (a.score > this.bestEver) this.bestEver = a.score;
      if (a.alive) alive++;
    }
    return alive;
  }

  nextGeneration(mutationRate) {
    this.agents.sort((a, b) => b.score - a.score);
    const eliteCount = Math.max(3, Math.floor(POP_SIZE * 0.18));
    const next = [];

    // elites (exact copies)
    for (let i = 0; i < eliteCount; i++) {
      next.push(new Stick(new Net(this.agents[i].net.w)));
    }

    // offspring
    while (next.length < POP_SIZE) {
      const p1 = this.agents[Math.floor(Math.random() * eliteCount)];
      const p2 = this.agents[Math.floor(Math.random() * eliteCount)];
      const child = p1.net.crossover(p2.net).mutate(mutationRate);
      next.push(new Stick(child));
    }

    this.agents = next;
    this.generation++;
    this.selected = 0;
  }

  resetAll() {
    for (const a of this.agents) a.reset();
  }

  get selectedAgent() {
    return this.agents[this.selected];
  }

  stats() {
    const scores = this.agents.map(a => a.score);
    const best = Math.max(...scores, 0);
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    const alive = this.agents.filter(a => a.alive).length;
    return { best, avg, alive, gen: this.generation, bestEver: this.bestEver };
  }
}
