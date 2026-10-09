// ---- Ferrari 458 GT2 (datos de Assetto Corsa: car.ini, engine.ini, drivetrain.ini, aero.ini, tyres.ini) ----
const CAR_458 = {
  name: 'Ferrari 458 GT2',
  mass: 1320,                 // kg con piloto, sin nafta (car.ini TOTALMASS)
  fuelDensity: 0.74,
  torque: [[0,100],[250,130],[500,150],[750,200],[1000,235],[1500,317],[2000,355],[2500,377],[3000,398],[3500,434],[4000,441],[4500,443],[5000,458],[5500,466],[6000,464],[6500,455],[7000,424],[7500,368],[8000,342],[8500,314],[9000,290],[9500,0]],
  limiter: 8300,
  gears: [2.8461, 2.0, 1.6111, 1.32, 1.16, 1.0],
  final: 3.2,
  rWheel: 0.355,
  driveEff: 0.9,
  coastTorque: 110, coastRpm: 9000,   // freno motor (engine.ini COAST_REF)
  wingArea: 2.13975,                  // CHORD 1 x SPAN 2.13975
  body: { cl: 0.0, cd: 0.345 },
  front: { cl: 0.52, cd: 0.0025 },    // splitter a 2°
  diffuser: { cl: 0.135, cd: 0 },
  rearCL: [[0,0.315],[2,0.41],[4,0.615],[6,0.645],[8,0.667],[10,0.685]],
  rearCD: [[0,0.0],[2,0.03],[4,0.06],[6,0.09],[8,0.12],[10,0.16]],
  muRef: 1.59, lsExp: 0.79, fz0: 3883, // DY_REF, LS_EXPY, FZ0 promedio delantero/trasero
  rearShare: 0.54,                     // reparto de carga en el eje trasero acelerando
  brakeFront: 0.66,
};

function lut(table, x) {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const [x0, y0] = table[i - 1], [x1, y1] = table[i];
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
  }
  return table[table.length - 1][1];
}

function smooth(arr, half, loop = true) {
  const n = arr.length, out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let k = -half; k <= half; k++) {
      let j = i + k;
      if (loop) j = (j + n) % n; else if (j < 0 || j >= n) continue;
      s += arr[j]; c++;
    }
    out[i] = s / c;
  }
  return out;
}

// Geometría: distancia, curvatura en planta, pendiente y curvatura vertical
function buildGeometry(T) {
  const n = T.x.length;
  const X = smooth(T.x, 2), Z = smooth(T.z, 2), Y = smooth(T.y, 6);
  const s = new Float64Array(n), ds = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    ds[i] = Math.hypot(X[j] - X[i], Z[j] - Z[i], Y[j] - Y[i]);
    if (i + 1 < n) s[i + 1] = s[i] + ds[i];
  }
  const head = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i + 3) % n, b = (i - 3 + n) % n;
    head[i] = Math.atan2(Z[a] - Z[b], X[a] - X[b]);
  }
  const kRaw = new Float64Array(n), gRaw = new Float64Array(n), vRaw = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i + 5) % n, b = (i - 5 + n) % n;
    let d = head[a] - head[b];
    d = ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    let span = 0;
    for (let k = -5; k < 5; k++) span += ds[(i + k + n) % n];
    kRaw[i] = d / span;
    const a2 = (i + 8) % n, b2 = (i - 8 + n) % n;
    let span2 = 0;
    for (let k = -8; k < 8; k++) span2 += ds[(i + k + n) % n];
    gRaw[i] = (Y[a2] - Y[b2]) / span2;
  }
  const kappa = smooth(kRaw, 4);
  const grade = smooth(gRaw, 6);
  for (let i = 0; i < n; i++) {
    const a = (i + 8) % n, b = (i - 8 + n) % n;
    let span = 0;
    for (let k = -8; k < 8; k++) span += ds[(i + k + n) % n];
    vRaw[i] = (grade[a] - grade[b]) / span;
  }
  const kv = smooth(vRaw, 8);
  return { n, X, Z, Y, s, ds, kappa, grade, kv, length: s[n - 1] + ds[n - 1] };
}

