// Analiza tus vueltas grabadas curva por curva contra la vuelta humana y la teórica.
//
//   node tools/analyze.js [recordings/archivo.json]     (por defecto, la última sesión)
//
// Usa la misma partición que la página: cada tramo arranca 150 m antes de una curva e incluye su salida.
const fs = require('fs');
const path = require('path');
const S = require('./sim.js');

const ROOT = path.join(__dirname, '..');
const recFile = process.argv[2] || fs.readdirSync(path.join(ROOT, 'recordings'))
  .filter(f => f.endsWith('.json')).map(f => path.join(ROOT, 'recordings', f))
  .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs).pop();
const rec = JSON.parse(fs.readFileSync(recFile, 'utf8'));
const line = JSON.parse(fs.readFileSync(path.join(__dirname, 'spa_line.json'), 'utf8'));
const G = S.buildGeometry(line);
const N = G.n, L = G.length;
// las curvas (con nombre y rango) son las mismas que usa la página
const tpl = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
const CORNERS = eval(tpl.slice(tpl.indexOf('const CORNERS = [') + 'const CORNERS = '.length, tpl.indexOf('];', tpl.indexOf('const CORNERS = [')) + 1));
const ks = CORNERS.filter(k => !k.straight);

const idxAt = d => { d = ((d % L) + L) % L; let lo = 0, hi = N - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (G.s[m] <= d) lo = m; else hi = m - 1; } return lo; };
const wrap = d => ((d % L) + L) % L;
// punto de giro de cada curva (radio < 450 m), igual que la página
for (const k of ks) {
  const h = idxAt(k.turn ?? k.apex);
  let pk = h;
  for (let j = -12; j <= 12; j++) { const q = (h + j + N) % N; if (Math.abs(G.kappa[q]) > Math.abs(G.kappa[pk])) pk = q; }
  let ti = pk;
  while (Math.abs(G.kappa[(ti - 1 + N) % N]) > 1 / 450) ti = (ti - 1 + N) % N;
  k.turnIn = G.s[ti]; k.apexIdx = pk; k.dir = G.kappa[pk] > 0 ? 1 : -1;
}
// normal hacia la derecha de la línea AI (para medir por dónde pasás)
const NX = new Float64Array(N), NZ = new Float64Array(N);
for (let i = 0; i < N; i++) {
  const a = (i + 2) % N, b = (i - 2 + N) % N, tx = line.x[a] - line.x[b], tz = line.z[a] - line.z[b], l = Math.hypot(tx, tz) || 1;
  NX[i] = -tz / l; NZ[i] = tx / l;
}

function lapToRun(lap) {
  const s = lap.s, n = s.p.length, dist = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    let d = s.p[k] * L;
    if (k < n * 0.1 && s.p[k] > 0.5) d -= L;
    if (k > n * 0.9 && s.p[k] < 0.5) d += L;
    dist[k] = k ? Math.max(d, dist[k - 1]) : d;
  }
  const R = { v: [], thr: [], brk: [], gear: [], x: [], z: [], out: [], t: new Float64Array(N + 1) };
  let k = 0;
  for (let i = 0; i < N; i++) {
    const d = G.s[i];
    while (k < n - 2 && dist[k + 1] <= d) k++;
    const span = dist[k + 1] - dist[k], f = span > 1e-6 ? Math.min(1, Math.max(0, (d - dist[k]) / span)) : 0;
    const I = a => a[k] + (a[k + 1] - a[k]) * f;
    R.v.push(I(s.v) / 3.6); R.thr.push(I(s.thr)); R.brk.push(I(s.brk)); R.gear.push(Math.max(0, s.g[f < 0.5 ? k : k + 1]));
    R.x.push(I(s.x)); R.z.push(I(s.z)); R.out.push(s.out ? s.out[f < 0.5 ? k : k + 1] : 0); R.t[i] = I(s.t) / 1000;
  }
  R.t[N] = lap.time / 1000;
  for (let i = 1; i <= N; i++) if (R.t[i] <= R.t[i - 1]) R.t[i] = R.t[i - 1] + 1e-4;
  R.lapTime = lap.time / 1000; R.name = `V${lap.n}`; R.valid = lap.valid; R.own = true;
  return R;
}
const tAt = (R, d) => { const i = idxAt(d), f = (wrap(d) - G.s[i]) / G.ds[i]; return R.t[i] + (R.t[i + 1] - R.t[i]) * Math.min(1, Math.max(0, f)); };
const segTime = (R, d0, d1) => { const a = tAt(R, d0), b = tAt(R, d1); return b >= a ? b - a : b + R.lapTime - a; };
const vAt = (R, d) => R.v[idxAt(d)] * 3.6;
const range = (d0, d1, fn) => { for (let i = idxAt(d0); i !== idxAt(d1); i = (i + 1) % N) fn(i); };

