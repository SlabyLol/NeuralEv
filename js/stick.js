/** NeuralEv – Grounded leg locomotion
 *  On ground: hip height comes only from leg length.
 *  Horizontal move only when a planted foot stays fixed and joints change.
 *  No upward force on ground → no flying.
 */

const GROUND_Y = 500;
const SCREEN_W = 960;
const SCREEN_H = 540;
const MARGIN = 18;

const THIGH_LEN = 36;
const SHIN_LEN = 32;
const TORSO_LEN = 48;
const ARM_LEN = 24;
const FOREARM_LEN = 20;
const HIP_OFFSET = 9;

class Stick {
  constructor(net) {
    this.net = net || new Net();
    this.reset();
  }

  reset() {
    this.a = [0.06, 0, 0.35, -0.28, 0.22, 0.18, 0.2, -0.2];
    this.av = [0, 0, 0, 0, 0, 0, 0, 0];

    const legs = this.computeLegs();
    const standH = Math.max(legs.footL.y, legs.footR.y);
    this.x = 160;
    this.y = GROUND_Y - standH;
    this.vx = 0;
    this.vy = 0;

    this.score = 0;
    this.alive = true;
    this.age = 0;
    this.energy = 160;
    this.maxX = this.x;
    this.maxHeight = 0;
    this.onGround = true;
    this.leftFootDown = true;
    this.rightFootDown = true;
    this.color = '#58a6ff';
    this.hitHelp = 0;
    this.hitDeath = false;
    this.airborne = false;

    this.prevFootL = { x: legs.footL.x, y: legs.footL.y };
    this.prevFootR = { x: legs.footR.x, y: legs.footR.y };
  }

  computeLegs() {
    const tL = this.a[2], tR = this.a[3];
    const sL = this.a[4], sR = this.a[5];

    const kLX = -HIP_OFFSET + Math.sin(tL) * THIGH_LEN;
    const kLY = Math.cos(tL) * THIGH_LEN;
    const fLX = kLX + Math.sin(tL + sL) * SHIN_LEN;
    const fLY = kLY + Math.cos(tL + sL) * SHIN_LEN;

    const kRX = HIP_OFFSET + Math.sin(tR) * THIGH_LEN;
    const kRY = Math.cos(tR) * THIGH_LEN;
    const fRX = kRX + Math.sin(tR + sR) * SHIN_LEN;
    const fRY = kRY + Math.cos(tR + sR) * SHIN_LEN;

    return {
      kneeL: { x: kLX, y: kLY },
      kneeR: { x: kRX, y: kRY },
      footL: { x: fLX, y: fLY },
      footR: { x: fRX, y: fRY }
    };
  }

