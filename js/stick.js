/** NeuralEv – Single stickman with stable physics + screen bounds */

const GROUND_Y = 500;
const SCREEN_W = 960;
const SCREEN_H = 540;
const MARGIN = 18;

class Stick {
  constructor(net) {
    this.net = net || new Net();
    this.reset();
  }

  reset() {
    this.x = 120;
    this.y = GROUND_Y - 95;
    this.vx = 0;
    this.vy = 0;
    // torso, hip, thighL, thighR, shinL, shinR, armL, armR
    this.a = [0, 0, 0.2, -0.2, 0.1, -0.1, 0.35, -0.35];
    this.av = [0, 0, 0, 0, 0, 0, 0, 0];
    this.score = 0;
    this.alive = true;
    this.age = 0;
    this.energy = 140;
    this.maxX = this.x;
    this.maxHeight = 0;
    this.onGround = true;
    this.color = '#58a6ff';
    this.hitHelp = 0;
    this.hitDeath = false;
  }

  sensors(worldObjects) {
    const s = new Float32Array(INPUTS);
    for (let i = 0; i < 8; i++) s[i] = this.a[i] / Math.PI;
    s[8] = Math.tanh(this.vx * 0.08);
    s[9] = Math.tanh(this.vy * 0.08);
    s[10] = this.onGround ? 1 : -1;
    s[11] = (this.x / SCREEN_W) * 2 - 1;
    s[12] = ((GROUND_Y - this.y) / 200) * 2 - 1;
    s[13] = Math.tanh(this.av[0] * 0.5);

    // nearest help & nearest death (normalized direction)
    let nearHelp = 0, nearDeath = 0;
    if (worldObjects && worldObjects.length) {
      let bestH = 1e9, bestD = 1e9;
      for (const o of worldObjects) {
        if (!o.active) continue;
        const dx = o.x - this.x;
        const dy = o.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 1;
        if (o.type === 'help' && dist < bestH) {
          bestH = dist;
          nearHelp = Math.tanh(dx / 120);
        }
        if ((o.type === 'death' || o.type === 'fall') && dist < bestD) {
          bestD = dist;
          nearDeath = Math.tanh(dx / 120);
        }
      }
    }
    s[14] = nearHelp;
    s[15] = nearDeath;
    return s;
  }

  step(dt, mode, worldObjects) {
    if (!this.alive) return;
    this.age += dt;

    const out = this.net.forward(this.sensors(worldObjects));

    const torqueScale = 0.09 * 60;
    const damp = 0.88;
    for (let i = 0; i < 8; i++) {
      this.av[i] += out[i] * torqueScale * dt;
      this.av[i] *= damp;
      this.a[i] += this.av[i] * dt;
      const lim = i < 2 ? 0.9 : 1.55;
      if (this.a[i] > lim) { this.a[i] = lim; this.av[i] *= 0.25; }
      if (this.a[i] < -lim) { this.a[i] = -lim; this.av[i] *= 0.25; }
    }

    const legDrive = Math.sin(this.a[2]) - Math.sin(this.a[3]);
    const push = legDrive * 1.7 + this.av[2] * 0.12 - this.av[3] * 0.12;
    this.vx += push * 0.55 * dt * 60;
    this.vx *= 0.965;

    const extension = -(this.a[2] + this.a[3] + this.a[4] + this.a[5]) * 0.35;
    this.vy += extension * 0.25 * dt * 60;
    this.vy += 0.42 * dt * 60;
    this.vy *= 0.995;

    this.x += this.vx * dt * 60;
    this.y += this.vy * dt * 60;

    // Platform support
    this.onGround = false;
    if (worldObjects) {
      for (const o of worldObjects) {
        if (!o.active || o.type !== 'platform') continue;
        if (this.x > o.x - o.w / 2 && this.x < o.x + o.w / 2) {
          const top = o.y - o.h / 2;
          if (this.y + 70 >= top && this.y + 70 <= top + 14 && this.vy >= 0) {
            this.y = top - 70;
            this.vy = 0;
            this.onGround = true;
            this.vx *= 0.94;
          }
        }
      }
    }

    // Ground
    if (this.y + 70 >= GROUND_Y) {
      this.y = GROUND_Y - 70;
      if (this.vy > 0) this.vy = 0;
      this.onGround = true;
      this.vx *= 0.92;
    }

    // Screen bounds – cannot leave
    if (this.x < MARGIN) { this.x = MARGIN; this.vx = Math.abs(this.vx) * 0.25; }
    if (this.x > SCREEN_W - MARGIN) { this.x = SCREEN_W - MARGIN; this.vx = -Math.abs(this.vx) * 0.25; }
    if (this.y < 30) { this.y = 30; this.vy = Math.max(0, this.vy); }
    if (this.y > SCREEN_H - 5) { this.y = SCREEN_H - 5; this.vy = 0; this.alive = false; }

    // Interact with objects
    if (worldObjects) this.collideObjects(worldObjects);

    this.updateScore(mode);
    this.energy -= 0.022 * dt * 60;
    if (this.energy <= 0 || this.age > 24) this.alive = false;
    if (Math.abs(this.a[0]) > 1.35 && this.onGround) this.energy -= 0.12;
  }

