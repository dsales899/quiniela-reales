import { firebaseConfig, statsUrl, currentSeason, firstNumber } from './firebase-config.js';
import { startApp } from './app.js';

const opts = { statsUrl, season: currentSeason, firstNumber };
if (firebaseConfig.projectId) {
  const { createFirebaseStore } = await import('./store-firebase.js');
  startApp(createFirebaseStore(firebaseConfig), opts);
} else {
  const { createDemoStore } = await import('./store-demo.js');
  startApp(createDemoStore(), opts);
}
