// ---- Ferrari 458 GT2 (datos de Assetto Corsa: car.ini, engine.ini, drivetrain.ini, aero.ini, tyres.ini, ai.ini) ----
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
  shiftUp: 7150, shiftDown: 4700,     // puntos de cambio de la IA de Kunos para este auto (ai.ini [GEARS])
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

// ---- Piloto humano: supuestos (no salen del juego; son valores típicos de un buen piloto de simulador) ----
const HUMAN = {
  brakeMargin: 0.06,    // frena con 6 puntos menos de grip que el que usa en curva
  tractionMargin: 0.03, // y acelera dejando un poco de margen de patinamiento
  look: 0.3,            // s de anticipación: mira dónde va a estar en 0,3 s
  thrApply: 2.5,        // acelerador: 0 → 100 % en 0,4 s
  thrRelease: 10,       // lo suelta en 0,1 s
  brkApply: 7,          // freno: 0 → 100 % en ~0,15 s
  brkRelease: 2.5,      // lo va soltando en 0,4 s (trail braking)
  swap: 0.1,            // s con los dos pedales sueltos al cambiar de pie
  shiftCut: 0.08,       // s sin empuje en cada cambio ascendente
  liftAbove: 200,       // km/h: arriba de esto, si tiene que bajar menos de...
  liftUnder: 25,        // ...25 km/h, levanta el pie en vez de frenar (Eau Rouge, Blanchimont)
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

// ---- Modelo físico del auto sobre la pista ----
function makeModel(G, CAR, opt) {
  const { grade, kv } = G;
  const g = 9.81, rho = 1.2;
  const m = CAR.mass + opt.fuel * CAR.fuelDensity;
  const A = CAR.wingArea;
  const clA = A * (CAR.body.cl + CAR.front.cl + CAR.diffuser.cl + lut(CAR.rearCL, opt.wing));
  const cdA = A * (CAR.body.cd + CAR.front.cd + CAR.diffuser.cd + lut(CAR.rearCD, opt.wing));
  const down = v => 0.5 * rho * clA * v * v;
  const drag = v => 0.5 * rho * cdA * v * v;
  const roll = 0.012 * m * g;
  const slope = i => m * g * grade[i];
  const muAt = fz => CAR.muRef * Math.pow(Math.max(fz, 1) / 4 / CAR.fz0, CAR.lsExp - 1) * opt.grip;
  const loadAt = (v, i) => m * g * Math.sqrt(1 - grade[i] * grade[i]) + down(v) + m * v * v * kv[i];
  const gripForce = (v, i) => { const fz = loadAt(v, i); return muAt(fz) * fz; };
  const rpmOf = (v, gi) => v / CAR.rWheel * CAR.gears[gi] * CAR.final * 60 / (2 * Math.PI);
  const forceIn = (v, gi) => {
    const rpm = Math.min(rpmOf(v, gi), CAR.limiter);
    return lut(CAR.torque, Math.max(rpm, 3000)) * CAR.gears[gi] * CAR.final * CAR.driveEff / CAR.rWheel;
  };
  // marcha de máxima fuerza en la rueda (óptimo teórico: cambia justo donde la marcha siguiente empuja más)
  function bestGear(v) {
    let gi = CAR.gears.length - 1, F = 0;
    for (let k = 0; k < CAR.gears.length; k++) {
      if (rpmOf(v, k) > CAR.limiter) continue;
      const f = forceIn(v, k);
      if (f > F) { F = f; gi = k; }
    }
    return gi;
  }
  // marcha como la maneja la IA de Kunos: sube pasando shiftUp, baja por debajo de shiftDown
  const last = CAR.gears.length - 1;
  function aiShift(v, gi) {
    while (gi < last && rpmOf(v, gi) > CAR.shiftUp) gi++;
    while (gi > 0 && rpmOf(v, gi) < CAR.shiftDown && rpmOf(v, gi - 1) < CAR.limiter) gi--;
    return gi;
  }
  const coastIn = (v, gi) => CAR.coastTorque * (Math.min(rpmOf(v, gi), CAR.limiter) / CAR.coastRpm) * CAR.gears[gi] * CAR.final / CAR.rWheel;
  const brakeRef = gripForce(72, 0) * 0.96;   // capacidad de frenada a ~260 km/h = 100 % de pedal
  return { m, g, clA, cdA, drag, roll, slope, gripForce, rpmOf, forceIn, bestGear, aiShift, coastIn, brakeRef, rearShare: CAR.rearShare };
}

// Velocidad límite: curvas, aceleración y frenada (pasadas hacia adelante y atrás)
function limitProfile(G, M, use) {
  const { n, ds, kappa } = G;
  const { m, drag, roll, slope, gripForce, forceIn, bestGear, coastIn } = M;
  const vLat = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const k = Math.abs(kappa[i]);
    let v = 95;
    if (k > 1e-5) {
      for (let it = 0; it < 40; it++) {
        const vn = Math.sqrt(gripForce(v, i) * use.lat / (m * k));
        v = 0.5 * v + 0.5 * Math.min(vn, 120);
      }
    } else v = 120;
    vLat[i] = Math.min(v, 120);
  }
  let i0 = 0;
  for (let i = 1; i < n; i++) if (vLat[i] < vLat[i0]) i0 = i;
  const idx = k => (i0 + k) % n;
  const latUse = (v, i) => {
    const cap = gripForce(v, i) * use.lat / m;
    const used = v * v * Math.abs(kappa[i]);
    return Math.sqrt(Math.max(0, 1 - Math.min(1, used / cap) ** 2));
  };
  const vF = new Float64Array(n + 1);
  vF[0] = vLat[i0];
  for (let k = 0; k < n; k++) {
    const i = idx(k), v = vF[k];
    const traction = gripForce(v, i) * use.traction * M.rearShare * latUse(v, i);
    const Fx = Math.min(forceIn(v, bestGear(v)), traction) - drag(v) - roll - slope(i);
    vF[k + 1] = Math.min(Math.sqrt(Math.max(v * v + 2 * Fx / m * ds[i], 1)), vLat[idx(k + 1)]);
  }
  const vB = new Float64Array(n + 1);
  vB[n] = vF[n];
  for (let k = n - 1; k >= 0; k--) {
    const i = idx(k), v = vB[k + 1];
    const Fd = gripForce(v, i) * 0.96 * use.brake * latUse(v, i) + drag(v) + roll + slope(i) + coastIn(v, bestGear(v));
    vB[k] = Math.min(Math.sqrt(v * v + 2 * Fd / m * ds[i]), vF[k]);
  }
  const v = new Float64Array(n);
  for (let k = 0; k < n; k++) v[idx(k)] = vB[k];
  return { v, vLat, i0, latUse };
}

