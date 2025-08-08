# Tetris Neon

Juego de Tetris en HTML5 Canvas con una interfaz neon, toma de nombre de usuario por sesión y panel de puntaje.

## Características
- Solicita nombre al iniciar (o seguir como Invitado). Se guarda en sessionStorage y localStorage.
- Panel con usuario, puntaje, mejor puntaje, líneas y nivel.
- Vista de siguiente pieza y pieza guardada (hold).
- Controles: ← → mover, ↑ rotar CW, Z rotar CCW, ↓ caída suave, Space caída dura, C/Shift guardar, P pausa.
- Piezas con estilo neon y sombra, ghost piece, y overlays de pausa / fin del juego.

## Ejecutar
Abre `index.html` en tu navegador. Si usas un servidor local:

```pwsh
# Opción 1: con Python 3 instalado
python -m http.server 5173

# Opción 2: con Node.js (si tienes npx)
npx serve -l 5173
```

Luego visita: http://localhost:5173

## Estructura
- `index.html`: Maquetación y UI.
- `style.css`: Estilos neon y layout.
- `main.js`: Lógica del juego.

¡Disfruta!
