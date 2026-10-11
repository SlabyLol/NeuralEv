/** NeuralEv – Placeable world objects: help, death, fall, platform, spring */

class WorldObject {
  constructor(type, x, y) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.active = true;
    this.respawnTimer = 0;

    switch (type) {
      case 'help':
        this.r = 16;
        this.color = '#3fb950';
        this.label = 'HELP';
        break;
      case 'death':
        this.r = 18;
        this.color = '#f85149';
        this.label = 'DEATH';
        break;
      case 'fall':
        this.r = 14;
        this.color = '#d29922';
        this.label = 'FALL';
        this.vy = 0;
        this.originY = y;
        this.falling = false;
        this.fallDelay = 0.6 + Math.random() * 1.2;
        break;
      case 'platform':
        this.w = 90;
        this.h = 14;
        this.color = '#8b949e';
        this.label = 'PLAT';
        break;
      case 'spring':
        this.r = 20;
        this.color = '#58a6ff';
        this.label = 'SPRING';
        break;
      default:
        this.r = 12;
        this.color = '#ffffff';
        this.label = type;
    }
  }

  update(dt) {
    if (this.type === 'help' && !this.active) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.active = true;
    }

    if (this.type === 'fall') {
      if (!this.falling) {
        this.fallDelay -= dt;
        if (this.fallDelay <= 0) this.falling = true;
      } else {
        this.vy += 0.35 * dt * 60;
        this.y += this.vy * dt * 60;
        if (this.y > GROUND_Y + 40) {
          // reset fall
          this.y = this.originY;
          this.vy = 0;
          this.falling = false;
          this.fallDelay = 1.5 + Math.random() * 2;
          this.active = true;
        }
      }
    }
  }

  draw(ctx) {
    if (!this.active && this.type !== 'help') return;
    if (!this.active && this.type === 'help') {
      ctx.globalAlpha = 0.25;
    }

    ctx.save();
    if (this.type === 'platform') {
      ctx.fillStyle = this.color;
      ctx.fillRect(this.x - this.w / 2, this.y - this.h / 2, this.w, this.h);
      ctx.strokeStyle = '#c9d1d9';
      ctx.lineWidth = 1;
      ctx.strokeRect(this.x - this.w / 2, this.y - this.h / 2, this.w, this.h);
    } else if (this.type === 'death') {
      // spikes
      ctx.fillStyle = this.color;
      ctx.beginPath();
      for (let i = -2; i <= 2; i++) {
        ctx.moveTo(this.x + i * 10, this.y + 10);
        ctx.lineTo(this.x + i * 10 + 5, this.y - 14);
        ctx.lineTo(this.x + i * 10 + 10, this.y + 10);
      }
      ctx.fill();
    } else if (this.type === 'fall') {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#010409';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('●', this.x, this.y + 4);
    } else if (this.type === 'spring') {
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const yy = this.y + 12 - i * 6;
        ctx.moveTo(this.x - 12, yy);
        ctx.lineTo(this.x + 12, yy - 3);
      }
      ctx.stroke();
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y - 18, 6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // help
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#010409';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('+', this.x, this.y + 4);
    }

    ctx.globalAlpha = 1;
    ctx.fillStyle = '#8b949e';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.label, this.x, this.y + (this.type === 'platform' ? 22 : this.r + 14));
    ctx.restore();
  }

  contains(mx, my) {
    if (this.type === 'platform') {
      return mx >= this.x - this.w / 2 && mx <= this.x + this.w / 2 &&
             my >= this.y - this.h / 2 - 4 && my <= this.y + this.h / 2 + 4;
    }
    const r = this.r || 16;
    return Math.hypot(mx - this.x, my - this.y) < r + 8;
  }
}

class ObjectManager {
  constructor() {
    this.list = [];
    this.placeType = null; // currently selected tool
  }

  setTool(type) {
    this.placeType = this.placeType === type ? null : type;
  }

  add(type, x, y) {
    // clamp inside screen
    x = Math.max(30, Math.min(SCREEN_W - 30, x));
    y = Math.max(40, Math.min(GROUND_Y - 10, y));
    this.list.push(new WorldObject(type, x, y));
  }

  removeAt(mx, my) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (this.list[i].contains(mx, my)) {
        this.list.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  clear() {
    this.list = [];
  }

  update(dt) {
    for (const o of this.list) o.update(dt);
  }

  draw(ctx) {
    for (const o of this.list) o.draw(ctx);
  }

  resetFalls() {
    for (const o of this.list) {
      if (o.type === 'fall') {
        o.y = o.originY;
        o.vy = 0;
        o.falling = false;
        o.fallDelay = 0.8 + Math.random();
        o.active = true;
      }
      if (o.type === 'help') {
        o.active = true;
        o.respawnTimer = 0;
      }
    }
  }
}
