/* NeuralEv – Stick figure neuroevolution
   Modes, generations, scorer, binary .neural-omni.nom export/import
*/
(() => {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const brainCanvas = document.getElementById('brain-canvas');
  const bctx = brainCanvas.getContext('2d');

  // --- Config ---
  const POP_SIZE = 24;
  const INPUTS = 12;   // joint angles (6) + velocities (6)
  const HIDDEN = 10;
  const OUTPUTS = 6;  // joint torques
  const GRAVITY = 0.35;
  const GROUND_Y = canvas.height - 40;

  // --- State ---
  let running = false;
  let generation = 1;
  let simTime = 0;
  let speed = 1;
  let mutationRate = 0.08;
  let mode = 'walk';
  let population = [];
  let selectedIdx = 0;
  let bestEver = 0;
  let frame = 0;

  // Stick figure joint order: hip, kneeL, kneeR, ankleL, ankleR, shoulder
  const JOINT_NAMES = ['Hip', 'KneeL', 'KneeR', 'AnkleL', 'AnkleR', 'Shoulder'];

  // --- Neural Network ---
  class Net {
    constructor(weights) {
      // flat: in*hidden + hidden + hidden*out + out
      const size = INPUTS * HIDDEN + HIDDEN + HIDDEN * OUTPUTS + OUTPUTS;
      this.w = weights ? weights.slice() : Float32Array.from({ length: size }, () => (Math.random() * 2 - 1) * 0.8);
    }
    forward(inputs) {
      const h = new Float32Array(HIDDEN);
      let o = 0;
      for (let j = 0; j < HIDDEN; j++) {
        let s = this.w[INPUTS * HIDDEN + j]; // bias
        for (let i = 0; i < INPUTS; i++) s += inputs[i] * this.w[i * HIDDEN + j];
        h[j] = Math.tanh(s);
      }
      const out = new Float32Array(OUTPUTS);
      const base = INPUTS * HIDDEN + HIDDEN;
      for (let k = 0; k < OUTPUTS; k++) {
        let s = this.w[base + HIDDEN * OUTPUTS + k];
        for (let j = 0; j < HIDDEN; j++) s += h[j] * this.w[base + j * OUTPUTS + k];
        out[k] = Math.tanh(s);
      }
      this._lastH = h;
      this._lastOut = out;
      return out;
    }
    mutate(rate) {
      const n = new Net(this.w);
      for (let i = 0; i < n.w.length; i++) {
        if (Math.random() < rate) n.w[i] += (Math.random() * 2 - 1) * 0.4;
        if (Math.random() < rate * 0.1) n.w[i] = (Math.random() * 2 - 1);
      }
      return n;
    }
    crossover(other) {
      const n = new Net(this.w);
      for (let i = 0; i < n.w.length; i++) {
        if (Math.random() < 0.5) n.w[i] = other.w[i];
      }
      return n;
    }
  }

  // --- Stick Figure Physics (simple 2D articulated) ---
  class Stick {
    constructor(net) {
      this.net = net || new Net();
      this.reset();
    }
    reset() {
      this.x = 120;
      this.y = GROUND_Y - 80;
      this.vx = 0; this.vy = 0;
      // angles relative (radians)
      this.a = [0, 0.3, -0.3, 0, 0, 0]; // hip, kneeL, kneeR, ankleL, ankleR, shoulder
      this.av = [0, 0, 0, 0, 0, 0];
      this.score = 0;
      this.alive = true;
      this.age = 0;
      this.energy = 100;
      this.maxX = this.x;
      this.maxY = 0;
      this.contact = true;
    }
    sensors() {
      // normalize roughly
      const s = new Float32Array(INPUTS);
      for (let i = 0; i < 6; i++) {
        s[i] = this.a[i] / Math.PI;
        s[i + 6] = Math.tanh(this.av[i] * 0.5);
      }
      return s;
    }
    step(dt) {
      if (!this.alive) return;
      this.age += dt;
      const out = this.net.forward(this.sensors());

      // apply torques
      for (let i = 0; i < 6; i++) {
        this.av[i] += out[i] * 0.15 * dt * 60;
        this.av[i] *= 0.92; // damping
        this.a[i] += this.av[i] * dt;
        // soft limits
        this.a[i] = Math.max(-1.8, Math.min(1.8, this.a[i]));
      }

      // very simplified body motion from hip & legs
      const forward = (Math.sin(this.a[1]) - Math.sin(this.a[2])) * 1.2;
      this.vx += forward * 0.4 * dt * 60;
      this.vx *= 0.96;
      this.x += this.vx * dt * 60;

      // vertical from knee extension + jump mode
      const up = -(this.a[1] + this.a[2]) * 0.3;
      this.vy += up * 0.2 + GRAVITY * dt * 60 * 0.02;
      this.y += this.vy * dt * 60;

      // ground
      if (this.y > GROUND_Y - 70) {
        this.y = GROUND_Y - 70;
        this.vy = Math.min(0, this.vy);
        this.contact = true;
      } else this.contact = false;

      // scoring by mode
      this.updateScore();

      // death conditions
      if (this.y > GROUND_Y + 20 || this.energy <= 0 || this.age > 25) this.alive = false;
      this.energy -= 0.02 * dt * 60;
    }
    updateScore() {
      switch (mode) {
        case 'walk':
          this.score = Math.max(0, this.x - 120) + (this.contact ? 0.1 : 0);
          if (this.x > this.maxX) this.maxX = this.x;
          break;
        case 'balance':
          this.score = this.age * 2 - Math.abs(this.a[0]) * 5;
          break;
        case 'jump':
          this.maxY = Math.max(this.maxY, GROUND_Y - 70 - this.y);
          this.score = this.maxY * 3 + this.age * 0.5;
          break;
        case 'reach':
          const tx = 700, ty = GROUND_Y - 120;
          const dx = this.x - tx, dy = this.y - ty;
          this.score = 500 - Math.sqrt(dx * dx + dy * dy);
          break;
        case 'dance':
          this.score = Math.abs(Math.sin(this.age * 3) * this.a[5]) * 10 + this.age;
          break;
        case 'climb':
          this.score = (GROUND_Y - 70 - this.y) * 2 + this.age;
          break;
        case 'free':
          this.score = this.age;
          break;
      }
      if (this.score > bestEver) bestEver = this.score;
    }
    draw(c, alpha = 1) {
      c.save();
      c.globalAlpha = alpha;
      c.translate(this.x, this.y);
      c.strokeStyle = this.alive ? '#58a6ff' : '#484f58';
      c.lineWidth = 3;
      c.lineCap = 'round';

      // torso
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(0, -50);
      c.stroke();

      // head
      c.beginPath();
      c.arc(0, -62, 12, 0, Math.PI * 2);
      c.stroke();

      // arms (shoulder)
      const armAng = this.a[5];
      c.beginPath();
      c.moveTo(0, -40);
      c.lineTo(Math.sin(armAng) * 30, -40 + Math.cos(armAng) * 30);
      c.stroke();
      c.beginPath();
      c.moveTo(0, -40);
      c.lineTo(-Math.sin(armAng) * 30, -40 + Math.cos(armAng) * 30);
      c.stroke();

      // legs
      const drawLeg = (side, kneeA, ankleA) => {
        const hipX = side * 6;
        const kneeX = hipX + Math.sin(kneeA) * 28;
        const kneeY = Math.cos(kneeA) * 28;
        const footX = kneeX + Math.sin(ankleA + kneeA) * 22;
        const footY = kneeY + Math.cos(ankleA + kneeA) * 22;
        c.beginPath();
        c.moveTo(hipX, 0);
        c.lineTo(kneeX, kneeY);
        c.lineTo(footX, footY);
        c.stroke();
      };
      drawLeg(-1, this.a[1], this.a[3]);
      drawLeg(1, this.a[2], this.a[4]);

      c.restore();
    }
  }

  // --- Population ---
  function initPop() {
    population = [];
    for (let i = 0; i < POP_SIZE; i++) population.push(new Stick(new Net()));
    selectedIdx = 0;
    generation = 1;
    simTime = 0;
    bestEver = 0;
  }

  function nextGeneration() {
    population.sort((a, b) => b.score - a.score);
    const elite = Math.max(2, Math.floor(POP_SIZE * 0.2));
    const next = [];
    for (let i = 0; i < elite; i++) {
      const s = new Stick(new Net(population[i].net.w));
      next.push(s);
    }
    while (next.length < POP_SIZE) {
      const p1 = population[Math.floor(Math.random() * elite)];
      const p2 = population[Math.floor(Math.random() * elite)];
      const childNet = p1.net.crossover(p2.net).mutate(mutationRate);
      next.push(new Stick(childNet));
    }
    population = next;
    generation++;
    simTime = 0;
    selectedIdx = 0;
  }

  // --- Binary .neural-omni.nom format (intentionally unreadable) ---
  // Header: "NOM1" + version + gen + pop + weights as float32 little-endian + simple xor
  function exportNom() {
    population.sort((a, b) => b.score - a.score);
    const netSize = population[0].net.w.length;
    const buf = new ArrayBuffer(16 + POP_SIZE * netSize * 4);
    const view = new DataView(buf);
    // magic
    view.setUint8(0, 0x4E); // N
    view.setUint8(1, 0x4F); // O
    view.setUint8(2, 0x4D); // M
    view.setUint8(3, 0x31); // 1
    view.setUint16(4, 1, true); // version
    view.setUint16(6, generation, true);
    view.setUint16(8, POP_SIZE, true);
    view.setUint16(10, netSize, true);
    view.setUint16(12, INPUTS, true);
    view.setUint16(14, HIDDEN, true);

    let off = 16;
    const key = 0xA5;
    for (let i = 0; i < POP_SIZE; i++) {
      const w = population[i].net.w;
      for (let j = 0; j < netSize; j++) {
        // store float, then xor bytes for obfuscation
        view.setFloat32(off, w[j], true);
        for (let b = 0; b < 4; b++) {
          const v = view.getUint8(off + b);
          view.setUint8(off + b, v ^ key ^ ((j + i) & 0xFF));
        }
        off += 4;
      }
    }
    const blob = new Blob([buf], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `neural-omni-gen${generation}.neural-omni.nom`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importNom(file) {
    const reader = new FileReader();
    reader.onload = e => {
      const buf = e.target.result;
      const view = new DataView(buf);
      if (view.getUint8(0) !== 0x4E || view.getUint8(1) !== 0x4F || view.getUint8(2) !== 0x4D) {
        alert('Invalid .neural-omni.nom file');
        return;
      }
      const ver = view.getUint16(4, true);
      generation = view.getUint16(6, true);
      const pop = view.getUint16(8, true);
      const netSize = view.getUint16(10, true);
      const key = 0xA5;
      population = [];
      let off = 16;
      for (let i = 0; i < Math.min(pop, POP_SIZE); i++) {
        const w = new Float32Array(netSize);
        for (let j = 0; j < netSize; j++) {
          for (let b = 0; b < 4; b++) {
            const v = view.getUint8(off + b);
            view.setUint8(off + b, v ^ key ^ ((j + i) & 0xFF));
          }
          w[j] = view.getFloat32(off, true);
          off += 4;
        }
        population.push(new Stick(new Net(w)));
      }
      while (population.length < POP_SIZE) population.push(new Stick(new Net()));
      simTime = 0;
      selectedIdx = 0;
      updateUI();
    };
    reader.readAsArrayBuffer(file);
  }

  // --- Drawing ---
  function drawBrain(net) {
    bctx.fillStyle = '#0d1117';
    bctx.fillRect(0, 0, brainCanvas.width, brainCanvas.height);
    const layers = [INPUTS, HIDDEN, OUTPUTS];
    const xs = [40, 140, 240];
    const nodes = [];
    for (let L = 0; L < 3; L++) {
      const n = layers[L];
      const ys = [];
      for (let i = 0; i < n; i++) {
        const y = 20 + (i + 0.5) * (180 / n);
        ys.push(y);
        nodes.push({ x: xs[L], y, L, i });
        bctx.beginPath();
        bctx.arc(xs[L], y, 5, 0, Math.PI * 2);
        bctx.fillStyle = L === 0 ? '#58a6ff' : L === 1 ? '#3fb950' : '#f778ba';
        bctx.fill();
      }
    }
    // simple weight lines (sampled)
    bctx.globalAlpha = 0.25;
    for (let i = 0; i < INPUTS; i++) {
      for (let j = 0; j < HIDDEN; j++) {
        const w = net.w[i * HIDDEN + j];
        bctx.strokeStyle = w > 0 ? '#3fb950' : '#f85149';
        bctx.lineWidth = Math.min(2, Math.abs(w));
        bctx.beginPath();
        bctx.moveTo(xs[0], 20 + (i + 0.5) * (180 / INPUTS));
        bctx.lineTo(xs[1], 20 + (j + 0.5) * (180 / HIDDEN));
        bctx.stroke();
      }
    }
    bctx.globalAlpha = 1;
    bctx.fillStyle = '#8b949e';
    bctx.font = '10px sans-serif';
    bctx.fillText('In', 30, 12);
    bctx.fillText('Hidden', 120, 12);
    bctx.fillText('Out', 230, 12);
  }

  function render() {
    ctx.fillStyle = '#010409';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // ground
    ctx.strokeStyle = '#21262d';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(canvas.width, GROUND_Y);
    ctx.stroke();

    // target for reach mode
    if (mode === 'reach') {
      ctx.fillStyle = '#f778ba';
      ctx.beginPath();
      ctx.arc(700, GROUND_Y - 120, 10, 0, Math.PI * 2);
      ctx.fill();
    }

    // draw all sticks (faded) + selected bright
    population.forEach((s, i) => {
      if (i !== selectedIdx) s.draw(ctx, 0.25);
    });
    if (population[selectedIdx]) population[selectedIdx].draw(ctx, 1);

    // mode label
    ctx.fillStyle = '#8b949e';
    ctx.font = '14px sans-serif';
    ctx.fillText('Mode: ' + mode.toUpperCase() + '  |  Gen ' + generation, 12, 24);
  }

  function updateUI() {
    document.getElementById('gen').textContent = generation;
    const scores = population.map(p => p.score);
    const best = Math.max(...scores, 0);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    document.getElementById('best').textContent = best.toFixed(1);
    document.getElementById('avg').textContent = avg.toFixed(1);
    document.getElementById('alive').textContent = population.filter(p => p.alive).length;
    document.getElementById('time').textContent = simTime.toFixed(1);

    const list = document.getElementById('pop-list');
    list.innerHTML = population
      .map((p, i) => `<div class="pop-item ${i === selectedIdx ? 'best' : ''}" data-i="${i}">#${i}  score ${p.score.toFixed(1)} ${p.alive ? '' : '(dead)'}</div>`)
      .join('');
    list.querySelectorAll('.pop-item').forEach(el => {
      el.onclick = () => { selectedIdx = +el.dataset.i; updateUI(); };
    });

    if (population[selectedIdx]) drawBrain(population[selectedIdx].net);
  }

  // --- Loop ---
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000) * speed;
    last = now;
    if (running) {
      simTime += dt;
      let anyAlive = false;
      population.forEach(s => {
        s.step(dt);
        if (s.alive) anyAlive = true;
      });
      if (!anyAlive || simTime > 20) nextGeneration();
      frame++;
      if (frame % 3 === 0) updateUI();
    }
    render();
    requestAnimationFrame(loop);
  }

  // --- Events ---
  document.getElementById('btn-play').onclick = () => {
    running = !running;
    document.getElementById('btn-play').textContent = running ? '⏸ Pause' : '▶ Play';
  };
  document.getElementById('btn-step').onclick = () => {
    population.forEach(s => s.step(0.05));
    simTime += 0.05;
    updateUI();
  };
  document.getElementById('btn-reset').onclick = () => { initPop(); updateUI(); };
  document.getElementById('btn-newgen').onclick = () => nextGeneration();
  document.getElementById('mode-select').onchange = e => {
    mode = e.target.value;
    population.forEach(s => s.reset());
    simTime = 0;
  };
  document.getElementById('speed').oninput = e => { speed = +e.target.value; };
  document.getElementById('mutation').oninput = e => { mutationRate = +e.target.value; };
  document.getElementById('btn-export').onclick = exportNom;
  document.getElementById('btn-import').onclick = () => document.getElementById('file-import').click();
  document.getElementById('file-import').onchange = e => {
    if (e.target.files[0]) importNom(e.target.files[0]);
  };

  // click canvas to select nearest stick
  canvas.onclick = ev => {
    const r = canvas.getBoundingClientRect();
    const mx = (ev.clientX - r.left) * (canvas.width / r.width);
    const my = (ev.clientY - r.top) * (canvas.height / r.height);
    let best = 0, bd = 1e9;
    population.forEach((s, i) => {
      const d = (s.x - mx) ** 2 + (s.y - my) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    selectedIdx = best;
    updateUI();
  };

  // start
  initPop();
  updateUI();
  requestAnimationFrame(loop);
})();
