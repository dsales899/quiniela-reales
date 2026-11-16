// Envia els avisos al mòbil. El fa córrer GitHub Actions cada 10 minuts (.github/workflows/avisos.yml).
// Necessita el secret FIREBASE_SERVICE_ACCOUNT: el JSON de la clau del compte de servei de Firebase.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { decide, recipients, TEXTS } from './notify-logic.mjs';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  console.log('Falta el secret FIREBASE_SERVICE_ACCOUNT: no s’envia cap avís.');
  process.exit(0);
}
initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();
const messaging = getMessaging();
const DRY = process.argv.includes('--dry');
const toMs = (v) => (v instanceof Timestamp ? v.toMillis() : v);

const settings = (await db.doc('settings/app').get()).data() || {};
if (!settings.activeId) { console.log('Cap jornada activa.'); process.exit(0); }
const snap = await db.doc(`jornades/${settings.activeId}`).get();
if (!snap.exists) { console.log('La jornada activa no existeix.'); process.exit(0); }
const j = { id: snap.id, ...snap.data() };
j.deadline = toMs(j.deadline);

const stateRef = db.doc(`notifs/${j.id}`);
const sent = (await stateRef.get()).data() || {};
const { send, mark } = decide(j, sent, Date.now());
if (!send.length && !Object.keys(mark).length) { console.log(`J${j.quinielaNum ?? j.id}: res a enviar.`); process.exit(0); }

if (send.length) {
  // Només els dispositius del compte actual de cada amic (si s'ha reiniciat el PIN, els antics no compten).
  const players = Object.fromEntries((await db.collection('players').get()).docs.map((d) => [d.id, d.data().uid]));
  const tokens = (await db.collection('pushTokens').get()).docs
    .map((d) => ({ token: d.id, ref: d.ref, ...d.data() }))
    .filter((t) => players[t.player] && players[t.player] === t.uid);
  const picks = send.includes('reminder')
    ? Object.fromEntries((await db.collection(`jornades/${j.id}/picks`).get()).docs.map((d) => [d.id, d.data()]))
    : {};

  for (const kind of send) {
    const who = new Set(recipients(kind, Object.keys(players), picks));
    const list = tokens.filter((t) => who.has(t.player));
    const body = TEXTS[kind](j);
    console.log(`${kind}: «${body}» → ${[...who].join(', ') || 'ningú'} (${list.length} dispositius)`);
    if (!list.length || DRY) continue;
    const res = await messaging.sendEachForMulticast({
      tokens: list.map((t) => t.token),
      data: { title: 'Quiniela Reales', body, tag: `${kind}-${j.id}`, url: './' },
      webpush: { headers: { Urgency: 'high', TTL: String(2 * 3600) } },
    });
    console.log(`  enviats: ${res.successCount}, errors: ${res.failureCount}`);
    // Els dispositius que ja no existeixen (app desinstal·lada, avisos desactivats) es netegen.
    await Promise.all(res.responses.map((r, i) => {
      const code = r.error?.code || '';
      if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) return list[i].ref.delete();
      if (r.error) console.log(`  ${list[i].player}: ${code}`);
      return null;
    }));
  }
}
if (!DRY) await stateRef.set({ ...mark, updatedAt: Timestamp.now() }, { merge: true });
