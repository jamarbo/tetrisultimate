// Configuración de tiempo real
// Cambia provider a 'firebase' y rellena las credenciales para juego entre dispositivos.
// Con 'local' funcionará entre pestañas del mismo navegador (BroadcastChannel), útil para pruebas.
window.REALTIME_CONFIG = {
  provider: 'firebase', // 'local' | 'firebase'
  firebase: {
    apiKey: 'TU_API_KEY',
    authDomain: 'TU_PROJECT_ID.firebaseapp.com',
    projectId: 'TU_PROJECT_ID',
    appId: 'TU_APP_ID',
  }
};
