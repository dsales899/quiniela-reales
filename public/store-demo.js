// Magatzem de prova: dades d'exemple al navegador, amb les mateixes comprovacions que firestore.rules.
import { PLAYERS, ADMINS_INICIALS, canEdit } from './logic.js';

const KEY = 'quiniela-reales-prova-v1';
const DAY = 86400000;

function fixture(list) {
  return list.map(([home, away, comp = ''], i) => ({ n: i + 1, home, away, comp, rev: 0 }));
}
function column(signs, pleH = '', pleA = '') {
  const p = { pleH, pleA, rP: 0 };
  [...signs].forEach((s, i) => { if (s !== '.') { p[`s${i + 1}`] = s; p[`r${i + 1}`] = 0; } });
  return p;
}
function sample(now) {
  const lliga = fixture([
    ['Barcelona', 'Betis'], ['Girona', 'Sevilla'], ['Getafe', 'Osasuna'], ['Valencia', 'Levante'],
    ['Villarreal', 'Espanyol'], ['Athletic', 'Celta'], ['Elche', 'Racing'], ['Málaga', 'Rayo Vallecano'],
    ['Deportivo', 'Real Sociedad'], ['Almería', 'Cádiz'], ['Eibar', 'Burgos'], ['Mallorca', 'Granada'],
    ['Sporting', 'Real Oviedo'], ['Las Palmas', 'Tenerife'], ['Real Madrid', 'Atlético de Madrid'],
  ]);
  const europa = fixture([
    ['Barcelona', 'Aston Villa'], ['Bodø/Glimt', 'Lille'], ['Manchester United', 'Roma'], ['Villarreal', 'PSG'], ['AEK Atenes', 'Real Madrid'],
    ['Fenerbahçe', 'Liverpool'], ['Borussia Dortmund', 'Betis'], ['Porto', 'Nàpols'], ['Lens', 'Como'], ['Leipzig', 'Manchester City'],
    ['Slavia Praga', 'Arsenal'], ['Real Sociedad', 'Lyon'], ['Celta', 'Union Saint-Gilloise'], ['Getafe', 'Brighton'], ['Atlético de Madrid', 'Bayern de Munic'],
  ]);
  const copa = fixture([
    ['CD Alcoyano', 'Mallorca'], ['CD Badajoz', 'Tenerife'], ['CD Minera', 'FC Cartagena'], ['Eldense', 'Levante'],
    ['Castellón', 'Osasuna'], ['Sabadell', 'Girona'], ['Ceuta', 'Elche'], ['Albacete', 'Alavés'], ['Córdoba', 'Rayo Vallecano'],
    ['Burgos', 'Getafe'], ['Leganés', 'Celta'], ['Eibar', 'Athletic'], ['Valladolid', 'Sevilla'], ['Andorra', 'Valencia'],
    ['Sporting', 'Betis'],
  ]);
  const jornades = [
    { id: 'j17', season: '2026-27', category: 'copa', quinielaNum: 17, name: '', deadline: now - 7 * DAY, state: 'final', provisional: false,
      matches: copa, showHits: true,
      results: { 1: '2', 2: '2', 3: '1', 4: '2', 5: '2', 6: '2', 7: '2', 8: '2', 9: '2', 10: '2', 11: '2', 12: 'X', 13: '2', 14: '2' }, pleResult: { h: '2', a: 'M' },
      source: 'Dades d’exemple', updatedAt: now - 6 * DAY, reopenLog: [] },
    { id: 'j18', season: '2026-27', category: 'lliga', quinielaNum: 18, name: '', deadline: now - 3 * DAY, state: 'final', provisional: false,
      matches: lliga, showHits: false, results: {}, pleResult: {}, source: 'Dades d’exemple', updatedAt: now - 3 * DAY, reopenLog: [] },
    { id: 'j19', season: '2026-27', category: 'europea', quinielaNum: 19, name: '', deadline: now + 0.8 * DAY, state: 'open', provisional: false,
      matches: europa, showHits: false, results: {}, pleResult: {}, source: 'Dades d’exemple', updatedAt: now - DAY, reopenLog: [] },
  ];
  const current = {
    enric: column('1X111X1X1211X2', '2', '1'), denis: column('1X12...X1211..', '', ''), pere: column('1X111X1X1211X2', '1', '1'),
    dani: column('1X1X1X112211XX', '2', '2'), pova: column('1211122X1X1212', '1', '1'), hector: column('11212XX21211X2', 'M', '1'),
    albert: column('1X11.X1', '', ''), boyer: {},
  };
  const picks = {
    j17: {
      enric: column('2212222221X222', '2', '1'), denis: column('22122222222222', '2', 'M'), pere: column('1212X2222XX122', '1', '1'),
      dani: column('2112122X2112X2', '1', '2'), pova: column('2212X22212X2X2', '2', '2'), hector: column('121X1222X22222', 'M', '1'),
      albert: column('2212122222XX22', '2', '1'), boyer: column('2112222X2X2222', '0', '1'),
    },
    j18: { enric: column('11X21X1X2111X2', '1', '1'), denis: column('1X121X1X1211X2', '2', '1'), pere: column('1X1X1X1X1211X1', '1', '1'), dani: column('121X111X2211X2', '2', '2'),
      pova: column('1X11122X1X1212', '1', '1'), hector: column('11212XX21211X2', 'M', '1'), albert: column('1X111X1X1212X2', '2', '0'), boyer: column('1X2X1X1X1211X2', '1', '2') },
    j19: current,
  };
  const access = Object.fromEntries(PLAYERS.map((p) => [p.id, { role: ADMINS_INICIALS.includes(p.id) ? 'admin' : 'member', claimed: true }]));
  for (const id of ['enric', 'pere']) Object.assign(current[id], { ok: true, okAt: now - 5 * 3600000 });
  for (const p of Object.values(picks.j18)) Object.assign(p, { ok: true, okAt: now - 4 * DAY });
  const payments = { j18: Object.fromEntries(Object.keys(picks.j18).map((k) => [k, true])), j19: { enric: true } };
  return { activeId: 'j19', jornades, picks, access, payments };
}

