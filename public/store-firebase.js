// Connexió real: Firebase (pla gratuït Spark). Les regles de firestore.rules fan la validació al servidor.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, onSnapshot, writeBatch,
  serverTimestamp, Timestamp, arrayUnion,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { PLAYERS, ADMINS_INICIALS } from './logic.js';

const DOMAIN = 'quiniela-reales.invalid';
const pinToPassword = (pin) => `QR-${pin}-reales`;
const toMs = (v) => (v instanceof Timestamp ? v.toMillis() : v);
const fromDoc = (snap) => {
  const d = snap.data();
  return { ...d, id: snap.id, deadline: toMs(d.deadline), updatedAt: toMs(d.updatedAt) };
};
const MESSAGING = 'https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging.js';
const PUSH_KEY = 'quiniela-reales-avisos';
const savedPush = () => { try { return JSON.parse(localStorage.getItem(PUSH_KEY)) || null; } catch { return null; } };
const keepPush = (v) => { try { if (v) localStorage.setItem(PUSH_KEY, JSON.stringify(v)); else localStorage.removeItem(PUSH_KEY); } catch { /* sense memòria local */ } };
const withTimeout = (promise) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('Sense connexió'), { code: 'unavailable' })), 9000)),
]);

export function createFirebaseStore(config, { vapidKey = '' } = {}) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  let session = null;
  let claiming = false;
  let notify = () => {};
  const emit = () => { session = auth.currentUser ? { playerId: playerOf(auth.currentUser) } : null; notify(session); };

  const emailFor = async (playerId) => {
    const snap = await getDoc(doc(db, 'access', playerId));
    const n = snap.exists() ? snap.data().n || 0 : 0;
    return `${playerId}${n ? `.${n}` : ''}@${DOMAIN}`;
  };
  const playerOf = (user) => user?.email?.split('@')[0].split('.')[0] || null;

  // ---------- Avisos al mòbil (Firebase Cloud Messaging) ----------
  // Cada dispositiu desa el seu identificador a pushTokens; scripts/notify.mjs hi envia els avisos.
  async function pushToken() {
    const reg = await navigator.serviceWorker.register('sw.js', { scope: './' });
    const m = await import(MESSAGING);
    if (!(await m.isSupported())) throw Object.assign(new Error('Sense avisos'), { code: 'unsupported' });
    return m.getToken(m.getMessaging(app), { vapidKey, serviceWorkerRegistration: reg });
  }
  async function savePush(token) {
    const player = session?.playerId; const old = savedPush();
    await withTimeout(setDoc(doc(db, 'pushTokens', token), { player, uid: auth.currentUser.uid, updatedAt: serverTimestamp() }));
    if (old?.token && old.token !== token) deleteDoc(doc(db, 'pushTokens', old.token)).catch(() => {});
    keepPush({ player, token });
  }
  const push = vapidKey ? {
    /** 'on', 'off', 'denied', 'install' (iPhone fora de la pantalla d'inici) o 'unsupported'. */
    status() {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
      // A l'iPhone només hi ha avisos si l'app s'ha afegit a la pantalla d'inici.
      if (ios && !standalone) return 'install';
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
      if (Notification.permission === 'denied') return 'denied';
      if (Notification.permission === 'granted' && savedPush()?.player === session?.playerId) return 'on';
      return 'off';
    },
    async enable() {
      // El permís s'ha de demanar el primer, just després del toc.
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return this.status();
      await savePush(await pushToken());
      return 'on';
    },
    /** En obrir l'app: si ja estan activats, es renova l'identificador (Firebase el canvia de tant en tant). */
    async refresh() {
      if (this.status() !== 'on') return;
      try { await savePush(await pushToken()); } catch { /* es tornarà a provar la propera vegada */ }
    },
  } : null;
  async function forgetPush() {
    const saved = savedPush();
    if (!saved?.token || saved.player !== session?.playerId) return;
    keepPush(null);
    await deleteDoc(doc(db, 'pushTokens', saved.token)).catch(() => {});
  }

  return {
    mode: 'firebase',
    session: () => session,
    onSession(cb) {
      notify = cb;
      // Durant el primer accés s'espera que el perfil existeixi: si no, les lectures es rebutjarien.
      return onAuthStateChanged(auth, () => { if (!claiming) emit(); });
    },
    async login(playerId, pin) {
      await signInWithEmailAndPassword(auth, await emailFor(playerId), pinToPassword(pin));
    },
    /** Primer accés: amb el codi d'invitació es crea el compte i es reclama el perfil. */
    async claim(playerId, code, pin) {
      const email = await emailFor(playerId);
      claiming = true;
      let cred;
      try {
        cred = await createUserWithEmailAndPassword(auth, email, pinToPassword(pin));
      } catch (error) { claiming = false; throw error; }
      const batch = writeBatch(db);
      batch.set(doc(db, 'claims', cred.user.uid), { player: playerId, code: code.trim().toUpperCase() });
      batch.set(doc(db, 'players', playerId), { uid: cred.user.uid, role: ADMINS_INICIALS.includes(playerId) ? 'admin' : 'member' });
      try {
        await batch.commit();
        claiming = false;
        emit();
      } catch (error) {
        await cred.user.delete().catch(() => {});
        claiming = false;
        throw Object.assign(new Error('Codi d’invitació incorrecte'), { code: 'bad-invite' });
      }
    },
    push,
    // En tancar la sessió, aquest mòbil deixa de rebre els avisos d'aquesta persona.
    async logout() { await withTimeout(forgetPush()).catch(() => {}); await signOut(auth); },
    watchApp(cb) {
      let settings = {}; let access = {};
      const push = () => cb({ activeId: settings.activeId || null, access });
      const a = onSnapshot(doc(db, 'settings', 'app'), (s) => { settings = s.data() || {}; push(); }, () => push());
      const b = onSnapshot(collection(db, 'players'), (s) => {
        access = Object.fromEntries(PLAYERS.map((p) => {
          const row = s.docs.find((d) => d.id === p.id);
          return [p.id, { role: row?.data().role || 'member', claimed: Boolean(row) }];
        }));
        push();
      }, (error) => {
        // Si un administrador ha reiniciat el PIN, la sessió antiga ja no val.
        if (error.code === 'permission-denied') signOut(auth);
        push();
      });
      return () => { a(); b(); };
    },
    watchJornades(cb) {
      return onSnapshot(collection(db, 'jornades'), (s) => cb(s.docs.map(fromDoc)), () => cb([]));
    },
    watchPicks(id, cb) {
      return onSnapshot(collection(db, 'jornades', id, 'picks'), (s) => cb(Object.fromEntries(s.docs.map((d) => { const v = d.data(); return [d.id, { ...v, okAt: toMs(v.okAt) }]; }))), () => cb({}));
    },
    watchPayments(id, cb) {
      // Només els administradors tenen permís: per als altres arriba buit.
      return onSnapshot(collection(db, 'jornades', id, 'payments'), (s) => cb(Object.fromEntries(s.docs.map((d) => [d.id, Boolean(d.data().paid)]))), () => cb({}));
    },
    confirm(id, player) {
      return withTimeout(setDoc(doc(db, 'jornades', id, 'picks', player), { ok: true, okAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true }));
    },
    unlock(id, player) {
      return withTimeout(updateDoc(doc(db, 'jornades', id, 'picks', player), { ok: false, updatedAt: serverTimestamp() }));
    },
    setPaid(id, player, paid) {
      return withTimeout(setDoc(doc(db, 'jornades', id, 'payments', player), { paid }));
    },
    saveSign(id, player, n, sign, rev) {
      return withTimeout(setDoc(doc(db, 'jornades', id, 'picks', player),
        { [`s${n}`]: sign, [`r${n}`]: rev, updatedAt: serverTimestamp() }, { merge: true }));
    },
    savePle(id, player, side, value, rev) {
      return withTimeout(setDoc(doc(db, 'jornades', id, 'picks', player),
        { [side === 'h' ? 'pleH' : 'pleA']: value, rP: rev, updatedAt: serverTimestamp() }, { merge: true }));
    },
    saveJornada(j) {
      const { id, ...rest } = j;
      return withTimeout(setDoc(doc(db, 'jornades', id), {
        ...rest, deadline: Timestamp.fromMillis(j.deadline), updatedAt: serverTimestamp(),
      }, { merge: true }));
    },
    setActive: (id) => withTimeout(setDoc(doc(db, 'settings', 'app'), { activeId: id }, { merge: true })),
    setState(id, state, extra = {}) {
      const patch = { state, updatedAt: serverTimestamp() };
      if (extra.deadline) patch.deadline = Timestamp.fromMillis(extra.deadline);
      if (extra.reason) patch.reopenLog = arrayUnion({ reason: extra.reason, at: Date.now(), by: session.playerId });
      return withTimeout(updateDoc(doc(db, 'jornades', id), patch));
    },
    saveResults: (id, results, pleResult, resultNote, showHits) => withTimeout(updateDoc(doc(db, 'jornades', id), {
      results, pleResult, resultNote, showHits, updatedAt: serverTimestamp(),
    })),
    /** Després de reiniciar, l'amic torna a entrar amb el seu codi i tria un PIN nou. */
    async resetPin(player) {
      const snap = await getDoc(doc(db, 'access', player));
      const n = (snap.exists() ? snap.data().n || 0 : 0) + 1;
      const batch = writeBatch(db);
      batch.set(doc(db, 'access', player), { n });
      batch.delete(doc(db, 'players', player));
      await withTimeout(batch.commit());
    },
  };
}
