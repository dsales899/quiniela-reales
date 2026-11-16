// Enganxa aquí la configuració de la teua app web de Firebase (Consola > Configuració del projecte).
// Mentre estigui buida, l'app funciona en mode de prova amb dades d'exemple.
export const firebaseConfig = {
  apiKey: 'AIzaSyDHsOQQuLd_KcwogWDXV-YmYz3iQhSyb94',
  authDomain: 'quiniela-reales.firebaseapp.com',
  projectId: 'quiniela-reales',
  appId: '1:52209825645:web:4724652c6ebc98ee90cc64',
  messagingSenderId: '52209825645',
};
// Avisos al mòbil: Consola > Configuració del projecte > Cloud Messaging > Certificats Web Push > «Genera un parell de claus».
// Enganxa aquí la clau pública. Mentre estigui buida, el botó d'avisos no surt.
export const vapidKey = '';
// Fitxer de dades. Per defecte, la captura inclosa; per tenir-les al dia, vegeu el README.
export const statsUrl = 'data/stats.json';
export const currentSeason = '2026-27';
// Primera jornada que proposarà el llistat quan encara no n'hi hagi cap.
export const firstNumber = 19;
