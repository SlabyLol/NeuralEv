/** NeuralEv – Binary .neural-omni.nom export / import */

const NOM_MAGIC = [0x4E, 0x4F, 0x4D, 0x31];
const NOM_KEY = 0xA5;

function exportNom(pop) {
  const netSize = pop.genomes[0].size;
  const header = 20;
  const buf = new ArrayBuffer(header + POP_SIZE * netSize * 4);
  const view = new DataView(buf);

  NOM_MAGIC.forEach((b, i) => view.setUint8(i, b));
  view.setUint16(4, 3, true);
  view.setUint16(6, pop.generation, true);
  view.setUint16(8, POP_SIZE, true);
  view.setUint16(10, netSize, true);
  view.setUint16(12, INPUTS, true);
  view.setUint16(14, HIDDEN, true);
  view.setUint16(16, OUTPUTS, true);
  view.setUint16(18, 0, true);

  let off = header;
  for (let i = 0; i < POP_SIZE; i++) {
    const w = pop.genomes[i].w;
    for (let j = 0; j < netSize; j++) {
      view.setFloat32(off, w[j], true);
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
      const view = new DataView(e.target.result);
      if (view.getUint8(0) !== 0x4E || view.getUint8(3) !== 0x31) {
        alert('Invalid .neural-omni.nom file');
        return;
      }
      pop.generation = view.getUint16(6, true);
      const count = view.getUint16(8, true);
      const netSize = view.getUint16(10, true);

      pop.genomes = [];
      let off = 20;
      for (let i = 0; i < Math.min(count, POP_SIZE); i++) {
        const w = new Float32Array(netSize);
        for (let j = 0; j < netSize; j++) {
          for (let b = 0; b < 4; b++) {
            const v = view.getUint8(off + b);
            view.setUint8(off + b, v ^ NOM_KEY ^ ((j + i * 7) & 0xFF));
          }
          w[j] = view.getFloat32(off, true);
          off += 4;
        }
        const finalW = new Float32Array(new Net().size);
        finalW.set(w.subarray(0, finalW.length));
        pop.genomes.push(new Net(finalW));
      }
      while (pop.genomes.length < POP_SIZE) pop.genomes.push(new Net());
      pop.scores = new Array(POP_SIZE).fill(0);
      pop.trialIndex = 0;
      pop.bestThisGen = 0;
      pop.spawnCurrent();
      if (onDone) onDone();
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}