const denied = (message) => Object.assign(new Error(message), { code: 'permission-denied' });

export function createDemoStore({ startAs = 'denis', persist = true } = {}) {
  const read = () => { if (!persist) return null; try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
  let db = read() || sample(Date.now());
  let me = startAs;
  const subs = { app: new Set(), jornades: new Set(), picks: new Map(), pay: new Map(), session: new Set() };
  let channel = null;
  try { channel = new BroadcastChannel(KEY); } catch { channel = null; }

  const publishApp = () => subs.app.forEach((cb) => cb({ activeId: db.activeId, access: db.access }));
  const publishJ = () => subs.jornades.forEach((cb) => cb(db.jornades.map((j) => ({ ...j }))));
  const publishP = (id) => (subs.picks.get(id) || new Set()).forEach((cb) => cb({ ...(db.picks[id] || {}) }));
  const payView = (id) => (isAdmin() ? { ...((db.payments || {})[id] || {}) } : {});
  const publishPay = () => subs.pay.forEach((set, id) => set.forEach((cb) => cb(payView(id))));
  const publishAll = () => { publishApp(); publishJ(); subs.picks.forEach((_, id) => publishP(id)); publishPay(); };
  const commit = () => {
    if (persist) { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* el navegador no desa res */ } }
    try { channel?.postMessage('canvi'); } catch { /* sense altres pestanyes */ }
    publishAll();
  };
  if (channel) channel.onmessage = () => { const fresh = read(); if (fresh) { db = fresh; publishAll(); } };

  const J = (id) => db.jornades.find((j) => j.id === id);
  const isAdmin = () => db.access[me]?.role === 'admin';
  const requireAdmin = () => { if (!isAdmin()) throw denied('Només els administradors poden fer-ho.'); };
  const checkPick = (id, player) => {
    if (player !== me) throw denied('Només pots editar la teua columna.');
    if (!canEdit(J(id))) throw denied('Aquesta jornada ja està tancada.');
    db.picks[id] = db.picks[id] || {};
    db.picks[id][player] = db.picks[id][player] || {};
    if (db.picks[id][player].ok) throw denied('Ja has donat l’OK a aquesta columna.');
    return db.picks[id][player];
  };
  const wait = () => new Promise((r) => setTimeout(r, 120));

  return {
    mode: 'demo',
    session: () => (me ? { playerId: me } : null),
    onSession(cb) { subs.session.add(cb); cb(this.session()); return () => subs.session.delete(cb); },
    async login(playerId) { me = playerId; subs.session.forEach((cb) => cb({ playerId })); publishAll(); },
    async claim(playerId) { return this.login(playerId); },
    async logout() { me = null; subs.session.forEach((cb) => cb(null)); },
    watchApp(cb) { subs.app.add(cb); cb({ activeId: db.activeId, access: db.access }); return () => subs.app.delete(cb); },
    watchJornades(cb) { subs.jornades.add(cb); cb(db.jornades.map((j) => ({ ...j }))); return () => subs.jornades.delete(cb); },
    watchPicks(id, cb) {
      if (!subs.picks.has(id)) subs.picks.set(id, new Set());
      subs.picks.get(id).add(cb); cb({ ...(db.picks[id] || {}) });
      return () => subs.picks.get(id).delete(cb);
    },
    async saveSign(id, player, n, sign, rev) {
      await wait(); const p = checkPick(id, player);
      p[`s${n}`] = sign; p[`r${n}`] = rev; commit();
    },
    async savePle(id, player, side, value, rev) {
      await wait(); const p = checkPick(id, player);
      p[side === 'h' ? 'pleH' : 'pleA'] = value; p.rP = rev; commit();
    },
    watchPayments(id, cb) {
      if (!subs.pay.has(id)) subs.pay.set(id, new Set());
      subs.pay.get(id).add(cb); cb(payView(id));
      return () => subs.pay.get(id).delete(cb);
    },
    async confirm(id, player) {
      await wait(); const p = checkPick(id, player);
      p.ok = true; p.okAt = Date.now(); commit();
    },
    async unlock(id, player) {
      requireAdmin(); const p = db.picks[id]?.[player]; if (p) { p.ok = false; commit(); }
    },
    async setPaid(id, player, paid) {
      requireAdmin(); db.payments = db.payments || {}; db.payments[id] = { ...(db.payments[id] || {}), [player]: paid }; commit();
    },
    async saveJornada(j) {
      requireAdmin();
      const i = db.jornades.findIndex((x) => x.id === j.id);
      const row = { results: {}, pleResult: {}, reopenLog: [], ...j, updatedAt: Date.now() };
      if (i >= 0) db.jornades[i] = { ...db.jornades[i], ...row }; else db.jornades.push(row);
      commit();
    },
    async setActive(id) { requireAdmin(); db.activeId = id; commit(); },
    async setState(id, state, extra = {}) {
      requireAdmin(); const j = J(id); j.state = state;
      if (extra.deadline) j.deadline = extra.deadline;
      if (extra.reason) j.reopenLog = [...(j.reopenLog || []), { reason: extra.reason, at: Date.now(), by: me }];
      commit();
    },
    async saveResults(id, results, pleResult, note, showHits) {
      requireAdmin(); Object.assign(J(id), { results, pleResult, resultNote: note, showHits }); commit();
    },
    async resetPin(player) { requireAdmin(); db.access[player].claimed = false; commit(); },
    resetDemo() { db = sample(Date.now()); commit(); },
  };
}
