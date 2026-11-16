import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, recipients, TEXTS, HOUR } from '../scripts/notify-logic.mjs';

const now = Date.UTC(2026, 10, 16, 10);
const j = (over = {}) => ({ id: 'j20', state: 'open', quinielaNum: 20, deadline: now + 2 * 24 * HOUR, matches: [{ n: 1 }], ...over });

test('textos amb el número de jornada', () => {
  assert.equal(TEXTS.open(j()), 'Ei petardet🧨, la jornada 20 ja és activa, ompli-la ara!');
  assert.equal(TEXTS.reminder(j()), 'Ei petardet🧨, queden 2h per omplir la jornada 20 , aspavil!');
});
test('jornada nova: avisa un sol cop', () => {
  assert.deepEqual(decide(j(), {}, now), { send: ['open'], mark: { open: true } });
  assert.deepEqual(decide(j(), { open: true }, now).send, []);
});
test('recordatori a 2 h del termini, un sol cop', () => {
  const r = decide(j({ deadline: now + 2 * HOUR - 60000 }), { open: true }, now);
  assert.deepEqual(r.send, ['reminder']);
  assert.equal(decide(j({ deadline: now + 2 * HOUR - 60000 }), { open: true, reminderFor: r.mark.reminderFor }, now).send.length, 0);
  assert.equal(decide(j({ deadline: now + 3 * HOUR }), { open: true }, now).send.length, 0);
});
test('si canvia el termini, el recordatori torna a sortir', () => {
  const d = now + HOUR;
  assert.deepEqual(decide(j({ deadline: d }), { open: true, reminderFor: d - HOUR }, now).send, ['reminder']);
});
test('publicada amb menys de 2 h de marge: només el recordatori', () => {
  assert.deepEqual(decide(j({ deadline: now + HOUR }), {}, now), { send: ['reminder'], mark: { open: true, reminderFor: now + HOUR } });
});
test('res per a jornades tancades, esborranys, buides o vençudes', () => {
  for (const x of [j({ state: 'closed' }), j({ state: 'draft' }), j({ matches: [] }), j({ deadline: now - 1 })]) {
    assert.deepEqual(decide(x, {}, now), { send: [], mark: {} });
  }
});
test('el recordatori no va a qui ja ha donat l’OK', () => {
  const players = ['denis', 'enric', 'pere'];
  const picks = { denis: { ok: true }, enric: { s1: '1' } };
  assert.deepEqual(recipients('reminder', players, picks), ['enric', 'pere']);
  assert.deepEqual(recipients('open', players, picks), players);
});
