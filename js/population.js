/** NeuralEv – Sequential single-stickman trials + generations */

const POP_SIZE = 24;

class Population {
  constructor() {
    this.genomes = [];   // array of Net weights / Nets
    this.scores = [];
    this.generation = 1;
    this.trialIndex = 0;
    this.bestEver = 0;
    this.bestThisGen = 0;
    this.current = null; // active Stick
    this.init();
  }

  init() {
    this.genomes = [];
    this.scores = new Array(POP_SIZE).fill(0);
    for (let i = 0; i < POP_SIZE; i++) {
      this.genomes.push(new Net());
    }
    this.generation = 1;
    this.trialIndex = 0;
    this.bestEver = 0;
    this.bestThisGen = 0;
    this.spawnCurrent();
  }

  spawnCurrent() {
    const net = this.genomes[this.trialIndex];
    this.current = new Stick(new Net(net.w));
  }

  /** Call when current stick dies → next trial or next generation */
  onDeath(mutationRate) {
    const s = this.current.score;
    this.scores[this.trialIndex] = s;
    if (s > this.bestThisGen) this.bestThisGen = s;
    if (s > this.bestEver) this.bestEver = s;

    this.trialIndex++;
    if (this.trialIndex >= POP_SIZE) {
      this.nextGeneration(mutationRate);
    } else {
      this.spawnCurrent();
    }
  }

  nextGeneration(mutationRate) {
    // rank by score
    const order = this.scores
      .map((s, i) => ({ s, i }))
      .sort((a, b) => b.s - a.s);

    const eliteCount = Math.max(3, Math.floor(POP_SIZE * 0.2));
    const nextGenomes = [];

    for (let e = 0; e < eliteCount; e++) {
      nextGenomes.push(new Net(this.genomes[order[e].i].w));
    }

    while (nextGenomes.length < POP_SIZE) {
      const p1 = this.genomes[order[Math.floor(Math.random() * eliteCount)].i];
      const p2 = this.genomes[order[Math.floor(Math.random() * eliteCount)].i];
      nextGenomes.push(p1.crossover(p2).mutate(mutationRate));
    }

    this.genomes = nextGenomes;
    this.scores = new Array(POP_SIZE).fill(0);
    this.generation++;
    this.trialIndex = 0;
    this.bestThisGen = 0;
    this.spawnCurrent();
  }

  step(dt, mode, objects) {
    if (!this.current || !this.current.alive) return false;
    this.current.step(dt, mode, objects);
    return this.current.alive;
  }

  get stats() {
    return {
      gen: this.generation,
      trial: this.trialIndex + 1,
      pop: POP_SIZE,
      score: this.current ? this.current.score : 0,
      best: this.bestThisGen,
      bestEver: this.bestEver,
      alive: this.current && this.current.alive
    };
  }
}
