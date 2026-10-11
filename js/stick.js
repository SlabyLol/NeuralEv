/** NeuralEv – Improved stick figure with stable multi-segment physics + screen bounds */

const GROUND_Y = 500;
const SCREEN_W = 960;
const SCREEN_H = 540;
const MARGIN = 20;

class Stick {
  constructor(net) {
    this.net = net || new Net();
    this.reset();
  }

  reset() {
    this.x = 140 + Math.random() * 40;
    this.y = GROUND_Y - 95;
    this.vx = 0;
    this.vy = 0;
    // angles (rad): torso lean, hip, thighL, thighR, shinL, shinR, armL, armR
    this.a = [0, 0, 0.25, -0.25, 0.15, -0.15, 0.4, -0.4];
    this.av = [0, 0, 0, 0, 0, 0, 0, 0];
    this.score = 0;
    this.alive = true;
    this.age = 0;
    this.energy = 120;
    this.maxX = this.x;
    this.maxHeight = 0;
    this.onGround = true;
    this.color = `hsl(${200 + Math.random() * 40}, 70%, 60%)`;
  }

  sensors() {
    const s = new Float32Array(INPUTS);
    // 8 joint angles normalized
    for (let i = 0; i < 8; i++) {
      s[i] = this.a[i] / Math.PI;
    }
    // 4 useful velocities / state
    s[8] = Math.tanh(this.vx * 0.08);
    s[9] = Math.tanh(this.vy * 0.08);
    s[10] = this.onGround ? 1 : -1;
    s[11] = (this.x / SCREEN_W) * 2 - 1;          // horizontal position
    s[12] = ((GROUND_Y - this.y) / 200) * 2 - 1;  // height above ground
    s[13] = Math.tanh(this.av[0] * 0.5);          // torso angular vel
    return s;
  }

  step(dt, mode) {
    if (!this.alive) return;
    this.age += dt;

    const out = this.net.forward(this.sensors());

    // Apply torques with strong damping → prevents wild “fighting” oscillations
    const torqueScale = 0.09 * 60;
    const damp = 0.88;
    for (let i = 0; i < 8; i++) {
      this.av[i] += out[i] * torqueScale * dt;
      this.av[i] *= damp;
      this.a[i] += this.av[i] * dt;
      // soft joint limits
      const lim = i < 2 ? 0.9 : 1.6;
      if (this.a[i] > lim) { this.a[i] = lim; this.av[i] *= 0.3; }
      if (this.a[i] < -lim) { this.a[i] = -lim; this.av[i] *= 0.3; }
    }

    // Body motion derived from leg phase (stable walking gait bias)
    const legDrive = Math.sin(this.a[2]) - Math.sin(this.a[3]);
    const push = legDrive * 1.8 + this.av[2] * 0.15 - this.av[3] * 0.15;
    this.vx += push * 0.55 * dt * 60;
    this.vx *= 0.965; // friction

    // Vertical: gravity + leg extension
    const extension = -(this.a[2] + this.a[3] + this.a[4] + this.a[5]) * 0.35;
    this.vy += extension * 0.25 * dt * 60;
    this.vy += 0.42 * dt * 60; // gravity
    this.vy *= 0.995;

    this.x += this.vx * dt * 60;
    this.y += this.vy * dt * 60;

    // Ground collision
    const footY = this.y + 70;
    if (footY >= GROUND_Y) {
      this.y = GROUND_Y - 70;
      if (this.vy > 0) this.vy = 0;
      this.onGround = true;
      // small bounce kill
      this.vx *= 0.92;
    } else {
      this.onGround = false;
    }

    // === SCREEN BOUNDS – cannot leave the canvas ===
    if (this.x < MARGIN) {
      this.x = MARGIN;
      this.vx = Math.abs(this.vx) * 0.3;
    }
    if (this.x > SCREEN_W - MARGIN) {
      this.x = SCREEN_W - MARGIN;
      this.vx = -Math.abs(this.vx) * 0.3;
    }
    if (this.y < 40) {
      this.y = 40;
      this.vy = Math.max(0, this.vy);
    }
    if (this.y > SCREEN_H - 10) {
      this.y = SCREEN_H - 10;
      this.vy = 0;
      this.alive = false;
    }

    this.updateScore(mode);
    this.energy -= 0.025 * dt * 60;

    // Death
    if (this.energy <= 0 || this.age > 22) this.alive = false;
    // fall over too much
    if (Math.abs(this.a[0]) > 1.3 && this.onGround) this.energy -= 0.15;
  }

