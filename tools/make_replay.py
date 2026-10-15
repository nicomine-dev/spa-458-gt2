"""Arma un replay artificial de Assetto Corsa: una "carrera" de 458 GT2 en Spa entre la vuelta teórica,
la vuelta humana y tu mejor vuelta grabada, con largada lanzada desde la línea de meta.

Uso:
  python tools/make_replay.py [plantilla.acreplay] [salida.acreplay] [recordings/sesion.json]

Calcula las trayectorias con tools/replay_traj.js (Node) y escribe el replay en la carpeta de replays de AC.

La plantilla es un replay tuyo real del mismo auto en la misma pista: de ahí salen el encabezado, los datos
de pista y la geometría de las ruedas. Cada cuadro del auto se escribe de cero con la convención de AC:
yaw = -rumbo, matriz R = Ry(-yaw)·Rx(-pitch)·Rz(-roll), ruedas en coordenadas del mundo.
"""
import glob
import json
import math
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import acreplay as A  # noqa: E402

DOCS = os.path.expanduser(r'~/OneDrive/Documentos/Assetto Corsa/replay')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WHEELBASE, STEER_RATIO, CAMBER = 2.65, 11.9, 0.035
R_FRONT, R_REAR = 0.325, 0.355
BODY_LIFT = 0.06            # el cuerpo va ~6 cm sobre la línea AI (medido en replays reales)


# ---------- rotaciones con la convención de AC ----------
def ry(a): c, s = math.cos(a), math.sin(a); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]
def rx(a): c, s = math.cos(a), math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]
def rz(a): c, s = math.cos(a), math.sin(a); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]
def mm(a, b): return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
def mv(m, v): return [sum(m[i][k] * v[k] for k in range(3)) for i in range(3)]
def mtv(m, v): return [sum(m[k][i] * v[k] for k in range(3)) for i in range(3)]


def ac_matrix(yaw, pitch, roll):
    return mm(mm(ry(-yaw), rx(-pitch)), rz(-roll))


def ac_angles(m):
    """Inverso de ac_matrix: (yaw, pitch, roll)."""
    b = math.asin(max(-1.0, min(1.0, -m[1][2])))
    a = math.atan2(m[0][2], m[2][2])
    c = math.atan2(m[1][0], m[1][1])
    return -a, -b, -c


def wrap(x): return (x + math.pi) % (2 * math.pi) - math.pi


