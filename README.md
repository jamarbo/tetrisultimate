# Tetris Neon

Juego de Tetris en HTML5 Canvas con una interfaz neon, toma de nombre de usuario por sesión y panel de puntaje. Incluye multijugador (hasta 4) con marcador en vivo.

## Características
- Solicita nombre al iniciar (o seguir como Invitado). Se guarda en sessionStorage y localStorage.
- Panel con usuario, puntaje, mejor puntaje, líneas y nivel.
- Vista de siguiente pieza y pieza guardada (hold).
- Controles: ← → mover, ↑ rotar CW, Z rotar CCW, ↓ caída suave, Space caída dura, C/Shift guardar, P pausa.
- Piezas con estilo neon y sombra, ghost piece, y overlays de pausa / fin del juego.
- Responsive con controles táctiles y HUD móvil.
- Dificultad gradual (sube levemente la velocidad por líneas y piezas fijadas).
- Multijugador local entre pestañas (BroadcastChannel) u opcionalmente entre dispositivos con Firebase Firestore.
- Efectos visuales: animación de “Perdió 😢” y “Nivel X ★★”.
- Sonidos sutiles: estrellitas al subir de nivel y “wah” al perder. Botón para silenciar/activar con persistencia.

## Ejecutar
Abre `index.html` en tu navegador. Si usas un servidor local:

```pwsh
# Opción 1: con Python 3 instalado
python -m http.server 5173

# Opción 2: con Node.js (si tienes npx)
npx serve -l 5173
```

Luego visita: http://localhost:5173

### Sonido / Mute

- El botón 🔊 en el header activa/desactiva los efectos de sonido (se guarda en localStorage). Si está silenciado, se muestra 🔈.
- Los SFX se generan con Web Audio (no requiere archivos de audio externos).

## Estructura
- `index.html`: Maquetación y UI.
- `style.css`: Estilos neon y layout.
- `main.js`: Lógica del juego.
- `config.js`: Configuración de tiempo real (local o Firebase).

¡Disfruta!

## Multijugador (hasta 4 jugadores)

Este proyecto soporta dos modos de tiempo real:

1) Local (entre pestañas del mismo navegador): BroadcastChannel (compatible con GitHub Pages)
	 - Deja `provider: 'local'` en `config.js`.
	 - Abre dos pestañas a la misma URL, elige una sala (ej. `tetris-1`) y verás el marcador sincronizado.

2) Firebase (entre dispositivos): Firestore (también compatible sirviendo estático desde GitHub Pages)

Pasos para configurar Firebase:
- Crea un proyecto en https://console.firebase.google.com y habilita Firestore en modo producción.
- En `config.js`, define:

```js
window.REALTIME_CONFIG = {
	provider: 'firebase',
	firebase: {
		apiKey: 'TU_API_KEY',
		authDomain: 'TU_PROJECT_ID.firebaseapp.com',
		projectId: 'TU_PROJECT_ID',
		appId: 'TU_APP_ID',
	}
};
```

Reglas de seguridad recomendadas para Firestore (mínimas para este caso):

```js
rules_version = '2';
service cloud.firestore {
	match /databases/{database}/documents {
		// Colección para rooms: tetris-rooms
		match /tetris-rooms/{roomId} {
			allow read: if true; // lectura pública (puedes restringir por origen si usas Firebase Hosting)
			allow write: if true; // escritura pública (para demo). En producción, añade checks por IP/ratelimit/uid.

			match /events/{eventId} {
				allow read: if true;
				allow write: if request.resource.data.keys().hasAll(['type'])
										 && request.resource.data.size() <= 1024; // limitar tamaño
			}
		}
	}
}
```

Notas:
- GitHub Pages es hosting estático: no soporta servidores ni WebSockets; por eso usamos BroadcastChannel (local) o Firestore (entre dispositivos).
- Si despliegas con provider 'firebase' pero dejas credenciales vacías/placeholder, la app hace fallback automático a modo local (BroadcastChannel) y no se rompe.
- Para producción seria, restringe reglas, añade autenticación y validaciones de esquema.

## Despliegue en GitHub Pages

- En Settings > Pages del repositorio, selecciona “Deploy from a branch”, rama `main`, carpeta `/`.
- La app es estática, no requiere build.
