// Proves de seguretat amb l'emulador de Firebase: npm run test:rules (necessita Java).
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, getDoc, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';

const CODES = { enric: 'ENRIC001', denis: 'DENIS001', pere: 'PERE0001', dani: 'DANI0001', pova: 'POVA0001', hector: 'HECT0001', albert: 'ALBE0001', boyer: 'BOYE0001' };
const sha = (t) => createHash('sha256').update(t).digest('hex');
const rules = readFileSync('firestore.rules.template', 'utf8').replace('__INVITES__', `{${Object.entries(CODES).map(([k, v]) => `'${k}': '${sha(v)}'`).join(', ')}}`);
let env;
const future = () => Timestamp.fromMillis(Date.now() + 3600000);
const past = () => Timestamp.fromMillis(Date.now() - 3600000);

before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-quiniela', firestore: { rules } }); });
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    for (const [p, role] of [['denis', 'admin'], ['pere', 'member']]) {
      await setDoc(doc(db, 'claims', `uid-${p}`), { player: p, code: CODES[p] });
      await setDoc(doc(db, 'players', p), { uid: `uid-${p}`, role });
    }
    await setDoc(doc(db, 'jornades', 'oberta'), { state: 'open', deadline: future(), reopenLog: [] });
    await setDoc(doc(db, 'jornades', 'vencuda'), { state: 'open', deadline: past(), reopenLog: [] });
    await setDoc(doc(db, 'jornades', 'tancada'), { state: 'closed', deadline: future(), reopenLog: [] });
  });
});
const as = (p) => env.authenticatedContext(`uid-${p}`).firestore();
const pick = (db, j, p, data) => setDoc(doc(db, 'jornades', j, 'picks', p), { ...data, updatedAt: serverTimestamp() }, { merge: true });

test('cadascú desa la seua columna i veu les altres', async () => {
  await assertSucceeds(pick(as('pere'), 'oberta', 'pere', { s1: 'X', r1: 0 }));
  await assertSucceeds(pick(as('denis'), 'oberta', 'denis', { s1: '1', r1: 0, pleH: 'M' }));
  await assertSucceeds(getDoc(doc(as('denis'), 'jornades', 'oberta', 'picks', 'pere')));
});
test('ningú edita la columna d’un altre, ni un administrador', async () => {
  await assertFails(pick(as('pere'), 'oberta', 'denis', { s1: 'X', r1: 0 }));
  await assertFails(pick(as('denis'), 'oberta', 'pere', { s1: 'X', r1: 0 }));
});
test('el servidor rebutja canvis després del termini o amb la jornada tancada', async () => {
  await assertFails(pick(as('pere'), 'vencuda', 'pere', { s1: 'X', r1: 0 }));
  await assertFails(pick(as('pere'), 'tancada', 'pere', { s1: 'X', r1: 0 }));
});
test('rebutja signes no vàlids', async () => {
  await assertFails(pick(as('pere'), 'oberta', 'pere', { s1: '3', r1: 0 }));
  await assertFails(pick(as('pere'), 'oberta', 'pere', { pleH: '5' }));
  await assertFails(pick(as('pere'), 'oberta', 'pere', { altra: 1 }));
});
test('sense compte no es llegeix res', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, 'jornades', 'oberta')));
  await assertSucceeds(getDoc(doc(db, 'access', 'pere')));
});
test('només els administradors gestionen jornades', async () => {
  await assertFails(updateDoc(doc(as('pere'), 'jornades', 'oberta'), { state: 'closed' }));
  await assertSucceeds(updateDoc(doc(as('denis'), 'jornades', 'oberta'), { state: 'closed' }));
  await assertFails(setDoc(doc(as('pere'), 'settings', 'app'), { activeId: 'x' }));
  await assertSucceeds(setDoc(doc(as('denis'), 'settings', 'app'), { activeId: 'oberta' }));
});
test('reobrir exigeix deixar constància del motiu', async () => {
  const db = as('denis');
  await assertFails(updateDoc(doc(db, 'jornades', 'tancada'), { state: 'open' }));
  await assertSucceeds(updateDoc(doc(db, 'jornades', 'tancada'), { state: 'open', reopenLog: [{ reason: 'ajornat', at: 1, by: 'denis' }] }));
});
const claim = (uid, player, code, role = 'member') => {
  const db = env.authenticatedContext(uid).firestore();
  const b = writeBatch(db);
  b.set(doc(db, 'claims', uid), { player, code });
  b.set(doc(db, 'players', player), { uid, role });
  return b.commit();
};
test('invitacions: codi correcte sí, incorrecte o repetit no', async () => {
  await assertFails(claim('nou', 'dani', 'INCORRECTE'));
  await assertFails(claim('nou', 'dani', CODES.pova));
  await assertFails(claim('nou', 'dani', CODES.dani, 'admin'));
  await assertSucceeds(claim('nou', 'dani', CODES.dani));
  await assertFails(claim('altre', 'dani', CODES.dani));
  await assertFails(claim('altre', 'pere', CODES.pere));
});
test('després de reiniciar el PIN, la sessió antiga perd l’accés', async () => {
  await assertSucceeds(env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), 'players', 'pere'), { uid: 'uid-nou', role: 'member' })));
  await assertFails(pick(as('pere'), 'oberta', 'pere', { s1: 'X', r1: 0 }));
  assert.ok(true);
});

