"""Graba tus vueltas de Assetto Corsa leyendo la memoria compartida del juego.

Uso (con el juego abierto y en pista):
  python tools/record.py            -> graba hasta que lo cortes con Ctrl+C

Guarda en recordings/<fecha>_<pista>_<auto>.json, y reescribe el archivo al terminar cada vuelta,
así no se pierde nada si se corta. Por vuelta: tiempo, si fue completa y válida (sin más de 2 ruedas
afuera y sin pasar por boxes), y las muestras (~50 por segundo) de posición en pista, coordenadas,
velocidad, marcha, rpm, acelerador, freno y volante.
"""
import json
import os
import sys
import time
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from acshm import SharedMemory  # noqa: E402

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'recordings')


def fmt(ms):
    return f'{ms // 60000}:{(ms % 60000) / 1000:06.3f}' if ms > 0 else '—'


def new_lap(number):
    return {'n': number, 'time': None, 'complete': False, 'valid': True, 'pit': False, 'tyresOutMax': 0,
            's': {k: [] for k in ('t', 'p', 'x', 'z', 'v', 'g', 'rpm', 'thr', 'brk', 'steer', 'out')}}


def main():
    sm = SharedMemory()
    st = sm.static()
    track, layout, car = st.track, st.trackConfiguration, st.carModel
    os.makedirs(OUT_DIR, exist_ok=True)
    suffix = f'_{track}{"-" + layout if layout else ""}_{car}.json'
    # si la última sesión es de esta pista y este auto y se tocó hace menos de 30 min, se sigue en el mismo archivo
    prev = sorted((f for f in os.listdir(OUT_DIR) if f.endswith(suffix)), key=lambda f: os.path.getmtime(os.path.join(OUT_DIR, f)))
    if prev and time.time() - os.path.getmtime(os.path.join(OUT_DIR, prev[-1])) < 1800:
        path = os.path.join(OUT_DIR, prev[-1])
        session = json.load(open(path, encoding='utf-8'))
        print(f"Sigo la sesión anterior ({len(session['laps'])} vueltas ya grabadas).", flush=True)
    else:
        path = os.path.join(OUT_DIR, f'{datetime.now():%Y-%m-%d_%H%M}{suffix}')
        session = {'track': track, 'layout': layout, 'car': car, 'player': st.playerNick or st.playerName,
                   'splineLength': round(st.trackSPlineLength, 1), 'started': datetime.now().isoformat(timespec='seconds'),
                   'laps': []}
    print(f'Grabando {track} con {car} -> {path}\nCtrl+C para terminar.', flush=True)

    def save():
        tmp = path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(session, f, separators=(',', ':'))
        os.replace(tmp, path)

    g = sm.graphics()
    lap = new_lap(g.completedLaps + 1)
    last_packet, last_laps = -1, g.completedLaps
    try:
        while True:
            p, g = sm.physics(), sm.graphics()
            if g.status != 2 or p.packetId == last_packet:   # solo en pista y con datos nuevos
                time.sleep(0.005)
                continue
            last_packet = p.packetId
            if g.completedLaps != last_laps:
                # cerró una vuelta: el tiempo oficial es el de "última vuelta" del juego
                lap['time'] = g.iLastTime
                s = lap['s']
                lap['complete'] = len(s['p']) > 100 and s['p'][0] < 0.02 and max(s['p']) > 0.98
                lap['valid'] = lap['complete'] and lap['valid'] and not lap['pit']
                session['laps'].append(lap)
                save()
                state = 'válida' if lap['valid'] else ('incompleta' if not lap['complete'] else 'inválida')
                print(f"Vuelta {lap['n']}: {fmt(lap['time'])} ({state})", flush=True)
                lap = new_lap(g.completedLaps + 1)
                last_laps = g.completedLaps
            s = lap['s']
            s['t'].append(g.iCurrentTime)
            s['p'].append(round(g.normalizedCarPosition, 6))
            s['x'].append(round(g.carCoordinates[0], 2))
            s['z'].append(round(g.carCoordinates[2], 2))
            s['v'].append(round(p.speedKmh, 1))
            s['g'].append(p.gear - 1)                         # en AC 0 = reversa, 1 = punto muerto
            s['rpm'].append(p.rpms)
            s['thr'].append(round(p.gas, 3))
            s['brk'].append(round(p.brake, 3))
            s['steer'].append(round(p.steerAngle, 3))
            s['out'].append(p.numberOfTyresOut)                # ruedas afuera de la pista en ese instante
            lap['tyresOutMax'] = max(lap['tyresOutMax'], p.numberOfTyresOut)
            if p.numberOfTyresOut > 2:
                lap['valid'] = False
            if g.isInPitLane or g.isInPit:
                lap['pit'] = True
            time.sleep(0.018)
    except KeyboardInterrupt:
        pass
    finally:
        if session['laps']:
            save()
        print(f"Listo: {len(session['laps'])} vueltas en {path}", flush=True)
        sm.close()


if __name__ == '__main__':
    main()
