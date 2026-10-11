/** NeuralEv – Binary .neural-omni.nom export / import (obfuscated, not human-readable) */

const NOM_MAGIC = [0x4E, 0x4F, 0x4D, 0x31]; // NOM1
const NOM_KEY = 0xA5;

function exportNom(pop) {
  pop.agents.sort((a, b) => b.score - a.score);
  const netSize = pop.agents[0].net.size;
  const header = 20;
  const buf = new ArrayBuffer(header + POP_SIZE * netSize * 4);
  const view = new DataView(buf);

  NOM_MAGIC.forEach((b, i) => view.setUint8(i, b));
  view.setUint16(4, 2, true);               // version 2
  view.setUint16(6, pop.generation, true);
  view.setUint16(8, POP_SIZE, true);
  view.setUint16(10, netSize, true);
  view.setUint16(12, INPUTS, true);
  view.setUint16(14, HIDDEN, true);
  view.setUint16(16, OUTPUTS, true);
  view.setUint16(18, 0, true);              // reserved

  let off = header;
  for (let i = 0; i < POP_SIZE; i++) {
    const w = pop.agents[i].net.w;
    for (let j = 0; j < netSize; j++) {
      view.setFloat32(off, w[j], true);
      // obfuscate bytes
      for (let b = 0; b < 4; b++) {
        const v = view.getUint8(off + b);
        view.setUint8(off + b, v ^ NOM_KEY ^ ((j + i * 7) & 0xFF));
      }
      off += 4;
    }
  }

  const blob = new Blob([buf], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `neural-omni-gen${pop.generation}.neural-omni.nom`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importNom(file, pop, onDone) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const buf = e.target.result;
      const view = new DataView(buf);
      if (view.getUint8(0) !== 0x4E || view.getUint8(1) !== 0x4F ||
          view.getUint8(2) !== 0x4D || view.getUint8(3) !== 0x31) {
        alert('Invalid .neural-omni.nom file (bad magic)');
        return;
      }
      const ver = view.getUint16(4, true);
      pop.generation = view.getUint16(6, true);
      const count = view.getUint16(8, true);
      const netSize = view.getUint16(10, true);
      // we ignore stored INPUTS/HIDDEN for compatibility; use current sizes

      pop.agents = [];
      let off = 20;
      for (let i = 0; i < Math.min(count, POP_SIZE); i++) {
        const w = new Float32Array(netSize);
        for (let j = 0; j < netSize; j++) {
          // de-obfuscate
          for (let b = 0; b < 4; b++) {
            const v = view.getUint8(off + b);
            view.setUint8(off + b, v ^ NOM_KEY ^ ((j + i * 7) & 0xFF));
          }
          w[j] = view.getFloat32(off, true);
          off += 4;
        }
        // pad / trim to current net size
        const finalW = new Float32Array(pop.agents[0] ? pop.agents[0].net.size : new Net().size);
        finalW.set(w.subarray(0, finalW.length));
        pop.agents.push(new Stick(new Net(finalW)));
      }
      while (pop.agents.length < POP_SIZE) {
        pop.agents.push(new Stick(new Net()));
      }
      pop.selected = 0;
      if (onDone) onDone();
    } catch (err) {
      alert('Failed to import: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}
