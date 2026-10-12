// Genera los datos de la app "Trazada" (CSP) para una pista.
//
//   node tools/build_app.js [pista] [rotación del mapa en grados]
//
// Lee tools/<pista>_line.json (sale de tools/export.py), corre la vuelta teórica y la humana
// con sim.js y escribe cm-app/Trazada/data/<pista>.json. Si existe tools/corners/<pista>.json
// usa esos nombres de curva; si no, detecta las curvas solo y las numera T1, T2, …
const fs = require('fs');
const path = require('path');
const S = require('./sim.js');

const track = process.argv[2] || 'spa';
const rot = process.argv[3] != null ? +process.argv[3] : (track === 'spa' ? -50 : 0);
const line = JSON.parse(fs.readFileSync(path.join(__dirname, `${track}_line.json`), 'utf8'));
const namesFile = path.join(__dirname, 'corners', `${track}.json`);
const outFile = path.join(__dirname, '..', 'cm-app', 'Trazada', 'data', `${track}.json`);

const G = S.buildGeometry(line);
const { n, s, ds, kappa } = G;
const L = G.length;
const opt = { fuel: 30, wing: 4, grip: 1, level: 0.93 };
const runs = {
  theory: S.simulateLap(G, S.CAR_458, { ...opt, mode: 'theory' }),
  human: S.simulateLap(G, S.CAR_458, { ...opt, mode: 'human' }),
};

const idxAt = d => {
  d = ((d % L) + L) % L;
  let lo = 0, hi = n - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (s[m] <= d) lo = m; else hi = m - 1; }
  return lo;
};
const wrap = d => ((d % L) + L) % L;
const STRAIGHT_R = 450;   // la curva "empieza" donde el radio baja de 450 m (igual que en la página)

// punto de giro: desde el vértice hacia atrás hasta que el radio supera 450 m
function turnInOf(apex) {
  let ti = apex;
  while (Math.abs(kappa[(ti - 1 + n) % n]) > 1 / STRAIGHT_R) ti = (ti - 1 + n) % n;
  let straight = 0, k = (ti - 1 + n) % n;
  while (Math.abs(kappa[k]) < 1 / STRAIGHT_R && straight < 400) { straight += ds[k]; k = (k - 1 + n) % n; }
  return { ti, straight };
}
function peakNear(i, half) {
  let pk = i;
  for (let k = -half; k <= half; k++) { const j = (i + k + n) % n; if (Math.abs(kappa[j]) > Math.abs(kappa[pk])) pk = j; }
  return pk;
}

let list;
if (fs.existsSync(namesFile)) {
  list = JSON.parse(fs.readFileSync(namesFile, 'utf8')).map(c => ({ ...c, apexIdx: peakNear(idxAt(c.ref), 12) }));
} else {
  // detección automática: picos de curvatura con radio < 250 m, separados al menos 120 m
  const peaks = [];
  for (let i = 0; i < n; i++) {
    if (Math.abs(kappa[i]) < 1 / 250) continue;
    if (peakNear(i, 40) !== i) continue;
    if (peaks.length && s[i] - s[peaks[peaks.length - 1]] < 120) continue;
    peaks.push(i);
  }
  list = peaks.map((p, k) => ({ n: `T${k + 1}`, name: `Curva ${k + 1}`, apexIdx: p }));
}

const corners = list.map(c => {
  const { ti, straight } = turnInOf(c.apexIdx);
  const out = { n: c.n, name: c.name, apex: +s[c.apexIdx].toFixed(1), turnIn: +s[ti].toFixed(1), straight: Math.round(straight), dir: kappa[c.apexIdx] > 0 ? 'R' : 'L' };
  for (const [mode, R] of Object.entries(runs)) {
    // punto más lento cerca del vértice y la frenada principal (la última que arranca antes del giro)
    let iMin = c.apexIdx;   // el más lento entre el giro y un poco después del vértice
    for (let j = ti; j !== (c.apexIdx + 30) % n; j = (j + 1) % n) if (R.v[j] < R.v[iMin]) iMin = j;
    let bs = -1;
    for (let k = 0, i = iMin; k < 400; k++, i = (i - 1 + n) % n) {
      if (R.brk[i] > 0.02 && R.brk[(i - 1 + n) % n] <= 0.02 && wrap(s[ti] - s[i] + 30) < 430) { bs = i; break; }   // hasta 30 m después del giro cuenta
      if (R.thr[i] > 0.5 && k > 20 && bs < 0 && wrap(s[ti] - s[i]) > 0 && wrap(s[ti] - s[i]) < L / 2) break;
    }
    let peak = 0;
    if (bs >= 0) for (let i = bs; i !== iMin; i = (i + 1) % n) peak = Math.max(peak, R.brk[i]);
    // sin frenada: ¿levanta (más de ~12 m con los dos pedales sueltos) o va a fondo?
    let action = 'brake';
    if (bs < 0) {
      let run = 0, longest = 0;
      for (let i = idxAt(s[ti] - 250); i !== iMin; i = (i + 1) % n) {
        if (R.thr[i] <= 0.03 && R.brk[i] <= 0.02) { run += ds[i]; longest = Math.max(longest, run); } else run = 0;
      }
      action = longest > 12 ? 'lift' : 'flat';
    }
    out[mode] = {
      vmin: Math.round(R.v[iMin] * 3.6),
      gear: R.gear[iMin],
      action,
      brakeAt: bs >= 0 ? +s[bs].toFixed(1) : null,
      brakePeak: Math.round(peak * 100),
    };
  }
  return out;
});

