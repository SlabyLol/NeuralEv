/** NeuralEv – Locked-foot locomotion
 *  Body moves ONLY because a planted foot stays fixed on the ground
 *  while the joints change. No flying, no free sliding.
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
    this.x = 160;
    this.y = GROUND_Y - (THIGH_LEN + SHIN_LEN);
    this.vx = 0;
    this.vy = 0;

    // 0 torso, 1 spare, 2 thighL, 3 thighR, 4 shinL, 5 shinR, 6 armL, 7 armR
    // thigh 0 = straight down; + = swing forward
    // shin 0 = straight; + = bend knee
    this.a = [0.08, 0, 0.4, -0.3, 0.25, 0.2, 0.25, -0.25];
    this.av = [0, 0, 0, 0, 0, 0, 0, 0];

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

    // previous local foot positions (for locked-foot delta)
    const legs = this.computeLegs();
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
    s[8] = Math.tanh(this.vx * 0.12);
    s[9] = Math.tanh(this.vy * 0.12);
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

    // 1) Network moves the joints
    const out = this.net.forward(this.sensors(worldObjects));
    const scale = [0.035, 0.02, 0.13, 0.13, 0.12, 0.12, 0.055, 0.055];
    const damp = 0.84;
    for (let i = 0; i < 8; i++) {
      this.av[i] += out[i] * scale[i] * 60 * dt;
      this.av[i] *= damp;
      this.a[i] += this.av[i] * dt;
    }

    // Limits – realistic walking range
    this.a[0] = clamp(this.a[0], -0.5, 0.5);
    this.a[1] = clamp(this.a[1], -0.25, 0.25);
    this.a[2] = clamp(this.a[2], -0.85, 1.05);
    this.a[3] = clamp(this.a[3], -0.85, 1.05);
    this.a[4] = clamp(this.a[4], 0.02, 1.35);
    this.a[5] = clamp(this.a[5], 0.02, 1.35);
    this.a[6] = clamp(this.a[6], -1.1, 1.1);
    this.a[7] = clamp(this.a[7], -1.1, 1.1);

    // 2) New local foot positions AFTER joint update
    const legs = this.computeLegs();

    // Support surface (ground or platform)
    let supportY = GROUND_Y;
    if (worldObjects) {
      for (const o of worldObjects) {
        if (!o.active || o.type !== 'platform') continue;
        const top = o.y - o.h / 2;
        const midX = this.x;
        if (midX > o.x - o.w / 2 && midX < o.x + o.w / 2) {
          const footY = this.y + Math.max(legs.footL.y, legs.footR.y);
          if (footY >= top - 6 && footY <= top + 16) supportY = top;
        }
      }
    }

    // 3) Which feet were / are on the ground?
    const worldFootLY = this.y + this.prevFootL.y;
    const worldFootRY = this.y + this.prevFootR.y;
    const wasLeftDown = worldFootLY >= supportY - 5;
    const wasRightDown = worldFootRY >= supportY - 5;

    // 4) LOCKED FOOT: if a foot was planted, keep it fixed in world space.
    //    Changing the local foot position must move the hip the other way.
    //    → This is the ONLY source of horizontal (and vertical stance) movement.
    let shiftX = 0;
    let shiftY = 0;
    let planted = 0;

    if (wasLeftDown) {
      // local foot moved by (new - old); hip must compensate
      shiftX -= (legs.footL.x - this.prevFootL.x);
      shiftY -= (legs.footL.y - this.prevFootL.y);
      planted++;
    }
    if (wasRightDown) {
      shiftX -= (legs.footR.x - this.prevFootR.x);
      shiftY -= (legs.footR.y - this.prevFootR.y);
      planted++;
    }

    if (planted > 0) {
      shiftX /= planted;
      shiftY /= planted;
      this.x += shiftX;
      this.y += shiftY;
      // derive velocity from the kinematic shift (for sensors / friction feel)
      this.vx = shiftX / Math.max(dt, 0.001) / 60;
      this.vy = shiftY / Math.max(dt, 0.001) / 60;
    } else {
      // In air: pure ballistic – gravity only, NO control
      this.vy += 0.7 * dt * 60;
      this.x += this.vx * dt * 60;
      this.y += this.vy * dt * 60;
      this.vx *= 0.998;
    }

    // 5) Hard ground constraint – never let feet sink, never float while planted
    const legsNow = this.computeLegs();
    const fLY = this.y + legsNow.footL.y;
    const fRY = this.y + legsNow.footR.y;
    const lowest = Math.max(fLY, fRY);

    if (lowest > supportY) {
      this.y -= (lowest - supportY);
      if (this.vy > 0) this.vy = 0;
    }

    // Re-evaluate contact
    const legs2 = this.computeLegs();
    this.leftFootDown = (this.y + legs2.footL.y) >= supportY - 4;
    this.rightFootDown = (this.y + legs2.footR.y) >= supportY - 4;
    this.onGround = this.leftFootDown || this.rightFootDown;

    // If on ground in non-jump modes: kill any upward velocity (no hopping/flying)
    if (this.onGround && mode !== 'jump') {
      if (this.vy < 0) this.vy = 0;
    }

    // Jump only in jump mode: explosive leg extension while grounded
    if (this.onGround && mode === 'jump') {
      const ext =
        Math.max(0, -this.av[2]) + Math.max(0, -this.av[3]) +
        Math.max(0, -this.av[4]) + Math.max(0, -this.av[5]);
      if (ext > 2.2) {
        this.vy = -Math.min(8.5, ext * 1.8);
        this.leftFootDown = false;
        this.rightFootDown = false;
        this.onGround = false;
      }
    }

    // Store local feet for next frame's locked-foot delta
    this.prevFootL = { x: legs2.footL.x, y: legs2.footL.y };
    this.prevFootR = { x: legs2.footR.x, y: legs2.footR.y };

    // Screen bounds
    if (this.x < MARGIN) { this.x = MARGIN; this.vx = 0; }
    if (this.x > SCREEN_W - MARGIN) { this.x = SCREEN_W - MARGIN; this.vx = 0; }
    if (this.y < 50) { this.y = 50; this.vy = Math.max(0, this.vy); }
    if (this.y > SCREEN_H - 5) { this.y = SCREEN_H - 5; this.vy = 0; this.alive = false; }

    if (worldObjects) this.collideObjects(worldObjects);

    this.updateScore(mode);
    this.energy -= 0.018 * dt * 60;
    if (this.energy <= 0 || this.age > 28) this.alive = false;
    if (Math.abs(this.a[0]) > 0.65 && this.onGround) this.energy -= 0.1;
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
      if (o.type === 'spring' && dist < (o.r || 20) + 30 && this.vy >= -0.3) {
        this.vy = -9.5;
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
        if (this.onGround) this.score += 0.3;
        // reward real stepping (one foot up, one down)
        if (this.leftFootDown !== this.rightFootDown) this.score += 0.2;
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

    // Torso
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(tx, ty);
    ctx.stroke();

    // Head
    ctx.beginPath();
    ctx.arc(tx + Math.sin(lean) * 12, ty - Math.cos(lean) * 12, 11, 0, Math.PI * 2);
    ctx.stroke();

    // Arms
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

    // Legs
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