  sensors(worldObjects) {
    const s = new Float32Array(INPUTS);
    for (let i = 0; i < 8; i++) s[i] = this.a[i] / Math.PI;
    s[8] = Math.tanh(this.vx * 0.15);
    s[9] = Math.tanh(this.vy * 0.15);
    s[10] = this.onGround ? 1 : -1;
    s[11] = (this.x / SCREEN_W) * 2 - 1;
    s[12] = this.leftFootDown ? 1 : -1;
    s[13] = this.rightFootDown ? 1 : -1;

    let nearHelp = 0, nearDeath = 0;
    if (worldObjects) {
      let bestH = 1e9, bestD = 1e9;
      for (const o of worldObjects) {
        if (!o.active) continue;
        const dx = o.x - this.x;
        const dist = Math.abs(dx) + 1;
        if (o.type === 'help' && dist < bestH) {
          bestH = dist;
          nearHelp = Math.tanh(dx / 90);
        }
        if ((o.type === 'death' || o.type === 'fall') && dist < bestD) {
          bestD = dist;
          nearDeath = Math.tanh(dx / 90);
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

    // --- 1. Network updates joint angles only ---
    const out = this.net.forward(this.sensors(worldObjects));
    const scale = [0.03, 0.015, 0.12, 0.12, 0.11, 0.11, 0.05, 0.05];
    for (let i = 0; i < 8; i++) {
      this.av[i] += out[i] * scale[i] * 60 * dt;
      this.av[i] *= 0.83;
      this.a[i] += this.av[i] * dt;
    }

    this.a[0] = clamp(this.a[0], -0.45, 0.45);
    this.a[1] = clamp(this.a[1], -0.2, 0.2);
    this.a[2] = clamp(this.a[2], -0.8, 1.0);
    this.a[3] = clamp(this.a[3], -0.8, 1.0);
    this.a[4] = clamp(this.a[4], 0.05, 1.3);
    this.a[5] = clamp(this.a[5], 0.05, 1.3);
    this.a[6] = clamp(this.a[6], -1.0, 1.0);
    this.a[7] = clamp(this.a[7], -1.0, 1.0);

    const legs = this.computeLegs();

    // Support surface
    let supportY = GROUND_Y;
    if (worldObjects) {
      for (const o of worldObjects) {
        if (!o.active || o.type !== 'platform') continue;
        const top = o.y - o.h / 2;
        if (this.x > o.x - o.w / 2 && this.x < o.x + o.w / 2) {
          const approxFoot = this.y + Math.max(legs.footL.y, legs.footR.y);
          if (approxFoot >= top - 8 && approxFoot <= top + 18) supportY = top;
        }
      }
    }

    // --- 2. Were feet on ground last frame? ---
    const wasL = (this.y + this.prevFootL.y) >= supportY - 5;
    const wasR = (this.y + this.prevFootR.y) >= supportY - 5;
    const wasGrounded = wasL || wasR;

    // --- 3. HORIZONTAL only from locked feet (NO vertical shift from legs) ---
    let shiftX = 0;
    let nPlant = 0;
    if (wasL) {
      shiftX -= (legs.footL.x - this.prevFootL.x);
      nPlant++;
    }
    if (wasR) {
      shiftX -= (legs.footR.x - this.prevFootR.x);
      nPlant++;
    }
    if (nPlant > 0) shiftX /= nPlant;

    if (wasGrounded && !this.airborne) {
      // Grounded walk: only slide horizontally from foot lock
      this.x += shiftX;
      this.vx = shiftX / Math.max(dt, 0.001) / 60;

      // Hip height FIXED by current leg geometry (whichever planted foot is lowest)
      // foot local y is distance below hip → hip = support - footLocalY
      let hipFromLegs = null;
      if (wasL) hipFromLegs = supportY - legs.footL.y;
      if (wasR) {
        const hR = supportY - legs.footR.y;
        hipFromLegs = hipFromLegs === null ? hR : Math.min(hipFromLegs, hR);
      }
      // min = the foot that is more extended sets a lower hip? 
      // Actually: larger foot.y means foot farther down → hip should be higher up (smaller y).
      // supportY - foot.y: larger foot.y → smaller hip y (higher on screen). Correct for standing tall.
      // When both planted, use the MAX foot.y (most extended) so both can reach ground:
      // hipY = supportY - max(footY of planted) keeps the longer leg's foot on ground;
      // the shorter leg's foot will be slightly above ground.
      let maxFootY = -Infinity;
      if (wasL) maxFootY = Math.max(maxFootY, legs.footL.y);
      if (wasR) maxFootY = Math.max(maxFootY, legs.footR.y);
      this.y = supportY - maxFootY;

      // CRITICAL: no upward velocity while grounded
      this.vy = 0;
      this.airborne = false;

      // Jump only in jump mode via strong extension impulse
      if (mode === 'jump') {
        const ext =
          Math.max(0, -this.av[2]) + Math.max(0, -this.av[3]) +
          Math.max(0, -this.av[4]) + Math.max(0, -this.av[5]);
        if (ext > 2.5) {
          this.vy = -Math.min(8, ext * 1.6);
          this.airborne = true;
          this.onGround = false;
          this.leftFootDown = false;
          this.rightFootDown = false;
        }
      }
    } else {
      // Airborne: gravity only, zero control
      this.airborne = true;
      this.vy += 0.85 * dt * 60; // strong gravity
      this.x += this.vx * dt * 60;
      this.y += this.vy * dt * 60;
      this.vx *= 0.997;

      // Land when lowest foot hits support
      const low = this.y + Math.max(legs.footL.y, legs.footR.y);
      if (low >= supportY && this.vy >= 0) {
        this.y = supportY - Math.max(legs.footL.y, legs.footR.y);
        this.vy = 0;
        this.airborne = false;
      }
    }

    // Contact flags for drawing / sensors
    const legs2 = this.computeLegs();
    this.leftFootDown = !this.airborne && (this.y + legs2.footL.y) >= supportY - 5;
    this.rightFootDown = !this.airborne && (this.y + legs2.footR.y) >= supportY - 5;
    this.onGround = this.leftFootDown || this.rightFootDown;

    this.prevFootL = { x: legs2.footL.x, y: legs2.footL.y };
    this.prevFootR = { x: legs2.footR.x, y: legs2.footR.y };

    // Bounds
    if (this.x < MARGIN) { this.x = MARGIN; this.vx = 0; }
    if (this.x > SCREEN_W - MARGIN) { this.x = SCREEN_W - MARGIN; this.vx = 0; }
    if (this.y < 40) { this.y = 40; this.vy = Math.max(0, this.vy); }
    if (this.y > SCREEN_H - 5) { this.y = SCREEN_H - 5; this.vy = 0; this.alive = false; }

    if (worldObjects) this.collideObjects(worldObjects);

    this.updateScore(mode);
    this.energy -= 0.018 * dt * 60;
    if (this.energy <= 0 || this.age > 28) this.alive = false;
    if (Math.abs(this.a[0]) > 0.6 && this.onGround) this.energy -= 0.1;
  }

  collideObjects(objs) {
    for (const o of objs) {
      if (!o.active) continue;
      const dx = this.x - o.x;
      const dy = (this.y + 20) - o.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (o.type === 'help' && dist < (o.r || 16) + 28) {
        this.score += 25;
        this.energy = Math.min(180, this.energy + 45);
        this.hitHelp++;
        o.active = false;
        o.respawnTimer = 4;
      }
      if (o.type === 'death' && dist < (o.r || 18) + 22) {
        this.alive = false;
        this.hitDeath = true;
      }
      if (o.type === 'fall' && dist < (o.r || 14) + 24) {
        this.alive = false;
        this.hitDeath = true;
      }
      if (o.type === 'spring' && dist < (o.r || 20) + 30 && this.vy >= -0.2) {
        this.vy = -9;
        this.airborne = true;
        this.onGround = false;
        this.leftFootDown = false;
        this.rightFootDown = false;
        this.score += 8;
      }
    }
  }

  updateScore(mode) {
    switch (mode) {
      case 'walk': {
        const progress = Math.max(0, this.x - 160);
        this.score = progress * 1.4;
        if (this.onGround) this.score += 0.35;
        if (this.leftFootDown !== this.rightFootDown) this.score += 0.25;
        if (this.x > this.maxX) this.maxX = this.x;
        break;
      }
      case 'balance':
        this.score = this.age * 3.5 - Math.abs(this.a[0]) * 12;
        break;
      case 'jump': {
        const h = GROUND_Y - (THIGH_LEN + SHIN_LEN) - this.y;
        if (h > this.maxHeight) this.maxHeight = h;
        this.score = this.maxHeight * 5 + this.age * 0.15;
        break;
      }
      case 'reach': {
        const d = Math.hypot(this.x - 800, this.y - (GROUND_Y - 140));
        this.score = Math.max(this.score, 700 - d);
        break;
      }
      case 'survive':
        this.score = this.age * 4 + this.hitHelp * 22;
        if (this.hitDeath) this.score *= 0.25;
        break;
      case 'free':
        this.score = this.age + Math.max(0, this.x - 100) * 0.12 + this.hitHelp * 15;
        break;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.alive ? 1 : 0.35;
    ctx.translate(this.x, this.y);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = this.alive ? this.color : '#484f58';
    ctx.lineWidth = 3.2;

    const lean = this.a[0];
    const tx = Math.sin(lean) * TORSO_LEN;
    const ty = -Math.cos(lean) * TORSO_LEN;

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(tx + Math.sin(lean) * 12, ty - Math.cos(lean) * 12, 11, 0, Math.PI * 2);
    ctx.stroke();

    const shX = tx * 0.5, shY = ty * 0.5;
    const arm = (side, ang) => {
      const ax = shX + side * 6;
      const elX = ax + Math.sin(ang + lean) * ARM_LEN;
      const elY = shY + Math.cos(ang + lean) * ARM_LEN;
      const hx = elX + Math.sin(ang + lean + 0.2) * FOREARM_LEN;
      const hy = elY + Math.cos(ang + lean + 0.2) * FOREARM_LEN;
      ctx.beginPath();
      ctx.moveTo(ax, shY);
      ctx.lineTo(elX, elY);
      ctx.lineTo(hx, hy);
      ctx.stroke();
    };
    arm(-1, this.a[6]);
    arm(1, this.a[7]);

    const legs = this.computeLegs();
    const leg = (knee, foot, side, down) => {
      ctx.beginPath();
      ctx.moveTo(side * HIP_OFFSET, 0);
      ctx.lineTo(knee.x, knee.y);
      ctx.lineTo(foot.x, foot.y);
      ctx.lineTo(foot.x + side * 11, foot.y + 1);
      ctx.stroke();
      if (down) {
        ctx.fillStyle = this.alive ? '#3fb950' : '#484f58';
        ctx.beginPath();
        ctx.arc(foot.x, foot.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    leg(legs.kneeL, legs.footL, -1, this.leftFootDown);
    leg(legs.kneeR, legs.footR, 1, this.rightFootDown);

    ctx.restore();
  }
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
