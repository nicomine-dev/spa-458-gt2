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
- **Velocidad y pedales**: simulación cuasi-estática de vuelta (límite de adherencia con sensibilidad a la carga, motor, aero, pendientes y compresiones). Tiene dos versiones: la **teórica** (límite físico puro, 2:16.342) y la **humana** (piloto simulado con tiempos de pie, margen y anticipación, 2:22.437), con fantasma y diferencia en vivo entre las dos. Es una referencia para estudiar puntos de frenada y aceleración, no telemetría real.

Assetto Corsa y sus contenidos son de Kunos Simulazioni. Proyecto personal sin fines comerciales.

## App para Assetto Corsa (CSP)

`cm-app/Trazada` es una app de Lua para Custom Shaders Patch. En carrera muestra:

- el circuito con su ancho real, bordes y pianos, con la trazada de referencia encima coloreada por pedales (verde, gris, rojo con su intensidad) y tu auto como un punto relleno con lo que estás pisando vos;
- la próxima curva, los metros que faltan al punto de giro y los carteles 200 / 150 / 100 / 50 que se encienden al pasarlos, con un aviso **FRENÁ** en el punto de frenada de referencia;
- la frenada en grande ("FRENÁ A 70 m", con la cuenta regresiva y **¡FRENÁ!** al llegar), o "LEVANTÁ" / "A FONDO" si no hace falta frenar;
- la velocidad y la marcha ideales en el punto donde estás;
- una franja con los próximos 300 m de pedales.

Se puede elegir referencia humana o teórica, mapa siguiendo al auto (gira con el rumbo) o pista completa, y la opacidad de la caja desde la configuración de la app.

**Instalar:** copiar la carpeta `cm-app/Trazada` a `assettocorsa/apps/lua/` y abrirla desde la barra de apps del juego. Requiere CSP; está escrita contra la API de CSP 0.2.7.

**Otras pistas:** la app detecta la pista en la que estás y busca `data/<pista>.json` (o `data/<pista>-<layout>.json`). Para generar uno:

```sh
python tools/export.py <pista> [layout]     # extrae la línea AI a tools/<pista>_line.json
node tools/build_app.js <pista> [rotación]  # simula y escribe cm-app/Trazada/data/<pista>.json
```

Si existe `tools/corners/<pista>.json` usa esos nombres de curva; si no, detecta las curvas sola y las numera. Las velocidades y pedales de referencia se calculan con la física del 458 GT2: con otro auto la app lo avisa.

## Regenerar

Las fuentes están en `tools/`:

```sh
python tools/export.py      # extrae la línea AI de Spa a tools/spa_line.json
python tools/build.py -50   # arma index.html (-50 = rotación del mapa en grados)
node tools/build_app.js spa # datos de Spa para la app
node tools/test.js          # imprime tiempo de vuelta y velocidades por curva
```