  collideObjects(objs) {
    for (const o of objs) {
      if (!o.active) continue;
      const dx = this.x - o.x;
      const dy = (this.y + 20) - o.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (o.type === 'help' && dist < o.r + 25) {
        this.score += 25;
        this.energy = Math.min(160, this.energy + 40);
        this.hitHelp++;
        o.active = false; // one-time pickup
        o.respawnTimer = 4;
      }
      if (o.type === 'death' && dist < o.r + 20) {
        this.alive = false;
        this.hitDeath = true;
      }
      if (o.type === 'fall' && dist < o.r + 22) {
        this.alive = false;
        this.hitDeath = true;
      }
      if (o.type === 'spring' && dist < o.r + 28 && this.vy >= -1) {
        this.vy = -11;
        this.score += 8;
      }
    }
  }

  updateScore(mode) {
    switch (mode) {
      case 'walk':
        this.score = Math.max(this.score, Math.max(0, this.x - 120) * 1.15);
        if (this.onGround) this.score += 0.15;
        break;
      case 'balance':
        this.score = this.age * 3 - Math.abs(this.a[0]) * 8;
        break;
      case 'jump': {
        const h = GROUND_Y - 70 - this.y;
        if (h > this.maxHeight) this.maxHeight = h;
        this.score = this.maxHeight * 4 + this.age * 0.3;
        break;
      }
      case 'reach': {
        const tx = 800, ty = GROUND_Y - 140;
        const d = Math.hypot(this.x - tx, this.y - ty);
        this.score = Math.max(this.score, 700 - d);
        break;
      }
      case 'survive':
        this.score = this.age * 4 + this.hitHelp * 20;
        if (this.hitDeath) this.score *= 0.3;
        break;
      case 'free':
        this.score = this.age + Math.max(0, this.x - 100) * 0.1 + this.hitHelp * 15;
        break;
    }
  }

  draw(ctx) {
    if (!this.alive && this.age < 0.05) return;
    ctx.save();
    ctx.globalAlpha = this.alive ? 1 : 0.35;
    ctx.translate(this.x, this.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = this.alive ? this.color : '#484f58';
    ctx.lineWidth = 3;

    const lean = this.a[0];
    const tx = Math.sin(lean) * 48;
    const ty = -Math.cos(lean) * 48;

    // torso
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    // head
    ctx.beginPath();
    ctx.arc(tx + Math.sin(lean) * 13, ty - Math.cos(lean) * 13, 11, 0, Math.PI * 2);
    ctx.stroke();

    // arms
    const sx = tx * 0.55, sy = ty * 0.55;
    const arm = (side, ang) => {
      const ax = sx + side * 7;
      const elX = ax + Math.sin(ang + lean) * 26;
      const elY = sy + Math.cos(ang + lean) * 26;
      const hx = elX + Math.sin(ang + lean + 0.25) * 20;
      const hy = elY + Math.cos(ang + lean + 0.25) * 20;
      ctx.beginPath();
      ctx.moveTo(ax, sy);
      ctx.lineTo(elX, elY);
      ctx.lineTo(hx, hy);
      ctx.stroke();
    };
    arm(-1, this.a[6]);
    arm(1, this.a[7]);

    // legs
    const leg = (side, thigh, shin) => {
      const hx = side * 7;
      const kx = hx + Math.sin(thigh) * 32;
      const ky = Math.cos(thigh) * 32;
      const fx = kx + Math.sin(thigh + shin) * 28;
      const fy = ky + Math.cos(thigh + shin) * 28;
      ctx.beginPath();
      ctx.moveTo(hx, 0);
      ctx.lineTo(kx, ky);
      ctx.lineTo(fx, fy);
      ctx.lineTo(fx + side * 9, fy + 2);
      ctx.stroke();
    };
    leg(-1, this.a[2], this.a[4]);
    leg(1, this.a[3], this.a[5]);

    ctx.restore();
  }
}
