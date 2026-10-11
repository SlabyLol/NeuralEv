/** NeuralEv – UI, brain visualization, neural editor */

class UI {
  constructor(pop) {
    this.pop = pop;
    this.mode = 'walk';
    this.selectedEdge = -1;
    this.brainCanvas = document.getElementById('brain-canvas');
    this.bctx = this.brainCanvas.getContext('2d');
    this.edgeHitboxes = []; // for click detection

    this.bind();
  }

  bind() {
    document.getElementById('btn-play').onclick = () => {
      window.NeuralEv.running = !window.NeuralEv.running;
      document.getElementById('btn-play').textContent =
        window.NeuralEv.running ? '⏸ Pause' : '▶ Play';
    };
    document.getElementById('btn-step').onclick = () => {
      this.pop.step(0.04, this.mode);
      this.update();
    };
    document.getElementById('btn-reset').onclick = () => {
      this.pop.init();
      window.NeuralEv.simTime = 0;
      this.update();
    };
    document.getElementById('btn-newgen').onclick = () => {
      this.pop.nextGeneration(window.NeuralEv.mutationRate);
      window.NeuralEv.simTime = 0;
      this.update();
    };
    document.getElementById('mode-select').onchange = e => {
      this.mode = e.target.value;
      this.pop.resetAll();
      window.NeuralEv.simTime = 0;
      this.toggleEditor();
      this.update();
    };
    document.getElementById('speed').oninput = e => {
      window.NeuralEv.speed = +e.target.value;
    };
    document.getElementById('mutation').oninput = e => {
      window.NeuralEv.mutationRate = +e.target.value;
    };
    document.getElementById('btn-export').onclick = () => exportNom(this.pop);
    document.getElementById('btn-import').onclick = () =>
      document.getElementById('file-import').click();
    document.getElementById('file-import').onchange = e => {
      if (e.target.files[0]) {
        importNom(e.target.files[0], this.pop, () => {
          window.NeuralEv.simTime = 0;
          this.update();
        });
      }
    };

    // Brain canvas click → select edge
    this.brainCanvas.addEventListener('click', e => this.onBrainClick(e));

    // Weight slider
    const slider = document.getElementById('weight-slider');
    slider.oninput = () => {
      if (this.selectedEdge < 0) return;
      const v = +slider.value;
      document.getElementById('weight-val').textContent = v.toFixed(2);
      const agent = this.pop.selectedAgent;
      if (agent) agent.net.setEdgeWeight(this.selectedEdge, v);
      this.drawBrain();
    };
    document.getElementById('btn-randomize-edge').onclick = () => {
      if (this.selectedEdge < 0) return;
      const v = (Math.random() * 2 - 1) * 1.2;
      this.pop.selectedAgent.net.setEdgeWeight(this.selectedEdge, v);
      slider.value = v;
      document.getElementById('weight-val').textContent = v.toFixed(2);
      this.drawBrain();
    };
    document.getElementById('btn-zero-edge').onclick = () => {
      if (this.selectedEdge < 0) return;
      this.pop.selectedAgent.net.setEdgeWeight(this.selectedEdge, 0);
      slider.value = 0;
      document.getElementById('weight-val').textContent = '0.00';
      this.drawBrain();
    };
  }

  toggleEditor() {
    const isFree = this.mode === 'free';
    document.getElementById('editor-panel').classList.toggle('hidden', !isFree);
    document.getElementById('editor-hint').style.display = isFree ? 'none' : 'block';
  }

  onBrainClick(e) {
    if (this.mode !== 'free') return;
    const rect = this.brainCanvas.getBoundingClientRect();
    const scaleX = this.brainCanvas.width / rect.width;
    const scaleY = this.brainCanvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    let best = -1, bestD = 12;
    for (const hb of this.edgeHitboxes) {
      // distance to line segment
      const d = distToSegment(mx, my, hb.x1, hb.y1, hb.x2, hb.y2);
      if (d < bestD) { bestD = d; best = hb.idx; }
    }
    this.selectedEdge = best;
    if (best >= 0) {
      const w = this.pop.selectedAgent.net.getEdgeWeight(best);
      document.getElementById('weight-slider').value = w;
      document.getElementById('weight-val').textContent = w.toFixed(2);
    }
    this.drawBrain();
  }

