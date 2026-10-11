/** NeuralEv – Stickman with real leg-driven locomotion (no flying) */

const GROUND_Y = 500;
const SCREEN_W = 960;
const SCREEN_H = 540;
const MARGIN = 18;

// Segment lengths (pixels)
const THIGH_LEN = 34;
const SHIN_LEN = 30;
const TORSO_LEN = 46;
const ARM_LEN = 24;
const FOREARM_LEN = 20;
const HIP_OFFSET = 8;

class Stick {
  constructor(net) {
    this.net = net || new Net();
    this.reset();
  }

  reset() {
    // Hip position (body reference point)
    this.x = 140;
    this.y = GROUND_Y - (THIGH_LEN + SHIN_LEN) + 4;
    this.vx = 0;
    this.vy = 0;

    // Joint angles in radians
    // 0 torso lean, 1 unused/hip tilt, 2 thighL, 3 thighR, 4 shinL, 5 shinR, 6 armL, 7 armR
    // thigh: 0 = straight down, positive = forward (swing ahead)
    // shin: 0 = aligned with thigh, positive = bend knee
    this.a = [0.05, 0, 0.35, -0.25, 0.2, 0.15, 0.3, -0.3];
    this.av = [0, 0, 0, 0, 0, 0, 0, 0];

    this.score = 0;
    this.alive = true;
    this.age = 0;
    this.energy = 150;
    this.maxX = this.x;
    this.maxHeight = 0;
    this.onGround = true;
    this.leftFootDown = true;
    this.rightFootDown = true;
    this.color = '#58a6ff';
    this.hitHelp = 0;
    this.hitDeath = false;

    this.footL = { x: 0, y: 0 };
    this.footR = { x: 0, y: 0 };
  }

  /** Compute knee & foot positions from current joint angles (relative to hip) */
  computeLegs() {
    const thighL = this.a[2];
    const thighR = this.a[3];
    const shinL = this.a[4];
    const shinR = this.a[5];

    const kneeLX = -HIP_OFFSET + Math.sin(thighL) * THIGH_LEN;
    const kneeLY = Math.cos(thighL) * THIGH_LEN;
    const footLX = kneeLX + Math.sin(thighL + shinL) * SHIN_LEN;
    const footLY = kneeLY + Math.cos(thighL + shinL) * SHIN_LEN;

    const kneeRX = HIP_OFFSET + Math.sin(thighR) * THIGH_LEN;
    const kneeRY = Math.cos(thighR) * THIGH_LEN;
    const footRX = kneeRX + Math.sin(thighR + shinR) * SHIN_LEN;
    const footRY = kneeRY + Math.cos(thighR + shinR) * SHIN_LEN;

    return {
      kneeL: { x: kneeLX, y: kneeLY },
      kneeR: { x: kneeRX, y: kneeRY },
      footL: { x: footLX, y: footLY },
      footR: { x: footRX, y: footRY }
    };
  }

