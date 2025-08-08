// Configuración de tiempo real
// Cambia provider a 'firebase' y rellena las credenciales para juego entre dispositivos.
// Con 'local' funcionará entre pestañas del mismo navegador (BroadcastChannel), útil para pruebas.
window.REALTIME_CONFIG = {
  provider: 'local', // 'local' | 'firebase'
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    appId: '',
  }
};