// Simulación cuasi-estática de vuelta (límite de adherencia + motor + aero)
function simulateLap(G, CAR, opt) {
  const { n, ds, kappa, grade, kv } = G;
  const g = 9.81, rho = 1.2;
  const m = CAR.mass + opt.fuel * CAR.fuelDensity;
  const A = CAR.wingArea;
  const clA = A * (CAR.body.cl + CAR.front.cl + CAR.diffuser.cl + lut(CAR.rearCL, opt.wing));
  const cdA = A * (CAR.body.cd + CAR.front.cd + CAR.diffuser.cd + lut(CAR.rearCD, opt.wing));
  const grip = opt.grip * opt.driver;

  const down = v => 0.5 * rho * clA * v * v;
  const drag = v => 0.5 * rho * cdA * v * v;
  const muAt = fzTotal => CAR.muRef * Math.pow(Math.max(fzTotal, 1) / 4 / CAR.fz0, CAR.lsExp - 1) * grip;
  const loadAt = (v, i) => m * g * Math.sqrt(1 - grade[i] * grade[i]) + down(v) + m * v * v * kv[i];
  const gripForce = (v, i) => { const fz = loadAt(v, i); return muAt(fz) * fz; };

  const rpmOf = (v, gear) => v / CAR.rWheel * CAR.gears[gear] * CAR.final * 60 / (2 * Math.PI);
  function engine(v) {
    let best = { F: 0, gear: CAR.gears.length - 1, rpm: CAR.limiter };
    for (let k = 0; k < CAR.gears.length; k++) {
      const rpm = rpmOf(v, k);
      if (rpm > CAR.limiter) continue;
      const tq = lut(CAR.torque, Math.max(rpm, 3000));
      const F = tq * CAR.gears[k] * CAR.final * CAR.driveEff / CAR.rWheel;
      if (F > best.F) best = { F, gear: k, rpm };
    }
    return best;
  }
  const coast = v => {
    const e = engine(v);
    return CAR.coastTorque * (e.rpm / CAR.coastRpm) * CAR.gears[e.gear] * CAR.final / CAR.rWheel;
  };

  // 1) velocidad máxima en curva
  const vLat = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const k = Math.abs(kappa[i]);
    let v = 95;
    if (k > 1e-5) {
      for (let it = 0; it < 40; it++) {
        const vn = Math.sqrt(gripForce(v, i) / (m * k));
        v = 0.5 * v + 0.5 * Math.min(vn, 120);
      }
    } else v = 120;
    vLat[i] = Math.min(v, 120);
  }
  // arrancamos desde la curva más lenta para cerrar la vuelta
  let i0 = 0;
  for (let i = 1; i < n; i++) if (vLat[i] < vLat[i0]) i0 = i;
  const idx = k => (i0 + k) % n;
  const latUse = (v, i) => {
    const cap = gripForce(v, i) / m;
    const used = v * v * Math.abs(kappa[i]);
    return Math.sqrt(Math.max(0, 1 - Math.min(1, used / cap) ** 2));
  };

  // 2) pasada hacia adelante (aceleración)
  const vF = new Float64Array(n + 1);
  vF[0] = vLat[i0];
  for (let k = 0; k < n; k++) {
    const i = idx(k), v = vF[k];
    const e = engine(v);
    const traction = gripForce(v, i) * CAR.rearShare * latUse(v, i);
    const Fx = Math.min(e.F, traction) - drag(v) - 0.012 * m * g - m * g * grade[i];
    const v2 = v * v + 2 * Fx / m * ds[i];
    vF[k + 1] = Math.min(Math.sqrt(Math.max(v2, 1)), vLat[idx(k + 1)]);
  }
  // 3) pasada hacia atrás (frenada)
  const vB = new Float64Array(n + 1);
  vB[n] = vF[n];
  for (let k = n - 1; k >= 0; k--) {
    const i = idx(k), v = vB[k + 1];
    const brake = gripForce(v, i) * 0.96 * latUse(v, i);
    const Fd = brake + drag(v) + 0.012 * m * g + m * g * grade[i] + coast(v);
    const v2 = v * v + 2 * Fd / m * ds[i];
    vB[k] = Math.min(Math.sqrt(v2), vF[k]);
  }

  const v = new Float64Array(n);
  for (let k = 0; k < n; k++) v[idx(k)] = vB[k];

  // 4) pedales, marcha, rpm, fuerzas g y tiempo
  const brakeRef = gripForce(72, 0) * 0.96;   // capacidad de frenada a ~260 km/h = 100 % de pedal
  const thr = new Float64Array(n), brk = new Float64Array(n), gear = new Uint8Array(n), rpm = new Float64Array(n);
  const gLat = new Float64Array(n), gLong = new Float64Array(n), t = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, vi = v[i], vj = v[j];
    const a = (vj * vj - vi * vi) / (2 * ds[i]);
    const need = m * a + drag(vi) + 0.012 * m * g + m * g * grade[i];
    const e = engine(vi);
    gear[i] = e.gear + 1; rpm[i] = e.rpm;
    if (need > 0) thr[i] = Math.min(1, need / e.F);
    else {
      const extra = -need - coast(vi);
      if (extra > 0.02 * brakeRef) brk[i] = Math.min(1, extra / brakeRef);
    }
    gLat[i] = vi * vi * kappa[i] / g;
    gLong[i] = a / g;
    t[i + 1] = t[i] + ds[i] / Math.max(0.5 * (vi + vj), 1);
  }

  // suavizado temporal de pedales (~0.1 s) para que se vean como manos y pies reales
  const thrS = new Float64Array(n), brkS = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const span = Math.max(1, Math.round(0.05 * v[i] / ds[i]));
    let st = 0, sb = 0, c = 0;
    for (let k = -span; k <= span; k++) { const j = (i + k + n) % n; st += thr[j]; sb += brk[j]; c++; }
    thrS[i] = st / c; brkS[i] = sb / c;
  }
  for (let i = 0; i < n; i++) {
    if (brkS[i] > 0.02 && thrS[i] > 0) { if (brkS[i] >= thrS[i]) thrS[i] = 0; else brkS[i] = 0; }
  }
  // frenadas que en la práctica son levantar el pie: pedal muy suave, o un recorte chico
  // de velocidad en curva rápida (Eau Rouge, Raidillon, Blanchimont)
  for (let i = 0; i < n; i++) {
    if (brkS[i] <= 0.02 || brkS[(i - 1 + n) % n] > 0.02) continue;
    let j = i, peak = 0, vMin = v[i];
    while (brkS[j % n] > 0.02 && j < i + n) { peak = Math.max(peak, brkS[j % n]); vMin = Math.min(vMin, v[j % n]); j++; }
    const fastScrub = v[i] > 200 / 3.6 && (v[i] - vMin) * 3.6 < 25;
    if (peak < 0.22 || fastScrub) for (let k = i; k < j; k++) brkS[k % n] = 0;
  }

  return { v, thr: thrS, brk: brkS, gear, rpm, gLat, gLong, t, lapTime: t[n], clA, cdA, mass: m,
           vmax: Math.max(...v), vmin: Math.min(...v) };
}

if (typeof module !== 'undefined') module.exports = { CAR_458, buildGeometry, simulateLap, lut };
