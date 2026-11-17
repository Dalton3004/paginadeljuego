# Mejoras v32

## Online más fluido (net/netsync.js)
- El servidor simula a 60 Hz pero manda el estado a **30 Hz** (snapshots un 50 % más livianos: se redondean las posiciones a 0,1 px y se descartan los viejos con `volatile`). Los cambios de estado (gol, fin) van siempre confiables.
- El cliente **interpola**: dibuja el partido ~80 ms en el pasado entre dos snapshots reales, así no se ve a tirones. Si falta un snapshot, extrapola como máximo 100 ms.
- **Predicción del jugador propio**: tu jugador se mueve al instante con tus teclas (misma fórmula que el servidor) y se corrige suave hacia lo que dice el servidor. En choques, barridas y festejos manda el servidor. La pelota que llevás acompaña a tu jugador.
- Se mide la latencia (`ping_rtt`) cada 2 s para ajustar la predicción.

## Pelota con altura (sim/pelota.js)
- Nuevo eje Z: gravedad, pique, sombra en el piso. Lo que va por el piso se comporta **igual que antes**.
- **R = pase elevado**: va por el aire, pasa por encima de los rivales y pica en el compañero que estás mirando (o ~260 px adelante).
- **Tiro cargado**: cuanto más lo cargás, más se eleva; al máximo puede irse por arriba del travesaño (que mide 30 px).
- **Cabezazos**: la pelota a la altura de la cabeza la cabecea el rival (siempre hacia adelante). Un pase elevado de tu equipo se deja bajar y se controla con el pecho.
- El arquero ahora saca con pelota alta y no alcanza los globitos por encima de su cabeza.

## IA
- **Desmarque**: los compañeros sin pelota se alejan de su marca y buscan una línea de pase libre.
- **Tácticas** (nuevo paso al elegir partido): EQUILIBRADA (1-2), OFENSIVA (2-1), DEFENSIVA (1-2 cerrado). Cambian la formación inicial y cuánto suben o se repliegan los compañeros. El rival sortea la suya.
- **Estrellas**: las estrellas de cada equipo (assets/equipos.js) ajustan ±6 % la IA de ese equipo en el partido (velocidad, reacción, arquero). Nunca al jugador que manejás.
- La IA usa pases elevados cuando un rival le cierra la línea.

## Seguridad
- El servidor ya no publica por HTTP `data/`, su propio código (`server.js`, `persistencia*.js`, `partido_online.js`, `sim_offline.js`), `package*.json`, configuración de deploy, `tests/`, `.md`/`.txt` ni archivos ocultos. Antes servía toda la carpeta tal cual.

## Orden del proyecto
- `game.js` (4.754 líneas) quedó dividido: `sim/` (reglas: config, vector, pelota, jugador, IA, gestor) y `game/` (menú, online, equipos, táctil, audio, input, render). `sim_offline.js` carga los archivos de `sim/`.
- `tests/`: `node tests/sim.test.mjs`, `node tests/netsync.test.mjs`, `node tests/online.test.mjs`.

## Fusión etapa 4 (sobre v32)
- Se conserva de v32: pelota con eje Z (gravedad, pique, travesaño, pase elevado con R, tiro cargado, cabezazo, sombra), NetSync (interpolación ~80 ms y predicción local), tácticas, y el servidor que no publica el código.
- Del trabajo anterior se suma un desmarque que puntúa varios apoyos (espacio, línea de pase, no amontonarse) sin dejar de respetar la formación táctica, y las estrellas también al alcance y la lectura del arquero. En línea, los bots de cada equipo usan las estrellas de su club; la persona que manejás no.

## No incluido (a pedido)
Córners, laterales y faltas.