const full = { s1: '1', s2: '1', s3: '1', s4: '1', s5: '1', s6: '1', s7: '1', s8: '1', s9: '1', s10: '1', s11: '1', s12: '1', s13: '1', s14: '1', pleH: '1', pleA: '2' };
test('OK: només amb la columna completa i després queda bloquejada', async () => {
  const db = as('pere');
  await assertFails(pick(db, 'oberta', 'pere', { s1: '1', ok: true, okAt: serverTimestamp() }));
  await assertSucceeds(pick(db, 'oberta', 'pere', full));
  await assertSucceeds(pick(db, 'oberta', 'pere', { ok: true, okAt: serverTimestamp() }));
  await assertFails(pick(db, 'oberta', 'pere', { s1: 'X' }));
  await assertFails(pick(db, 'oberta', 'pere', { ok: false }));
});
test('OK: un administrador la pot desbloquejar, però no canviar signes', async () => {
  await assertSucceeds(pick(as('pere'), 'oberta', 'pere', { ...full, ok: true, okAt: serverTimestamp() }));
  const ref = doc(as('denis'), 'jornades', 'oberta', 'picks', 'pere');
  await assertFails(updateDoc(ref, { s1: 'X', updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(as('pere'), 'jornades', 'oberta', 'picks', 'pere'), { ok: false, updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(ref, { ok: false, updatedAt: serverTimestamp() }));
  await assertSucceeds(pick(as('pere'), 'oberta', 'pere', { s1: 'X' }));
});
test('pagaments: només administradors', async () => {
  await assertFails(setDoc(doc(as('pere'), 'jornades', 'oberta', 'payments', 'pere'), { paid: true }));
  await assertFails(getDoc(doc(as('pere'), 'jornades', 'oberta', 'payments', 'pere')));
  await assertSucceeds(setDoc(doc(as('denis'), 'jornades', 'oberta', 'payments', 'pere'), { paid: true }));
});
test('ningú es pot fer administrador', async () => {
  await assertFails(updateDoc(doc(as('denis'), 'players', 'pere'), { role: 'admin' }));
});

test('doble: un sí, dos no, triple no', async () => {
  const db = as('pere');
  await assertSucceeds(pick(db, 'oberta', 'pere', { s1: '1X' }));
  await assertFails(pick(db, 'oberta', 'pere', { s2: 'X2' }));
  await assertFails(pick(db, 'oberta', 'pere', { s3: '1X2' }));
  await assertSucceeds(pick(db, 'oberta', 'pere', { s1: '1', s2: 'X2' }));
});
