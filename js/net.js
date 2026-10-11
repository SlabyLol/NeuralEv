/** NeuralEv – Feed-forward network */
const INPUTS = 14;
const HIDDEN = 12;
const OUTPUTS = 8;

class Net {
  constructor(weights) {
    // layout: W_ih (in*hid) + b_h (hid) + W_ho (hid*out) + b_o (out)
    this.size = INPUTS * HIDDEN + HIDDEN + HIDDEN * OUTPUTS + OUTPUTS;
    if (weights && weights.length === this.size) {
      this.w = Float32Array.from(weights);
    } else {
      this.w = new Float32Array(this.size);
      for (let i = 0; i < this.size; i++) {
        this.w[i] = (Math.random() * 2 - 1) * 0.6;
      }
    }
    this.lastHidden = new Float32Array(HIDDEN);
    this.lastOut = new Float32Array(OUTPUTS);
  }

  forward(inputs) {
    const w = this.w;
    const h = this.lastHidden;
    // hidden
    for (let j = 0; j < HIDDEN; j++) {
      let s = w[INPUTS * HIDDEN + j]; // bias
      for (let i = 0; i < INPUTS; i++) {
        s += inputs[i] * w[i * HIDDEN + j];
      }
      h[j] = Math.tanh(s);
    }
    // output
    const base = INPUTS * HIDDEN + HIDDEN;
    const out = this.lastOut;
    for (let k = 0; k < OUTPUTS; k++) {
      let s = w[base + HIDDEN * OUTPUTS + k];
      for (let j = 0; j < HIDDEN; j++) {
        s += h[j] * w[base + j * OUTPUTS + k];
      }
      out[k] = Math.tanh(s);
    }
    return out;
  }

  mutate(rate) {
    const n = new Net(this.w);
    for (let i = 0; i < n.w.length; i++) {
      if (Math.random() < rate) {
        n.w[i] += (Math.random() * 2 - 1) * 0.35;
      }
      if (Math.random() < rate * 0.08) {
        n.w[i] = (Math.random() * 2 - 1) * 0.8;
      }
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

  /** Index helpers for editor */
  static edgeCount() {
    return INPUTS * HIDDEN + HIDDEN * OUTPUTS;
  }

  getEdgeWeight(edgeIdx) {
    // edges 0 .. in*hid-1 = input→hidden, then hidden→out
    if (edgeIdx < INPUTS * HIDDEN) return this.w[edgeIdx];
    const o = edgeIdx - INPUTS * HIDDEN;
    const base = INPUTS * HIDDEN + HIDDEN;
    return this.w[base + o];
  }

  setEdgeWeight(edgeIdx, value) {
    value = Math.max(-3, Math.min(3, value));
    if (edgeIdx < INPUTS * HIDDEN) {
      this.w[edgeIdx] = value;
    } else {
      const o = edgeIdx - INPUTS * HIDDEN;
      const base = INPUTS * HIDDEN + HIDDEN;
      this.w[base + o] = value;
    }
  }
}
