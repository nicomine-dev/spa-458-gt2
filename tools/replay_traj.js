// Trayectorias de la vuelta teórica y la humana, cuadro por cuadro, para armar un replay de AC.
//
//   node tools/replay_traj.js [intervalo_ms=30] [segundos]  > trayectorias.json
//
// Cada auto sigue la línea AI a la velocidad de su simulación, con largada lanzada desde la línea de meta.
const fs = require('fs');
const path = require('path');
const S = require('./sim.js');

const dt = (+process.argv[2] || 30) / 1000;
const line = JSON.parse(fs.readFileSync(path.join(__dirname, 'spa_line.json'), 'utf8'));
const G = S.buildGeometry(line);
const n = G.n, L = G.length;
const opt = { fuel: 30, wing: 4, grip: 1, level: 0.93 };
const runs = {
  theory: S.simulateLap(G, S.CAR_458, { ...opt, mode: 'theory' }),
  human: S.simulateLap(G, S.CAR_458, { ...opt, mode: 'human' }),
};
const seconds = +process.argv[3] || Math.max(...Object.values(runs).map(r => r.lapTime)) + 20;
const frames = Math.ceil(seconds / dt);

function track(R) {
  const out = { lapTime: R.lapTime, f: [] };
  let i = 0, lap = 0;
  for (let k = 0; k < frames; k++) {
    const time = k * dt;
    lap = Math.floor(time / R.lapTime);
    const t = time - lap * R.lapTime;
    while (i < n - 1 && R.t[i + 1] <= t) i++;
    while (i > 0 && R.t[i] > t) i--;
    const j = (i + 1) % n;
    const f = Math.min(1, Math.max(0, (t - R.t[i]) / (R.t[i + 1] - R.t[i])));
    const I = a => a[i] + (a[j] - a[i]) * f;
    // dirección 3D de la línea alrededor del punto
    const a = (i - 2 + n) % n, b = (j + 2) % n;
    let fx = line.x[b] - line.x[a], fy = line.y[b] - line.y[a], fz = line.z[b] - line.z[a];
    const l = Math.hypot(fx, fy, fz) || 1;
    out.f.push({
      x: +I(line.x).toFixed(3), y: +I(line.y).toFixed(3), z: +I(line.z).toFixed(3),
      fx: +(fx / l).toFixed(4), fy: +(fy / l).toFixed(4), fz: +(fz / l).toFixed(4),
      v: +I(R.v).toFixed(2), thr: +I(R.thr).toFixed(3), brk: +I(R.brk).toFixed(3),
      gear: R.gear[i], rpm: Math.round(I(R.rpm)), k: +I(G.kappa).toFixed(5),
      lap, tLap: Math.round(t * 1000),
    });
  }
  return out;
}

const out = { dt, frames, length: L, theory: track(runs.theory), human: track(runs.human) };
process.stdout.write(JSON.stringify(out));
