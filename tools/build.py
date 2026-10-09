"""Arma index.html: plantilla + simulador + trazada de Spa + tu última sesión grabada (si hay).

Uso: python tools/build.py [rotación del mapa en grados]   (Spa usa -50)
"""
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
rot = sys.argv[1] if len(sys.argv) > 1 else '0'


def read(name):
    return open(os.path.join(HERE, name), encoding='utf-8').read()


def latest_recording(track='spa'):
    """Última sesión de recordings/ para la pista, solo con vueltas completas y 1 de cada 2 muestras."""
    files = sorted(glob.glob(os.path.join(ROOT, 'recordings', f'*_{track}_*.json')), key=os.path.getmtime)
    if not files:
        return None, None
    rec = json.load(open(files[-1], encoding='utf-8'))
    keep = ('t', 'p', 'x', 'z', 'v', 'g', 'rpm', 'thr', 'brk')
    laps = []
    for lap in rec.get('laps', []):
        if not lap.get('complete') or not lap.get('time'):
            continue
        s = lap['s']
        laps.append({**{k: v for k, v in lap.items() if k != 's'}, 's': {k: s[k][::2] for k in keep}})
    if not laps:
        return None, files[-1]
    rec['laps'] = laps
    return rec, files[-1]


t = read('template.html')
sim = re.sub(r'(?m)^if \(typeof module.*$', '', read('sim.js'))
rec, rec_file = latest_recording()
t = (t.replace('/*__TRACK__*/', read('spa_line.json'))
      .replace('/*__SIM__*/', sim)
      .replace('/*__ROT__*/0', rot))
open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf-8').write(t)
# tus vueltas van aparte (mis-vueltas.js, fuera del repo) para que index.html no lleve datos personales
mine = os.path.join(ROOT, 'mis-vueltas.js')
if rec:
    rec.pop('player', None)
    open(mine, 'w', encoding='utf-8').write('window.MIS_VUELTAS = ' + json.dumps(rec, separators=(',', ':')) + ';\n')
elif os.path.exists(mine):
    os.remove(mine)
print(f'index.html: {len(t) // 1024} KB', end='')
if rec:
    print(f' · mis-vueltas.js con {os.path.basename(rec_file)}: {len(rec["laps"])} vueltas completas')
else:
    print(' · sin vueltas grabadas' + (f' (en {os.path.basename(rec_file)} no hay vueltas completas)' if rec_file else ''))
