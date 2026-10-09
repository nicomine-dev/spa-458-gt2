# Spa · trazada ideal (Ferrari 458 GT2)

Página interactiva de Spa-Francorchamps con la trazada ideal. Un punto recorre la vuelta y deja un rastro coloreado según los pedales:

- **verde**: acelera (más intenso cuanto más pisa)
- **gris**: suelta los pedales
- **rojo**: frena (más intenso cuanto más presión)

Incluye velocímetro, marcha, rpm, barras de pedales, diagrama G-G, cámara que sigue al auto, traza de velocidad por distancia, datos por curva y una puesta a punto en vivo (alerón trasero, nafta, grip, nivel del piloto) que recalcula la vuelta.

## Uso

Abrí `index.html` en el navegador. Es un solo archivo, sin servidor ni dependencias.

Atajos: `Espacio` pausa · `←` `→` ±1 s · `1`–`5` velocidad · `F` seguir auto · `C` borrar rastro.

## De dónde salen los datos

- **Trazada y ancho de pista**: línea AI (`fast_lane.ai`) de Spa en Assetto Corsa.
- **Auto**: parámetros físicos del Ferrari 458 GT2 de Assetto Corsa (curva de torque, relaciones de caja, freno motor, aerodinámica, gomas).
- **Velocidad y pedales**: simulación cuasi-estática de vuelta (límite de adherencia con sensibilidad a la carga, motor, aero, pendientes y compresiones). Da una vuelta de ~2:18.8 con el piloto al 95 % del límite. Es una referencia para estudiar puntos de frenada y aceleración, no telemetría real.

Assetto Corsa y sus contenidos son de Kunos Simulazioni. Proyecto personal sin fines comerciales.

## Regenerar

Las fuentes están en `tools/`:

```sh
python tools/build.py -50   # arma index.html (-50 = rotación del mapa en grados)
node tools/test.js          # imprime tiempo de vuelta y velocidades por curva
```

`tools/export.py` vuelve a extraer `spa_line.json` desde `fast_lane.ai` (ajustar la ruta del juego).
