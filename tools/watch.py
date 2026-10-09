"""Regenera la página cada vez que tools/record.py guarda una vuelta nueva (después, F5 en el navegador).

Uso: python tools/watch.py   (Ctrl+C para terminar)
"""
import glob
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def newest():
    files = glob.glob(os.path.join(ROOT, 'recordings', '*.json'))
    return max((os.path.getmtime(f) for f in files), default=0)


last = newest()
print('Esperando vueltas nuevas… (Ctrl+C para terminar)', flush=True)
try:
    while True:
        time.sleep(2)
        m = newest()
        if m > last:
            last = m
            time.sleep(0.5)   # que termine de escribir
            subprocess.run([sys.executable, os.path.join(HERE, 'build.py'), '-50'], cwd=ROOT)
except KeyboardInterrupt:
    pass
