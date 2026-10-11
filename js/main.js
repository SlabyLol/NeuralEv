/** NeuralEv – Main loop, canvas, object placement */

window.NeuralEv = {
  running: false,
  speed: 1,
  mutationRate: 0.07,
  simTime: 0
};

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const pop = new Population();
const objMan = new ObjectManager();
const ui = new UI(pop, objMan);

function canvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height)
  };
}

// Left click: place object OR (if no tool) nothing special
canvas.addEventListener('click', e => {
  const { x, y } = canvasPos(e);
  if (objMan.placeType) {
    objMan.add(objMan.placeType, x, y);
    ui.update();
  }
});

// Right click: remove object
canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  const { x, y } = canvasPos(e);
  if (objMan.removeAt(x, y)) ui.update();
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

  // grid
  ctx.strokeStyle = '#12161c';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, GROUND_Y);
    ctx.stroke();
  }

  // reach target
  if (ui.mode === 'reach') {
    ctx.fillStyle = '#f778ba';
    ctx.beginPath();
    ctx.arc(800, GROUND_Y - 140, 12, 0, Math.PI * 2);
    ctx.fill();
  }

  objMan.draw(ctx);

  if (pop.current) pop.current.draw(ctx);

  // placement preview hint
  if (objMan.placeType) {
    ctx.fillStyle = 'rgba(88,166,255,0.15)';
    ctx.font = '13px sans-serif';
    ctx.fillText('Click to place: ' + objMan.placeType.toUpperCase() + '  (right-click removes)', 12, canvas.height - 12);
  }
}

let last = performance.now();
let frame = 0;
let deathCooldown = 0;

function loop(now) {
  const rawDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const dt = rawDt * window.NeuralEv.speed;

  if (window.NeuralEv.running) {
    window.NeuralEv.simTime += dt;
    objMan.update(dt);

    const alive = pop.step(dt, ui.mode, objMan.list);

    if (!alive) {
      deathCooldown += dt;
      // short pause so you see the death, then next stickman
      if (deathCooldown > 0.45) {
        deathCooldown = 0;
        pop.onDeath(window.NeuralEv.mutationRate);
        objMan.resetFalls();
        window.NeuralEv.simTime = 0;
      }
    } else {
      deathCooldown = 0;
      // time limit also ends trial
      if (window.NeuralEv.simTime > 20) {
        pop.current.alive = false;
      }
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