function corner(R, k, d0, d1) {
  const m = { seg: segTime(R, d0, d1) };
  let iMin = idxAt(k.a);
  range(k.a, k.b, i => { if (R.v[i] < R.v[iMin]) iMin = i; });
  m.vmin = R.v[iMin] * 3.6; m.gear = R.gear[iMin];
  m.minVsApex = Math.round(wrap(G.s[iMin] - G.s[k.apexIdx] + L / 2) - L / 2);   // + después del vértice
  let bs = null, peak = 0;
  range(d0, G.s[iMin], i => { if (bs == null && R.brk[i] > 0.1) bs = i; if (bs != null) peak = Math.max(peak, R.brk[i]); });
  m.brakeBefore = bs == null ? null : Math.round(wrap(k.turnIn - G.s[bs] + 30) - 30);
  m.entry = bs == null ? vAt(R, d0) : R.v[bs] * 3.6;
  m.peak = Math.round(peak * 100);
  // vuelta a fondo: primera vez después del punto más lento con acelerador > 95 %
  let full = null;
  range(G.s[iMin], d1, i => { if (full == null && R.thr[i] > 0.95) full = i; });
  m.fullAfter = full == null ? null : Math.round(wrap(G.s[full] - G.s[iMin]));
  // tiempo con los dos pedales sueltos dentro del tramo
  let coast = 0;
  range(d0, d1, i => { if (R.thr[i] < 0.05 && R.brk[i] < 0.05) coast += R.t[i + 1] - R.t[i]; });
  m.coast = coast;
  m.exit = vAt(R, d1);
  // por dónde pasás en el vértice: + = más adentro que la trazada ideal
  if (R.own) {
    const i = k.apexIdx, off = (R.x[i] - line.x[i]) * NX[i] + (R.z[i] - line.z[i]) * NZ[i];
    m.inside = off * k.dir;
    let out = 0; range(d0, d1, j => { out = Math.max(out, R.out[j]); }); m.out = out;
  }
  return m;
}

const opt = { fuel: 30, wing: 4, grip: 1, level: 0.93 };
const refs = { humana: S.simulateLap(G, S.CAR_458, { ...opt, mode: 'human' }), teórica: S.simulateLap(G, S.CAR_458, { ...opt, mode: 'theory' }) };
for (const R of Object.values(refs)) R.own = false;
const laps = rec.laps.filter(l => l.complete && l.time > 0).map(lapToRun);
const bounds = ks.map(k => wrap(k.a - 150));
const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(3).padStart(6, '0')}`;
const r1 = x => x == null ? '—' : Math.round(x);

console.log(`Sesión ${path.basename(recFile)} · ${laps.length} vueltas completas`);
console.log(`Referencias: humana ${fmt(refs.humana.lapTime)} · teórica ${fmt(refs.teórica.lapTime)}\n`);
for (const R of laps) console.log(`${R.name}: ${fmt(R.lapTime)} ${R.valid ? 'válida' : 'inválida'} · vs humana ${(R.lapTime - refs.humana.lapTime >= 0 ? '+' : '')}${(R.lapTime - refs.humana.lapTime).toFixed(3)} · vs teórica +${(R.lapTime - refs.teórica.lapTime).toFixed(3)}`);
const all = [...laps, refs.humana, refs.teórica];
const names = [...laps.map(R => R.name), 'HUM', 'TEO'];
for (let j = 0; j < ks.length; j++) {
  const k = ks[j], d0 = bounds[j], d1 = bounds[(j + 1) % ks.length];
  const ms = all.map(R => corner(R, k, d0, d1));
  console.log(`\n== ${k.n} ${k.name} (tramo ${Math.round(d0)}→${Math.round(d1)} m, giro ${Math.round(k.turnIn)} m, ${k.dir > 0 ? 'derecha' : 'izquierda'})`);
  const row = (label, f) => console.log(label.padEnd(16) + ms.map((m, i) => String(f(m, i)).padStart(9)).join(''));
  console.log(''.padEnd(16) + names.map(n => n.padStart(9)).join(''));
  row('tramo (s)', m => m.seg.toFixed(2));
  row('vs humana (s)', m => (m.seg - ms[laps.length].seg >= 0 ? '+' : '') + (m.seg - ms[laps.length].seg).toFixed(2));
  row('entrada km/h', m => r1(m.entry));
  row('frena (m giro)', m => r1(m.brakeBefore));
  row('freno máx %', m => m.peak);
  row('mín km/h', m => r1(m.vmin));
  row('mín vs vértice', m => m.minVsApex);
  row('marcha', m => m.gear || 'N');
  row('a fondo +m', m => r1(m.fullAfter));
  row('sueltos (s)', m => m.coast.toFixed(2));
  row('salida km/h', m => r1(m.exit));
  row('adentro (m)', m => m.inside == null ? '' : m.inside.toFixed(1));
  row('ruedas afuera', m => m.out == null ? '' : m.out);
}
