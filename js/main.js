/** NeuralEv – Main loop & canvas rendering */

window.NeuralEv = {
  running: false,
  speed: 1,
  mutationRate: 0.07,
  simTime: 0
};

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const pop = new Population();
const ui = new UI(pop);

// Click canvas → select nearest agent
canvas.addEventListener('click', e => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top) * scaleY;

  let best = 0, bestD = Infinity;
  pop.agents.forEach((a, i) => {
    const d = (a.x - mx) ** 2 + (a.y - my) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  });
  pop.selected = best;
  ui.selectedEdge = -1;
  ui.update();
});

function drawScene() {
  ctx.fillStyle = '#010409';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ground
  ctx.strokeStyle = '#21262d';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(canvas.width, GROUND_Y);
  ctx.stroke();

  // subtle grid
  ctx.strokeStyle = '#161b22';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, GROUND_Y);
    ctx.stroke();
  }

  // target for reach mode
  if (ui.mode === 'reach') {
    ctx.fillStyle = '#f778ba';
    ctx.beginPath();
    ctx.arc(780, GROUND_Y - 130, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f778ba';
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(780, GROUND_Y - 130, 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // draw agents (selected on top)
  pop.agents.forEach((a, i) => {
    if (i !== pop.selected) a.draw(ctx, 0.28, false);
  });
  if (pop.selectedAgent) {
    pop.selectedAgent.draw(ctx, 1, true);
  }
}

let last = performance.now();
let frame = 0;

function loop(now) {
  const rawDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const dt = rawDt * window.NeuralEv.speed;

  if (window.NeuralEv.running) {
    window.NeuralEv.simTime += dt;
    const alive = pop.step(dt, ui.mode);
    if (alive === 0 || window.NeuralEv.simTime > 18) {
      pop.nextGeneration(window.NeuralEv.mutationRate);
      window.NeuralEv.simTime = 0;
    }
    frame++;
    if (frame % 2 === 0) ui.update();
  }

  drawScene();
  requestAnimationFrame(loop);
}

ui.toggleEditor();
ui.update();
requestAnimationFrame(loop);
