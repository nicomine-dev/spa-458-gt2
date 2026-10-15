"""Lectura y escritura de replays de Assetto Corsa (.acreplay, versión 16).

Estructura tomada del parser de abchouhan (github.com/abchouhan/acreplay-parser) y verificada contra
replays reales: encabezado, cuadros de objetos de pista y, por auto, cuadros de 256 bytes con posición,
rotación (Euler en float16), ruedas, velocidad, rpm, marcha, pedales y tiempos de vuelta. Entre cuadros
hay 20 bytes sin descifrar y 4 bytes por "ala" aerodinámica; se conservan tal cual al reescribir.
"""
import struct

FRAME = struct.Struct(
    '<3f 3e 2x'         # posición del cuerpo, rotación (Euler YXZ) en radianes
    '12f 12e'           # ruedas: posición y rotación de lo que no gira (mazas, calipers)
    '12f 12e'           # ruedas: posición y rotación de la rueda
    '3e e 4e 4e 4e 4e 4e'  # velocidad, rpm, vel. angular, slip angle, slip ratio, ndSlip, carga
    'e e e 2x'          # volante (grados), ruido de carrocería, velocidad de la transmisión
    '3I'                # tiempo de vuelta actual, última, mejor (ms)
    'B B B 4B B B B B B B B B B'  # nafta, nafta/vuelta, marcha, suciedad gomas, daños(5), gas, freno, vuelta, ?
    'H H B B B x'       # estado, ?, suciedad, motor, turbo
)
assert FRAME.size == 256, FRAME.size

FIELDS = (['pos'] * 3 + ['rot'] * 3 + ['wsp'] * 12 + ['wsr'] * 12 + ['wp'] * 12 + ['wr'] * 12 + ['vel'] * 3 +
          ['rpm'] + ['wav'] * 4 + ['sa'] * 4 + ['sr'] * 4 + ['nd'] * 4 + ['load'] * 4 + ['steer', 'noise', 'dts'] +
          ['tCur', 'tLast', 'tBest'] + ['fuel', 'fuelLap', 'gear'] + ['dirtT'] * 4 + ['dmg'] * 5 +
          ['gas', 'brake', 'lap', 'unk'] + ['status', 'unk2', 'dirt', 'engine', 'boost'])


def unpack_frame(b, off=0):
    """Devuelve un dict con listas/valores del cuadro."""
    vals = FRAME.unpack_from(b, off)
    out = {}
    for name, v in zip(FIELDS, vals):
        if name in out:
            if not isinstance(out[name], list):
                out[name] = [out[name]]
            out[name].append(v)
        else:
            out[name] = v
    return out


def pack_frame(fr):
    vals = []
    seen = {}
    for name in FIELDS:
        v = fr[name]
        if isinstance(v, list):
            k = seen.get(name, 0)
            vals.append(v[k])
            seen[name] = k + 1
        else:
            vals.append(v)
    return FRAME.pack(*vals)


class Reader:
    def __init__(self, data):
        self.d, self.o = data, 0

    def i32(self):
        v = struct.unpack_from('<I', self.d, self.o)[0]
        self.o += 4
        return v

    def f64(self):
        v = struct.unpack_from('<d', self.d, self.o)[0]
        self.o += 8
        return v

    def s(self):
        n = self.i32()
        v = self.d[self.o:self.o + n].decode('utf-8', 'replace')
        self.o += n
        return v

    def raw(self, n):
        v = self.d[self.o:self.o + n]
        self.o += n
        return v


def read(path):
    """Lee el replay completo. Los cuadros de cada auto quedan como bytes crudos (para reescribir sin perder nada)."""
    data = open(path, 'rb').read()
    r = Reader(data)
    h = {'version': r.i32()}
    if h['version'] != 16:
        raise ValueError(f'versión {h["version"]}: solo se soporta la 16')
    h['interval'] = r.f64()
    h['weather'], h['track'], h['config'] = r.s(), r.s(), r.s()
    h['numCars'], h['recIndex'], h['numFrames'], h['numTrackObjects'] = r.i32(), r.i32(), r.i32(), r.i32()
    track_len = (4 + 12 * h['numTrackObjects']) * h['numFrames']
    h['trackFrames'] = r.raw(track_len)
    cars = []
    for _ in range(h['numCars']):
        c = {'start': r.o, 'id': r.s(), 'driver': r.s(), 'nation': r.s(), 'team': r.s(), 'skin': r.s()}
        c['numFrames'], c['numWings'] = r.i32(), r.i32()
        stride = 20 + FRAME.size + 4 * c['numWings']
        c['frames'] = []                       # (20 bytes previos, cuadro de 256, alas)
        for _ in range(c['numFrames']):
            pre = r.raw(20)
            fr = r.raw(FRAME.size)
            wings = r.raw(4 * c['numWings'])
            c['frames'].append((pre, fr, wings))
        count = r.i32()
        c['trailing'] = r.raw(8 * count)
        c['stride'] = stride
        cars.append(c)
    h['rest'] = data[r.o:]                     # datos extra de CSP y la marca del final
    h['restOffset'] = r.o
    return h, cars


def write(path, h, cars):
    """Escribe un replay con el encabezado y los autos dados. Los datos extra de CSP no se escriben."""
    out = bytearray()
    w = lambda fmt, *v: out.extend(struct.pack(fmt, *v))
    ws = lambda s: (w('<I', len(s.encode('utf-8'))), out.extend(s.encode('utf-8')))
    w('<I', 16)
    w('<d', h['interval'])
    ws(h['weather']); ws(h['track']); ws(h['config'])
    w('<IIII', len(cars), h['numFrames'], h['numFrames'], h['numTrackObjects'])
    out.extend(h['trackFrames'])
    for c in cars:
        ws(c['id']); ws(c['driver']); ws(c['nation']); ws(c['team']); ws(c['skin'])
        w('<II', len(c['frames']), c['numWings'])
        for pre, fr, wings in c['frames']:
            out.extend(pre); out.extend(fr); out.extend(wings)
        w('<I', len(c['trailing']) // 8)
        out.extend(c['trailing'])
    open(path, 'wb').write(out)
    return len(out)
