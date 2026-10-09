"""Extrae la línea AI (fast_lane.ai) de una pista de Assetto Corsa a JSON.

Uso:
  python tools/export.py                          -> Spa, escribe tools/spa_line.json
  python tools/export.py <pista> [layout] [salida.json] [carpeta_de_assettocorsa]

Formato de fast_lane.ai (versión 7): encabezado de 4 int32 (versión, puntos, tiempo, muestras),
luego cada punto como x, y, z, distancia (float) + id (int32), y un bloque extra de 18 floats por
punto donde los campos 5 y 6 son la distancia de la línea al borde izquierdo y derecho.
"""
import json
import os
import struct
import sys

AC_DEFAULT = r'E:/Programas/Steam/steamapps/common/assettocorsa'
HERE = os.path.dirname(os.path.abspath(__file__))

track = sys.argv[1] if len(sys.argv) > 1 else 'spa'
layout = sys.argv[2] if len(sys.argv) > 2 else ''
name = f'{track}-{layout}' if layout else track
out = sys.argv[3] if len(sys.argv) > 3 else os.path.join(HERE, f'{name}_line.json')
ac_root = sys.argv[4] if len(sys.argv) > 4 else AC_DEFAULT

base = os.path.join(ac_root, 'content', 'tracks', track, layout)
data = open(os.path.join(base, 'ai', 'fast_lane.ai'), 'rb').read()
version, n = struct.unpack_from('<2i', data, 0)
pts = [struct.unpack_from('<4fi', data, 16 + 20 * i) for i in range(n)]
off = 16 + 20 * n + 4
extra = [struct.unpack_from('<18f', data, off + 72 * i) for i in range(n)]

line = {
    'x': [round(p[0], 2) for p in pts],
    'y': [round(p[1], 2) for p in pts],
    'z': [round(p[2], 2) for p in pts],
    'l': [round(e[5], 2) for e in extra],
    'r': [round(e[6], 2) for e in extra],
}
json.dump(line, open(out, 'w'), separators=(',', ':'))
print(f'{name}: {n} puntos (fast_lane v{version}) -> {out}')