  sensors(worldObjects) {
    const s = new Float32Array(INPUTS);
    for (let i = 0; i < 8; i++) s[i] = this.a[i] / Math.PI;
    s[8] = Math.tanh(this.vx * 0.1);
    s[9] = Math.tanh(this.vy * 0.1);
    s[10] = this.onGround ? 1 : -1;
    s[11] = (this.x / SCREEN_W) * 2 - 1;
    s[12] = this.leftFootDown ? 1 : -1;
    s[13] = this.rightFootDown ? 1 : -1;

    let nearHelp = 0, nearDeath = 0;
    if (worldObjects && worldObjects.length) {
      let bestH = 1e9, bestD = 1e9;
      for (const o of worldObjects) {
        if (!o.active) continue;
        const dx = o.x - this.x;
        const dist = Math.abs(dx) + Math.abs(o.y - this.y) * 0.5 + 1;
        if (o.type === 'help' && dist < bestH) {
          bestH = dist;
          nearHelp = Math.tanh(dx / 100);
        }
        if ((o.type === 'death' || o.type === 'fall') && dist < bestD) {
          bestD = dist;
          nearDeath = Math.tanh(dx / 100);
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

    // Joint torques – stronger on legs
    const scale = [0.04, 0.02, 0.11, 0.11, 0.10, 0.10, 0.06, 0.06];
    const damp = 0.86;
    for (let i = 0; i < 8; i++) {
      this.av[i] += out[i] * scale[i] * 60 * dt;
      this.av[i] *= damp;
      this.a[i] += this.av[i] * dt;
    }

    // Joint limits – walkable range only
    this.a[0] = clamp(this.a[0], -0.55, 0.55);
    this.a[1] = clamp(this.a[1], -0.3, 0.3);
    this.a[2] = clamp(this.a[2], -0.9, 1.1);
    this.a[3] = clamp(this.a[3], -0.9, 1.1);
    this.a[4] = clamp(this.a[4], 0.0, 1.4);   // knee bends one way
    this.a[5] = clamp(this.a[5], 0.0, 1.4);
    this.a[6] = clamp(this.a[6], -1.2, 1.2);
    this.a[7] = clamp(this.a[7], -1.2, 1.2);

    for (let i = 0; i < 8; i++) {
      if (Math.abs(this.a[i]) > 0.95) this.av[i] *= 0.5;
    }

    const legs = this.computeLegs();
    const wFootL = { x: this.x + legs.footL.x, y: this.y + legs.footL.y };
    const wFootR = { x: this.x + legs.footR.x, y: this.y + legs.footR.y };
    this.footL = wFootL;
    this.footR = wFootR;

    const groundLevel = GROUND_Y;
    this.leftFootDown = wFootL.y >= groundLevel - 3;
    this.rightFootDown = wFootR.y >= groundLevel - 3;

    // Platforms
    let onPlatform = false;
    let platformY = groundLevel;
    if (worldObjects) {
      for (const o of worldObjects) {
        if (!o.active || o.type !== 'platform') continue;
        const top = o.y - o.h / 2;
        for (const foot of [wFootL, wFootR]) {
          if (foot.x > o.x - o.w / 2 && foot.x < o.x + o.w / 2) {
            if (foot.y >= top - 4 && foot.y <= top + 12) {
              onPlatform = true;
              platformY = top;
              if (foot === wFootL) this.leftFootDown = true;
              if (foot === wFootR) this.rightFootDown = true;
            }
          }
        }
      }
    }

    this.onGround = this.leftFootDown || this.rightFootDown;

    // === LEG-DRIVEN HORIZONTAL FORCE ===
    // Only planted feet create push. Swinging stance leg backward → body forward.
    let pushX = 0;
    const pushGain = 2.8;

    if (this.leftFootDown) {
      pushX += -this.av[2] * pushGain;
      pushX += this.av[4] * 0.6;
    }
    if (this.rightFootDown) {
      pushX += -this.av[3] * pushGain;
      pushX += this.av[5] * 0.6;
    }

    // Almost no air control (no flying / air-strafing)
    if (!this.onGround) pushX *= 0.08;

    this.vx += pushX * dt * 60;
    if (this.onGround) this.vx *= 0.90;
    else this.vx *= 0.995;
    this.vx = clamp(this.vx, -7, 7);

    // === VERTICAL: strong gravity, no free flying ===
    this.vy += 0.55 * dt * 60;

    // Jump only via strong leg extension while grounded + jump mode
    if (this.onGround && mode === 'jump') {
      const extL = Math.max(0, -this.av[2] - this.av[4]);
      const extR = Math.max(0, -this.av[3] - this.av[5]);
      const totalExt = extL + extR;
      if (totalExt > 1.8) {
        this.vy = -Math.min(9, totalExt * 2.2);
        this.onGround = false;
        this.leftFootDown = false;
        this.rightFootDown = false;
      }
    }

    this.x += this.vx * dt * 60;
    this.y += this.vy * dt * 60;

    // Keep lowest foot on support surface
    const legs2 = this.computeLegs();
    const lowestFoot = Math.max(this.y + legs2.footL.y, this.y + legs2.footR.y);
    const supportY = onPlatform ? platformY : groundLevel;

    if (lowestFoot > supportY) {
      this.y -= (lowestFoot - supportY);
      if (this.vy > 0) this.vy = 0;
      this.onGround = true;
    }

    const legs3 = this.computeLegs();
    this.leftFootDown = (this.y + legs3.footL.y) >= supportY - 4;
    this.rightFootDown = (this.y + legs3.footR.y) >= supportY - 4;
    this.onGround = this.leftFootDown || this.rightFootDown;

    // Screen bounds
    if (this.x < MARGIN) { this.x = MARGIN; this.vx = Math.max(0, this.vx) * 0.2; }
    if (this.x > SCREEN_W - MARGIN) { this.x = SCREEN_W - MARGIN; this.vx = Math.min(0, this.vx) * 0.2; }
    if (this.y < 40) { this.y = 40; this.vy = Math.max(0, this.vy); }
    if (this.y > SCREEN_H - 5) { this.y = SCREEN_H - 5; this.vy = 0; this.alive = false; }

    if (worldObjects) this.collideObjects(worldObjects);

    this.updateScore(mode);
    this.energy -= 0.02 * dt * 60;
    if (this.energy <= 0 || this.age > 26) this.alive = false;
    if (Math.abs(this.a[0]) > 0.7 && this.onGround) this.energy -= 0.08;
  }

  collideObjects(objs) {
    for (const o of objs) {
      if (!o.active) continue;
      const dx = this.x - o.x;
      const dy = (this.y + 25) - o.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (o.type === 'help' && dist < (o.r || 16) + 28) {
        this.score += 25;
        this.energy = Math.min(170, this.energy + 45);
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
      if (o.type === 'spring' && dist < (o.r || 20) + 30 && this.vy >= -0.5) {
        this.vy = -10;
        this.onGround = false;
        this.score += 8;
      }
    }
  }

  updateScore(mode) {
    switch (mode) {
      case 'walk': {
        const progress = Math.max(0, this.x - 140);
        this.score = progress * 1.3;
        if (this.onGround) this.score += 0.25;
        // encourage alternating steps (real walk gait)
        if (this.leftFootDown !== this.rightFootDown) this.score += 0.15;
        if (this.x > this.maxX) this.maxX = this.x;
        break;
      }
      case 'balance':
        this.score = this.age * 3.5 - Math.abs(this.a[0]) * 10 - Math.abs(this.vx) * 0.4;
        break;
      case 'jump': {
        const h = GROUND_Y - (THIGH_LEN + SHIN_LEN) - this.y;
        if (h > this.maxHeight) this.maxHeight = h;
        this.score = this.maxHeight * 5 + this.age * 0.2;
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
    const torsoTopX = Math.sin(lean) * TORSO_LEN;
    const torsoTopY = -Math.cos(lean) * TORSO_LEN;

    // Torso
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(torsoTopX, torsoTopY);
    ctx.stroke();

    // Head
    ctx.beginPath();
    ctx.arc(
      torsoTopX + Math.sin(lean) * 12,
      torsoTopY - Math.cos(lean) * 12,
      11, 0, Math.PI * 2
    );
    ctx.stroke();

    // Arms
    const shX = torsoTopX * 0.5;
    const shY = torsoTopY * 0.5;
    const drawArm = (side, ang) => {
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
    drawArm(-1, this.a[6]);
    drawArm(1, this.a[7]);

    // Legs from real kinematics
    const legs = this.computeLegs();

    const drawLeg = (knee, foot, side) => {
      ctx.beginPath();
      ctx.moveTo(side * HIP_OFFSET, 0);
      ctx.lineTo(knee.x, knee.y);
      ctx.lineTo(foot.x, foot.y);
      ctx.lineTo(foot.x + side * 10, foot.y + 1);
      ctx.stroke();

      // green dot = foot currently on ground
      if ((side < 0 && this.leftFootDown) || (side > 0 && this.rightFootDown)) {
        ctx.fillStyle = this.alive ? '#3fb950' : '#484f58';
        ctx.beginPath();
        ctx.arc(foot.x, foot.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    drawLeg(legs.kneeL, legs.footL, -1);
    drawLeg(legs.kneeR, legs.footR, 1);

    ctx.restore();
  }
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