// muestras cada 2 puntos (~3 m): suficiente para el mapa y para leer la referencia
const STEP = 2;
const idx = [];
for (let i = 0; i < n; i += STEP) idx.push(i);
const pick = (arr, f) => idx.map(i => f(arr[i]));
const ref = R => ({
  v: pick(R.v, v => Math.round(v * 3.6 * 10) / 10),
  thr: pick(R.thr, x => Math.round(x * 100)),
  brk: pick(R.brk, x => Math.round(x * 100)),
  gear: pick(R.gear, g => g),
  lap: +R.lapTime.toFixed(3),
});
const widths = line.l.map((l, i) => l + line.r[i]).sort((a, b) => a - b);

// bordes de la pista: la línea AI ± el ancho a cada lado (suavizado), sobre la normal hacia la derecha
const smoothArr = (a, h) => a.map((_, i) => { let t = 0; for (let k = -h; k <= h; k++) t += a[(i + k + n) % n]; return t / (2 * h + 1); });
const SL = smoothArr(line.l, 3), SR = smoothArr(line.r, 3);
const edges = { xl: [], zl: [], xr: [], zr: [], kerb: [] };
for (const i of idx) {
  const a = (i + 2) % n, b = (i - 2 + n) % n;
  const tx = line.x[a] - line.x[b], tz = line.z[a] - line.z[b], l = Math.hypot(tx, tz) || 1;
  const nx = -tz / l, nz = tx / l;
  edges.xl.push(Math.round((line.x[i] - nx * (SL[i] + 0.6)) * 10) / 10);
  edges.zl.push(Math.round((line.z[i] - nz * (SL[i] + 0.6)) * 10) / 10);
  edges.xr.push(Math.round((line.x[i] + nx * (SR[i] + 0.6)) * 10) / 10);
  edges.zr.push(Math.round((line.z[i] + nz * (SR[i] + 0.6)) * 10) / 10);
  // pianos: del lado de adentro donde el radio baja de 220 m, y también afuera si baja de 120 m
  const k = kappa[i], R = 1 / Math.max(Math.abs(k), 1e-6);
  let kerb = 0;                               // 1 izquierda · 2 derecha · 3 los dos
  if (R < 220) kerb |= k > 0 ? 2 : 1;
  if (R < 120) kerb |= k > 0 ? 1 : 2;
  edges.kerb.push(kerb);
}

const data = {
  format: 1,
  track, rot, length: +L.toFixed(1), width: Math.round(widths[widths.length >> 1]),
  car: 'ferrari_458_gt2', carName: S.CAR_458.name,
  setup: { wing: opt.wing, fuel: opt.fuel, level: opt.level },
  s: pick(s, x => Math.round(x * 10) / 10),
  x: idx.map(i => Math.round(line.x[i] * 10) / 10),
  z: idx.map(i => Math.round(line.z[i] * 10) / 10),
  y: idx.map(i => Math.round(line.y[i] * 100) / 100),   // altura de la línea AI (la app la ajusta al asfalto con un rayo)
  ...edges,
  boards: [200, 150, 100, 50],
  corners,
  theory: ref(runs.theory),
  human: ref(runs.human),
};
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(data));
console.log(`${track}: ${idx.length} muestras, ${corners.length} curvas, teórica ${data.theory.lap} s, humana ${data.human.lap} s -> ${path.relative(process.cwd(), outFile)} (${Math.round(fs.statSync(outFile).size / 1024)} KB)`);
const how = (c, r) => r.action === 'brake' ? `frena ${Math.round(wrap(c.turnIn - r.brakeAt + 30) - 30)} m antes` : r.action === 'lift' ? 'levanta' : 'a fondo';
for (const c of corners) console.log(`  ${c.n.padEnd(7)} ${c.name.padEnd(12)} giro ${String(Math.round(c.turnIn)).padStart(5)} m  recta ${String(c.straight).padStart(3)} m  | T ${c.theory.vmin} km/h ${c.theory.gear}ª ${how(c, c.theory)}  | H ${c.human.vmin} km/h ${c.human.gear}ª ${how(c, c.human)}`);