# ---------- plantilla ----------
def template_info(cars, car_id):
    """Geometría de ruedas (offsets locales), valores fijos de un cuadro en movimiento y el signo del giro."""
    best = None
    for c in cars:
        if c['id'] != car_id:
            continue
        fr = [A.unpack_frame(b) for _, b, _ in c['frames']]
        moving = [f for f in fr if math.hypot(*f['vel']) > 20]
        if len(moving) > 200 and (best is None or len(moving) > len(best[1])):
            best = (c, moving, fr)
    if not best:
        raise SystemExit(f'La plantilla no tiene un {car_id} en movimiento.')
    c, moving, allf = best
    offs = {'wsp': [[0, 0, 0] for _ in range(4)], 'wp': [[0, 0, 0] for _ in range(4)]}
    for f in moving:
        m = ac_matrix(*f['rot'])
        for key in offs:
            for w in range(4):
                d = [f[key][3 * w + i] - f['pos'][i] for i in range(3)]
                lo = mtv(m, d)
                for i in range(3):
                    offs[key][w][i] += lo[i] / len(moving)
    # signo del giro de la rueda: ángulo de la rueda respecto de la maza, cuadro a cuadro, contra la vel. angular
    votes = 0
    for k in range(len(allf) - 1):
        f0, f1 = allf[k], allf[k + 1]
        if math.hypot(*f0['vel']) < 20:
            continue
        def spin(f):
            s = ac_matrix(*f['wsr'][9:12]); w = ac_matrix(*f['wr'][9:12])
            rel = mm([list(r) for r in zip(*s)], w)          # s^T · w: rotación alrededor del eje X local
            return math.atan2(rel[2][1], rel[1][1])
        d = wrap(spin(f1) - spin(f0))
        if abs(d) > 1e-3:
            votes += 1 if d > 0 else -1
    return {'car': c, 'offs': offs, 'base': moving[len(moving) // 2], 'spinSign': 1 if votes >= 0 else -1}


# ---------- un cuadro ----------
def make_frame(info, st, spins):
    yaw = -math.atan2(st['fx'], st['fz'])
    pitch = math.asin(max(-1.0, min(1.0, st['fy'])))
    roll = 0.0
    m = ac_matrix(yaw, pitch, roll)
    pos = [st['x'], st['y'] + BODY_LIFT, st['z']]
    f = dict(info['base'])
    f['pos'] = pos
    f['rot'] = [yaw, pitch, roll]
    for key in ('wsp', 'wp'):
        vals = []
        for w in range(4):
            p = mv(m, info['offs'][key][w])
            vals += [pos[i] + p[i] for i in range(3)]
        f[key] = vals
    delta = math.atan(WHEELBASE * st['k'])               # ángulo de las ruedas delanteras (+ = derecha)
    v = st['v']
    wsr, wr = [], []
    for w in range(4):
        wy = yaw - delta if w < 2 else yaw
        wroll = roll - CAMBER if w % 2 == 0 else roll + CAMBER
        wsr += [wy, pitch, wroll]
        hub = ac_matrix(wy, pitch, wroll)
        wm = mm(hub, rx(info['spinSign'] * spins[w]))
        wr += list(ac_angles(wm))
    f['wsr'], f['wr'] = wsr, wr
    f['vel'] = [v * st['fx'], v * st['fy'], v * st['fz']]
    f['rpm'] = float(st['rpm'])
    f['wav'] = [v / R_FRONT, v / R_FRONT, v / R_REAR, v / R_REAR]
    f['sa'] = [0.0] * 4
    f['sr'] = [0.0] * 4
    f['nd'] = [0.0] * 4
    f['steer'] = -math.degrees(delta) * STEER_RATIO
    f['dts'] = v
    f['gear'] = max(0, min(255, int(st['gear']) + 1))   # AC: 0 reversa, 1 punto muerto, 2 primera
    f['gas'] = max(0, min(255, round(st['thr'] * 255)))
    f['brake'] = max(0, min(255, round(st['brk'] * 255)))
    f['lap'] = min(255, st['lap'])
    f['tCur'], f['tLast'], f['tBest'] = st['tLap'], st['tLast'], st['tBest']
    return A.pack_frame(f)


def frames_for(info, states, dt):
    spins = [0.0] * 4
    out = []
    for st in states:
        v = st['v']
        for w in range(4):
            spins[w] = (spins[w] + v / (R_FRONT if w < 2 else R_REAR) * dt) % (2 * math.pi)
        out.append((b'\0' * 20, make_frame(info, st, spins), b'\0' * (4 * info['car']['numWings'])))
    return out


def with_lap_times(states, lap_time_ms):
    for st in states:
        st['tLast'] = lap_time_ms if st['lap'] > 0 else 0
        st['tBest'] = st['tLast']
    return states


# ---------- tu vuelta grabada → estados por cuadro ----------
def recorded_states(rec_path, line, dt, frames):
    rec = json.load(open(rec_path, encoding='utf-8'))
    laps = [l for l in rec['laps'] if l.get('complete') and l.get('time')]
    if not laps:
        return None, None
    lap = min(laps, key=lambda l: l['time'])
    s = lap['s']
    T = [t / 1000 for t in s['t']]
    n = len(T)
    LX, LY, LZ = line['x'], line['y'], line['z']
    # altura: la del punto más cercano de la línea AI (se busca avanzando, la vuelta va en orden)
    j, ys = 0, []
    for k in range(n):
        best, bj = 1e18, j
        for q in range(j - 5, j + 60):
            qq = q % len(LX)
            dd = (LX[qq] - s['x'][k]) ** 2 + (LZ[qq] - s['z'][k]) ** 2
            if dd < best:
                best, bj = dd, qq
        j = bj
        ys.append(LY[j])
    lap_s = lap['time'] / 1000
    states = []
    idx = 0
    prev_heading = None
    for f in range(frames):
        time = f * dt
        lapn = int(time // lap_s)
        t = time - lapn * lap_s
        while idx < n - 2 and T[idx + 1] <= t:
            idx += 1
        while idx > 0 and T[idx] > t:
            idx -= 1
        a = max(0, idx - 3); b = min(n - 1, idx + 4)
        fx, fy, fz = s['x'][b] - s['x'][a], ys[b] - ys[a], s['z'][b] - s['z'][a]
        l = math.sqrt(fx * fx + fy * fy + fz * fz) or 1
        u = 0 if T[idx + 1] == T[idx] else min(1, max(0, (t - T[idx]) / (T[idx + 1] - T[idx])))
        I = lambda arr: arr[idx] + (arr[idx + 1] - arr[idx]) * u
        heading = math.atan2(fx, fz)
        # curvatura a partir del cambio de rumbo, para el volante
        k_ = 0.0
        if prev_heading is not None:
            dist = max(I(s['v']) / 3.6 * dt, 0.05)
            k_ = wrap(heading - prev_heading) / dist
        prev_heading = heading
        states.append({'x': I(s['x']), 'y': I(ys), 'z': I(s['z']), 'fx': fx / l, 'fy': fy / l, 'fz': fz / l,
                       'v': I(s['v']) / 3.6, 'thr': I(s['thr']), 'brk': I(s['brk']), 'gear': s['g'][idx],
                       'rpm': I(s['rpm']), 'k': max(-0.05, min(0.05, k_)), 'lap': lapn, 'tLap': int(t * 1000)})
    return states, lap


def main():
    args = sys.argv[1:]
    traj = json.loads(subprocess.run(['node', os.path.join(ROOT, 'tools', 'replay_traj.js'), '30'],
                                     capture_output=True, check=True).stdout)
    tpl = args[0] if len(args) > 0 else max(glob.glob(os.path.join(DOCS, '**', '*_ferrari_458_gt2_spa_*.acreplay'), recursive=True), key=os.path.getmtime)
    out_path = args[1] if len(args) > 1 else os.path.join(DOCS, 'Spa 458 GT2 - vuelta ideal.acreplay')
    rec_files = sorted(glob.glob(os.path.join(ROOT, 'recordings', '*_spa_ferrari_458_gt2.json')), key=os.path.getmtime)
    rec_path = args[2] if len(args) > 2 else (rec_files[-1] if rec_files else None)

    h, cars = A.read(tpl)
    info = template_info(cars, 'ferrari_458_gt2')
    print(f'plantilla: {os.path.basename(tpl)} · ruedas (local, m):',
          [[round(x, 2) for x in o] for o in info['offs']['wsp']], '· signo de giro', info['spinSign'])
    dt, frames = traj['dt'], traj['frames']
    line = json.load(open(os.path.join(ROOT, 'tools', 'spa_line.json'), encoding='utf-8'))

    entries = [
        ('Vuelta teórica', 'rosso_corsa', with_lap_times(traj['theory']['f'], round(traj['theory']['lapTime'] * 1000))),
        ('Vuelta humana', 'white', with_lap_times(traj['human']['f'], round(traj['human']['lapTime'] * 1000))),
    ]
    if rec_path:
        st, lap = recorded_states(rec_path, line, dt, frames)
        if st:
            # tu auto con tu skin: la del piloto de la grabación en la plantilla, si está
            player = json.load(open(rec_path, encoding='utf-8')).get('player')
            mine = next((c['skin'] for c in cars if c['id'] == info['car']['id'] and c['driver'] == player), info['car']['skin'])
            entries.append((f'Tu mejor vuelta (V{lap["n"]})', mine, with_lap_times(st, lap['time'])))
    base = info['car']
    new_cars = []
    for name, skin, states in entries:
        c = {k: base[k] for k in ('id', 'nation', 'team', 'numWings', 'trailing')}
        c['driver'], c['skin'] = name, skin
        c['frames'] = frames_for(info, states, dt)
        new_cars.append(c)
        print(f'  {name}: {len(states)} cuadros, skin {skin}')
    # datos de pista: se repiten los de la plantilla
    chunk = 4 + 12 * h['numTrackObjects']
    tf = h['trackFrames']
    nt = len(tf) // chunk
    h2 = dict(h)
    h2['interval'] = dt * 1000
    h2['numFrames'] = frames
    h2['trackFrames'] = b''.join(tf[(i % nt) * chunk:(i % nt + 1) * chunk] for i in range(frames))
    size = A.write(out_path, h2, new_cars)
    print(f'replay: {out_path} ({size / 1e6:.1f} MB, {frames * dt:.0f} s)')


if __name__ == '__main__':
    main()