// Tiempo, fuerzas g y resumen a partir de v
function finish(G, M, v, thr, brk, gear, rpm) {
  const { n, ds, kappa } = G;
  const gLat = new Float64Array(n), gLong = new Float64Array(n), t = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    gLat[i] = v[i] * v[i] * kappa[i] / M.g;
    gLong[i] = (v[j] * v[j] - v[i] * v[i]) / (2 * ds[i]) / M.g;
    t[i + 1] = t[i] + ds[i] / Math.max(0.5 * (v[i] + v[j]), 1);
  }
  let vmax = 0, vmin = Infinity;
  for (let i = 0; i < n; i++) { vmax = Math.max(vmax, v[i]); vmin = Math.min(vmin, v[i]); }
  return { v, thr, brk, gear, rpm, gLat, gLong, t, lapTime: t[n], clA: M.clA, cdA: M.cdA, mass: M.m, vmax, vmin };
}

// ---- Óptimo teórico: 100 % del grip, marcha de máxima fuerza, pedales exactos ----
function simulateTheory(G, CAR, opt) {
  const M = makeModel(G, CAR, opt);
  const { n, ds, grade } = G;
  const { v } = limitProfile(G, M, { lat: 1, brake: 1, traction: 1 });
  const thr = new Float64Array(n), brk = new Float64Array(n), gear = new Uint8Array(n), rpm = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, vi = v[i];
    const a = (v[j] * v[j] - vi * vi) / (2 * ds[i]);
    const need = M.m * a + M.drag(vi) + M.roll + M.slope(i);
    const gi = M.bestGear(vi);
    gear[i] = gi + 1; rpm[i] = Math.min(M.rpmOf(vi, gi), CAR.limiter);
    if (need > 0) thr[i] = Math.min(1, need / M.forceIn(vi, gi));
    else {
      const extra = -need - M.coastIn(vi, gi);
      if (extra > 0) brk[i] = Math.min(1, extra / M.brakeRef);
    }
  }
  // limpia el ruido numérico de un par de muestras, sin cambiar la forma
  const thrS = smooth(thr, 1), brkS = smooth(brk, 1);
  for (let i = 0; i < n; i++) {
    if (brkS[i] < 0.01) brkS[i] = 0;
    if (thrS[i] < 0.01) thrS[i] = 0;
    if (brkS[i] > 0 && thrS[i] > 0) { if (brkS[i] >= thrS[i]) thrS[i] = 0; else brkS[i] = 0; }
  }
  return finish(G, M, v, thrS, brkS, gear, rpm);
}