  updateScore(mode) {
    switch (mode) {
      case 'walk':
        this.score = Math.max(0, this.x - 140) * 1.2;
        if (this.onGround) this.score += 0.4;
        // reward smooth motion (punish high angular velocity)
        let jerk = 0;
        for (let i = 0; i < 8; i++) jerk += Math.abs(this.av[i]);
        this.score -= jerk * 0.08;
        if (this.x > this.maxX) this.maxX = this.x;
        break;
      case 'balance':
        this.score = this.age * 3 - Math.abs(this.a[0]) * 8 - Math.abs(this.vx) * 0.5;
        break;
      case 'jump':
        const h = GROUND_Y - 70 - this.y;
        if (h > this.maxHeight) this.maxHeight = h;
        this.score = this.maxHeight * 4 + this.age * 0.4;
        break;
      case 'reach': {
        const tx = 780, ty = GROUND_Y - 130;
        const dx = this.x - tx, dy = this.y - ty;
        this.score = 600 - Math.sqrt(dx * dx + dy * dy);
        break;
      }
      case 'dance':
        this.score = Math.abs(Math.sin(this.age * 2.5) * this.a[6]) * 12
                   + Math.abs(Math.cos(this.age * 2.2) * this.a[7]) * 12
                   + this.age * 0.8;
        break;
      case 'climb':
        this.score = (GROUND_Y - 70 - this.y) * 2.5 + this.age * 0.5;
        break;
      case 'free':
        this.score = this.age + Math.max(0, this.x - 100) * 0.1;
        break;
    }
  }

  draw(ctx, alpha = 1, highlight = false) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, this.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const col = highlight ? '#3fb950' : this.color;
    ctx.strokeStyle = this.alive ? col : '#484f58';
    ctx.lineWidth = highlight ? 3.5 : 2.8;

    // Torso
    const lean = this.a[0];
    const torsoTopX = Math.sin(lean) * 48;
    const torsoTopY = -Math.cos(lean) * 48;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(torsoTopX, torsoTopY);
    ctx.stroke();

    // Head
    ctx.beginPath();
    ctx.arc(torsoTopX + Math.sin(lean) * 14, torsoTopY - Math.cos(lean) * 14, 11, 0, Math.PI * 2);
    ctx.stroke();

    // Arms
    const shoulderX = torsoTopX * 0.55;
    const shoulderY = torsoTopY * 0.55;
    const drawArm = (side, ang) => {
      const ax = shoulderX + side * 8;
      const ay = shoulderY;
      const elX = ax + Math.sin(ang + lean) * 26;
      const elY = ay + Math.cos(ang + lean) * 26;
      const handX = elX + Math.sin(ang + lean + 0.3) * 22;
      const handY = elY + Math.cos(ang + lean + 0.3) * 22;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(elX, elY);
      ctx.lineTo(handX, handY);
      ctx.stroke();
    };
    drawArm(-1, this.a[6]);
    drawArm(1, this.a[7]);

    // Legs (thigh + shin)
    const drawLeg = (side, thighA, shinA) => {
      const hipX = side * 7;
      const kneeX = hipX + Math.sin(thighA) * 32;
      const kneeY = Math.cos(thighA) * 32;
      const footX = kneeX + Math.sin(thighA + shinA) * 28;
      const footY = kneeY + Math.cos(thighA + shinA) * 28;
      ctx.beginPath();
      ctx.moveTo(hipX, 0);
      ctx.lineTo(kneeX, kneeY);
      ctx.lineTo(footX, footY);
      ctx.stroke();
      // small foot
      ctx.beginPath();
      ctx.moveTo(footX, footY);
      ctx.lineTo(footX + side * 10, footY + 2);
      ctx.stroke();
    };
    drawLeg(-1, this.a[2], this.a[4]);
    drawLeg(1, this.a[3], this.a[5]);

    ctx.restore();
  }
}