  drawBrain() {
    const ctx = this.bctx;
    const W = this.brainCanvas.width;
    const H = this.brainCanvas.height;
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    const agent = this.pop.selectedAgent;
    if (!agent) return;
    const net = agent.net;

    const layers = [INPUTS, HIDDEN, OUTPUTS];
    const xs = [36, 140, 244];
    const nodePos = [];

    for (let L = 0; L < 3; L++) {
      const n = layers[L];
      const pos = [];
      for (let i = 0; i < n; i++) {
        const y = 18 + (i + 0.5) * ((H - 36) / n);
        pos.push({ x: xs[L], y });
        ctx.beginPath();
        ctx.arc(xs[L], y, 5, 0, Math.PI * 2);
        ctx.fillStyle = L === 0 ? '#58a6ff' : L === 1 ? '#3fb950' : '#f778ba';
        ctx.fill();
      }
      nodePos.push(pos);
    }

    this.edgeHitboxes = [];
    // Input → Hidden
    for (let i = 0; i < INPUTS; i++) {
      for (let j = 0; j < HIDDEN; j++) {
        const idx = i * HIDDEN + j;
        const w = net.w[idx];
        const x1 = nodePos[0][i].x, y1 = nodePos[0][i].y;
        const x2 = nodePos[1][j].x, y2 = nodePos[1][j].y;
        this.drawEdge(ctx, x1, y1, x2, y2, w, idx === this.selectedEdge);
        this.edgeHitboxes.push({ x1, y1, x2, y2, idx });
      }
    }
    // Hidden → Output
    const base = INPUTS * HIDDEN + HIDDEN;
    for (let j = 0; j < HIDDEN; j++) {
      for (let k = 0; k < OUTPUTS; k++) {
        const idx = INPUTS * HIDDEN + j * OUTPUTS + k;
        const w = net.w[base + j * OUTPUTS + k];
        const x1 = nodePos[1][j].x, y1 = nodePos[1][j].y;
        const x2 = nodePos[2][k].x, y2 = nodePos[2][k].y;
        this.drawEdge(ctx, x1, y1, x2, y2, w, idx === this.selectedEdge);
        this.edgeHitboxes.push({ x1, y1, x2, y2, idx });
      }
    }

    ctx.fillStyle = '#8b949e';
    ctx.font = '10px sans-serif';
    ctx.fillText('In', 28, 12);
    ctx.fillText('Hidden', 118, 12);
    ctx.fillText('Out', 232, 12);
  }

  drawEdge(ctx, x1, y1, x2, y2, w, selected) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = w >= 0 ? '#3fb950' : '#f85149';
    ctx.globalAlpha = selected ? 0.95 : Math.min(0.55, 0.15 + Math.abs(w) * 0.35);
    ctx.lineWidth = selected ? 2.8 : Math.min(2.2, 0.4 + Math.abs(w) * 1.2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  update() {
    const st = this.pop.stats();
    document.getElementById('gen').textContent = st.gen;
    document.getElementById('best').textContent = st.best.toFixed(1);
    document.getElementById('avg').textContent = st.avg.toFixed(1);
    document.getElementById('alive').textContent = st.alive;
    document.getElementById('time').textContent = window.NeuralEv.simTime.toFixed(1);
    document.getElementById('hud-gen').textContent = st.gen;
    document.getElementById('hud-best').textContent = st.best.toFixed(1);

    const list = document.getElementById('pop-list');
    list.innerHTML = this.pop.agents.map((a, i) => {
      const cls = [
        i === this.pop.selected ? 'selected' : '',
        a.alive ? '' : 'dead'
      ].filter(Boolean).join(' ');
      return `<div class="pop-item ${cls}" data-i="${i}">#${String(i).padStart(2,'0')}  ${a.score.toFixed(1)}${a.alive ? '' : ' ✕'}</div>`;
    }).join('');

    list.querySelectorAll('.pop-item').forEach(el => {
      el.onclick = () => {
        this.pop.selected = +el.dataset.i;
        this.selectedEdge = -1;
        this.update();
      };
    });

    this.drawBrain();
  }
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-6) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