// ---- Piloto humano: maneja en el tiempo, con pies que tardan, margen y anticipación ----
function simulateHuman(G, CAR, opt) {
  const H = HUMAN, M = makeModel(G, CAR, opt);
  const { n, ds } = G;
  const lat = opt.level, use = { lat, brake: lat - H.brakeMargin, traction: lat - H.tractionMargin };
  const plan = limitProfile(G, M, use);          // la vuelta que el piloto "tiene en la cabeza"
  const vT = plan.v, vCap = plan.vLat;
  const vAhead = (i, look) => {                   // velocidad objetivo a 'look' metros
    let j = i, d = 0, vm = vT[i];
    while (d < look) { d += ds[j]; j = (j + 1) % n; vm = Math.min(vm, vT[j]); }
    return vm;
  };
  const v = new Float64Array(n), thr = new Float64Array(n), brk = new Float64Array(n), gear = new Uint8Array(n), rpm = new Float64Array(n);
  let i = plan.i0, vel = vT[i], th = 0, br = 0, swapT = 0, cut = 0, gi = M.aiShift(vel, M.bestGear(vel));
  let over = 0;
  for (let step = 0; step < 2 * n; step++) {
    const dt = ds[i] / Math.max(vel, 1);
    const look = Math.max(vel * H.look, 4);
    const vt = vAhead(i, look);
    const aD = (vt * vt - vel * vel) / (2 * look);
    const resist = M.drag(vel) + M.roll + M.slope(i);
    const coastF = M.coastIn(vel, gi);
    let thT = 0, brT = 0;
    if (M.m * aD + resist + coastF < -0.01 * M.brakeRef) brT = Math.min(1, (-M.m * aD - resist - coastF) / M.brakeRef);
    else if (M.m * aD + resist > 0) thT = Math.min(1, (M.m * aD + resist) / M.forceIn(vel, gi));
    // en curva rápida, para bajar unos pocos km/h el humano levanta en vez de frenar:
    // mira el punto más lento de los próximos 250 m y suelta justo a tiempo para llegar sin freno
    if (vel > H.liftAbove / 3.6) {
      let j = i, d = 0, vMin = Infinity, dMin = 0;   // velocidad de curva (límite lateral), no la del plan
      while (d < 250) { d += ds[j]; j = (j + 1) % n; if (vCap[j] < vMin) { vMin = vCap[j]; dMin = d; } }
      const drop = vel - vMin;
      if (drop > 0 && drop * 3.6 < H.liftUnder) {
        const aC = (resist + coastF) / M.m;
        brT = 0;
        if (dMin <= (vel * vel - vMin * vMin) / (2 * Math.max(aC, 0.5)) * 1.05) thT = 0;
      }
    }
    // pies: un pedal por vez, con su tiempo de aplicación y de suelta
    const want = brT > 0 ? 'b' : thT > 0.005 ? 't' : 'c';
    if (want === 'b') {
      if (th > 0) { th = Math.max(0, th - H.thrRelease * dt); if (th === 0) swapT = H.swap; }
      else if (swapT > 0) swapT -= dt;
      else br = br < brT ? Math.min(brT, br + H.brkApply * dt) : Math.max(brT, br - H.brkRelease * dt);
    } else if (want === 't') {
      if (br > 0) { br = Math.max(0, br - H.brkRelease * dt); if (br === 0) swapT = H.swap; }
      else if (swapT > 0) swapT -= dt;
      else th = th < thT ? Math.min(thT, th + H.thrApply * dt) : Math.max(thT, th - H.thrRelease * dt);
    } else {
      th = Math.max(0, th - H.thrRelease * dt);
      br = Math.max(0, br - H.brkRelease * dt);
    }
    // cambios como la IA de Kunos, con corte de empuje al subir
    const ng = M.aiShift(vel, gi);
    if (ng > gi) cut = H.shiftCut;
    gi = ng;
    if (cut > 0) cut -= dt;
    // fuerzas con el margen del piloto (ABS y control de tracción recortan lo que no entra)
    const lu = plan.latUse(vel, i);
    const traction = M.gripForce(vel, i) * use.traction * CAR.rearShare * lu;
    const Fdrive = cut > 0 ? 0 : Math.min(th * M.forceIn(vel, gi), traction);
    const Fbrake = Math.min(br * M.brakeRef, M.gripForce(vel, i) * 0.96 * use.brake * lu);
    const Fx = Fdrive - Fbrake - resist - (th === 0 ? coastF : 0);
    const j = (i + 1) % n;
    let vn = Math.sqrt(Math.max(vel * vel + 2 * Fx / M.m * ds[i], 1));
    if (vn > vCap[j]) {
      if (step >= n && vn - vCap[j] > 0.5) over++;
      // no le entra más velocidad en la curva: dosifica el acelerador justo a lo que se puede
      vn = vCap[j];
      if (th > 0) th = Math.max(0, Math.min(th, (M.m * (vn * vn - vel * vel) / (2 * ds[i]) + resist) / M.forceIn(vel, gi)));
    }
    if (step >= n) {
      v[i] = vel; thr[i] = th; brk[i] = br; gear[i] = gi + 1; rpm[i] = Math.min(M.rpmOf(vel, gi), CAR.limiter);
    }
    vel = vn; i = j;
  }
  const r = finish(G, M, v, thr, brk, gear, rpm);
  r.over = over;
  return r;
}

function simulateLap(G, CAR, opt) {
  return opt.mode === 'human' ? simulateHuman(G, CAR, opt) : simulateTheory(G, CAR, opt);
}

// Mejor ángulo de alerón para la vuelta elegida
function bestWing(G, CAR, opt) {
  let best = null;
  for (let w = 0; w <= 10; w++) {
    const r = simulateLap(G, CAR, { ...opt, wing: w });
    if (!best || r.lapTime < best.lap - 1e-4) best = { wing: w, lap: r.lapTime };
  }
  return best;
}

if (typeof module !== 'undefined') module.exports = { CAR_458, HUMAN, buildGeometry, simulateLap, simulateTheory, simulateHuman, bestWing, lut };
