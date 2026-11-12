import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../public/logic.js';

const matches = Array.from({ length: 15 }, (_, i) => ({ n: i + 1, home: 'Barcelona', away: 'Betis', rev: 0 }));
const col = (signs, ple = ['1', '1']) => {
  const p = { pleH: ple[0], pleA: ple[1] };
  [...signs].forEach((s, i) => { if (s !== '.') { p[`s${i + 1}`] = s; p[`r${i + 1}`] = 0; } });
  return p;
};

test('caselles buides no compten com a coincidència', () => {
  const c = L.compareColumns(col('11111111......', ['', '']), col('1111111X......', ['', '']), matches);
  assert.equal(c.comparable, 8);
  assert.equal(c.equal, 7);
  assert.equal(c.label, '7 de 8 signes iguals · Comparació parcial');
  assert.equal(c.flagged, false);
  const e = L.compareColumns(col('..............'), col('11111111111111'), matches);
  assert.equal(e.comparable, 0);
});

test('mateixos 14 amb Ple diferent es distingeixen de columna idèntica', () => {
  const a = col('1X21X21X21X21X', ['2', '1']);
  const b = col('1X21X21X21X21X', ['M', '1']);
  const c = L.compareColumns(a, b, matches);
  assert.equal(c.verdict, 'Mateixos 14 signes');
  assert.equal(c.identical, false);
  assert.equal(c.pleLabel, 'Ple al 15 diferent');
  const d = L.compareColumns(a, col('1X21X21X21X21X', ['2', '1']), matches);
  assert.equal(d.verdict, 'Columna idèntica amb Ple al 15');
  const noPle = L.compareColumns(a, col('1X21X21X21X21X', ['', '']), matches);
  assert.equal(noPle.pleLabel, 'Ple al 15 pendent de comparar');
});

test('parelles de 12 o més només amb les 14 posades', () => {
  const picks = { enric: col('11111111111111'), denis: col('11111111111122'), pere: col('1111111111111.') };
  const pairs = L.similarPairs(picks, matches);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].equal, 12);
});

test('recompte i etiquetes per fila', () => {
  const picks = { enric: col('1'), denis: col('1'), pere: col('1'), dani: col('1'), pova: col('1'), hector: col('1'), albert: col('X') };
  const t = L.tally(picks, matches[0]);
  assert.equal(L.tallyLabel(t), '1: 6 · X: 1 · 2: 0 · Pendents: 1');
  assert.equal(L.rowAgreement(t), null);
  assert.deepEqual(L.uncoveredSigns(t), ['2']);
  delete picks.albert;
  assert.equal(L.rowAgreement(L.tally(picks, matches[0])).label, '6 de 6 signes informats coincideixen');
  for (const p of L.PLAYERS) picks[p.id] = col('1');
  assert.equal(L.rowAgreement(L.tally(picks, matches[0])).label, 'Tots igual');
});

test('progrés de la columna', () => {
  const s = L.columnStatus(col('11111111111...', ['', '']), matches);
  assert.equal(L.progressLabel(s), '11 de 14 · Ple al 15 pendent');
  assert.equal(s.state, 'en curs');
  assert.equal(L.columnStatus(col('11111111111111', ['1', '']), matches).complete, false);
  assert.equal(L.columnStatus(col('11111111111111', ['1', 'M']), matches).complete, true);
  assert.equal(L.columnStatus(undefined, matches).state, 'pendent');
});

test('carrega missatge de WhatsApp', () => {
  const text = `🔥 Jornada 18\n1. Barça - Betis\n2) Girona-Sevilla\n3 Getafe – Osasuna\n4. R. Madrid - Ath. Club\n5. Celta - Alavés\n6. Valencia - Levante\n7. Villarreal - Espanyol\n8. Elche - Racing\n9. Málaga - Rayo\n10. Deportivo - R. Sociedad\n11. Almería - Cádiz\n12. Eibar - Burgos\n13. Mallorca - Granada\n14. Sporting - Oviedo\nP15. Real Madrid - Atlético`;
  const r = L.parseMatchList(text);
  assert.equal(r.matches.length, 15);
  assert.deepEqual(r.missing, []);
  assert.equal(r.matches[1].away, 'Sevilla');
  assert.equal(r.matches[14].n, 15);
  assert.equal(L.teamView(r.matches[3].away).id, 'athletic');
  assert.equal(L.teamView('Barça').id, 'barcelona');
  assert.equal(L.teamView('Bodo/Glimt').id, 'bodo-glimt');
  assert.equal(L.teamView('CD Alcoyano').crest, null);
});

test('carrega CSV', () => {
  const r = L.parseMatchList('n;local;visitant;competicio\n1;Arsenal;Inter;Champions\n2;PSG;Napoli;Champions');
  assert.equal(r.matches.length, 2);
  assert.equal(r.matches[0].comp, 'Champions');
  assert.equal(r.missing.length, 13);
});

test('reimportar només toca el partit canviat', () => {
  const { merged, changed } = L.mergeMatches(matches, matches.map((m) => (m.n === 3 ? { ...m, away: 'Sevilla' } : m)));
  assert.equal(changed.length, 1);
  assert.equal(merged.find((m) => m.n === 3).rev, 1);
  assert.equal(merged.find((m) => m.n === 4).rev, 0);
  const p = col('11111111111111');
  const row3 = merged.find((m) => m.n === 3);
  assert.equal(L.needsReview(p, row3), true);
  assert.equal(L.validSign(p, row3), '');
  assert.equal(L.validSign(p, merged.find((m) => m.n === 4)), '1');
  assert.deepEqual(L.affectedPicks(changed, { denis: p })[0].players, ['Denis']);
});

test('encerts recalculats i Ple separat', () => {
  const j = { matches, results: { 1: '1', 2: '2' }, pleResult: { h: '1', a: '1' } };
  const h = L.hits(col('11111111111111', ['1', '1']), j);
  assert.equal(h.count, 1); assert.equal(h.loaded, 2); assert.equal(h.ple, 'encertat');
  assert.equal(L.hits(col('1.', ['', '']), j).incomplete, true);
  j.results[2] = '1';
  assert.equal(L.hits(col('11111111111111', ['1', '1']), j).count, 2);
});

test('hora de Madrid en horari d’hivern i d’estiu', () => {
  assert.equal(new Date(L.fromLocalInput('2026-11-08T14:00')).toISOString(), '2026-11-08T13:00:00.000Z');
  assert.equal(new Date(L.fromLocalInput('2027-05-08T14:00')).toISOString(), '2027-05-08T12:00:00.000Z');
  assert.equal(L.toLocalInput(Date.UTC(2026, 10, 8, 13)), '2026-11-08T14:00');
});

test('estat efectiu després del termini', () => {
  const j = { state: 'open', deadline: 1000 };
  assert.equal(L.canEdit(j, 999), true);
  assert.equal(L.canEdit(j, 1000), false);
  assert.equal(L.effectiveState(j, 1000), 'closed');
});

test('CSV i WhatsApp mantenen l’ordre dels vuit', () => {
  const j = { quinielaNum: 18, matches, deadline: 0 };
  const csv = L.gridCsv(j, { denis: col('11111111111111', ['2', 'M']) });
  assert.match(csv.split('\n')[0], /Enric;Denis;Pere;Dani;Pova;Hector;Albert;Boyer$/);
  assert.match(csv.split('\n').at(-1), /P15.*;;2-M;/);
  assert.match(L.whatsappSummary(j, {}), /En De Pe Da Po He Al Bo/);
});

test('forma, casa i fora, i enfrontaments', () => {
  const stats = { matches: [
    { d: '2026-10-01', h: 'barcelona', a: 'betis', hg: 2, ag: 0 },
    { d: '2026-10-08', h: 'betis', a: 'barcelona', hg: 1, ag: 1 },
    { d: '2026-10-15', h: 'getafe', a: 'barcelona', hg: 1, ag: 0 },
  ], comps: { PD: { name: 'Primera', table: [{ team: 'barcelona', pos: 1, pts: 4 }] } } };
  assert.deepEqual(L.teamForm(stats, 'barcelona').map((f) => f.res), ['D', 'E', 'V']);
  assert.deepEqual(L.homeAway(stats, 'barcelona').away, { V: 0, E: 1, D: 1 });
  assert.equal(L.headToHead(stats, 'betis', 'barcelona').length, 2);
  assert.equal(L.standingFor(stats, 'barcelona').pos, 1);
  assert.equal(L.standingFor(stats, 'osasuna'), null);
});

test('noms amb guió i abreviatures de butlleta', () => {
  const r = L.parseMatchList('1. Paris Saint-Germain - Bayern\n2. R.MADRID-ATH.CLUB\n3 At. Madrid vs Dep. Coruña');
  assert.equal(r.matches[0].home, 'Paris Saint-Germain');
  assert.equal(L.teamView(r.matches[0].home).id, 'psg');
  assert.equal(L.teamView(r.matches[1].home).id, 'real-madrid');
  assert.equal(L.teamView(r.matches[1].away).id, 'athletic');
  assert.equal(L.teamView(r.matches[2].home).id, 'atletico');
  assert.equal(L.teamView(r.matches[2].away).id, 'deportivo');
});

test('equips femenins amb F', () => {
  const cases = { 'Barça F': 'barcelona-f', 'Barcelona F': 'barcelona-f', 'FC Barcelona F': 'barcelona-f', 'R. Madrid F': 'real-madrid-f', 'Real Madrid F': 'real-madrid-f',
    'Atlético F': 'atletico-f', 'At. Madrid F': 'atletico-f', 'Athletic F': 'athletic-f', 'Ath. Club F': 'athletic-f', 'Alavés F': 'alaves-f', 'Badalona F': 'badalona-f',
    'Tenerife F': 'costa-adeje', 'Costa Adeje F': 'costa-adeje', 'Deportivo F': 'deportivo-f', 'Eibar F': 'eibar-f', 'Espanyol F': 'espanyol-f', 'Granada F': 'granada-f',
    'Logroño F': 'logrono', 'Madrid CFF F': 'madrid-cff', 'Madrid CFF': 'madrid-cff', 'R. Sociedad F': 'real-sociedad-f', 'Real Sociedad F': 'real-sociedad-f',
    'Sevilla F': 'sevilla-f', 'Valencia F': 'valencia-f', 'València F': 'valencia-f', 'BARCELONA F': 'barcelona-f', 'Barça Femení': 'barcelona-f', 'Sevilla Femenino': 'sevilla-f' };
  for (const [name, id] of Object.entries(cases)) assert.equal(L.teamView(name).id, id, name);
  assert.equal(L.teamView('Sevilla').id, 'sevilla');
  assert.equal(L.teamView('Barça').id, 'barcelona');
  assert.equal(L.teamView('Levante F').crest, null);
  const r = L.parseMatchList('1. Barça F - R. Madrid F');
  assert.equal(L.teamView(r.matches[0].away).id, 'real-madrid-f');
});

test('missatge real de WhatsApp de la jornada 19', () => {
  const text = `⚽ *QUINIELA REALES – JORNADA 19*

Ompliu els vostres pronòstics amb *1 / X / 2*👇

1️⃣ Barcelona - Aston Villa →
2️⃣ Bodø/Glimt - Lille →
3️⃣ Manchester United - Roma →
4️⃣ Villarreal - PSG →
5️⃣ AEK Atenes - Real Madrid →
6️⃣ Fenerbahçe - Liverpool →
7️⃣ Borussia Dortmund - Betis →
8️⃣ Porto - Nàpols →
9️⃣ Lens - Como →
🔟 Leipzig - Manchester City →
1️⃣1️⃣ Slavia Praga - Arsenal →
1️⃣2️⃣ Real Sociedad - Lyon →
1️⃣3️⃣ Celta - Union Saint-Gilloise →
1️⃣4️⃣ Getafe - Brighton →

🏆 *PLE AL 15*
1️⃣5️⃣ Atlético de Madrid - Bayern de Munic → __ - __

📌 *Ple al 15: 0 / 1 / 2 / M*
*M = 3 gols o més.*`;
  const r = L.parseMatchList(text);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.problems, []);
  assert.equal(r.matches.length, 15);
  assert.equal(r.matches[9].home, 'Leipzig');
  assert.equal(r.matches[12].away, 'Union Saint-Gilloise');
  assert.equal(r.matches[14].away, 'Bayern de Munic');
  const unknown = r.matches.flatMap((m) => [m.home, m.away]).filter((x) => !L.teamView(x).known);
  assert.deepEqual(unknown, []);
});

test('OK i cerca d’equips', () => {
  const m = Array.from({ length: 15 }, (_, i) => ({ n: i + 1, home: 'A', away: 'B', rev: 0 }));
  const p = { pleH: '1', pleA: '1' }; for (let i = 1; i <= 14; i += 1) { p[`s${i}`] = '1'; p[`r${i}`] = 0; }
  assert.equal(L.progressLabel(L.columnStatus(p, m)), 'Completa · falta l’OK');
  assert.equal(L.columnStatus({ ...p, ok: true }, m).state, 'confirmada');
  assert.equal(L.searchTeams('lyo')[0].id, 'lyon');
  assert.equal(L.searchTeams('bri')[0].id, 'brighton');
  assert.equal(L.searchTeams('', 'EL').every((t) => t.group === 'EL'), true);
  assert.equal(L.teamView('Union Saint-Gilloise').id, 'union-sg');
  assert.equal(L.teamView('Olympique de Marsella').id, 'marseille');
  assert.equal(L.teamView('Sporting').id, 'sporting-gijon');
  assert.equal(L.teamView('Inter').id, 'inter');
});

test('doble: un per columna i recompte', () => {
  const m = Array.from({ length: 15 }, (_, i) => ({ n: i + 1, home: 'A', away: 'B', rev: 0 }));
  assert.equal(L.toggleSign('1', 'X'), '1X');
  assert.equal(L.toggleSign('X', '1'), '1X');
  assert.equal(L.toggleSign('1X', '1'), 'X');
  assert.equal(L.toggleSign('', '2'), '2');
  const p = { s3: '1X', r3: 0, s4: '2', r4: 0 };
  assert.equal(L.doubleMatch(p, m), 3);
  assert.match(L.checkSignChange(p, m, 4, 'X2'), /partit 3/);
  assert.equal(L.checkSignChange(p, m, 3, '12'), '');
  assert.match(L.checkSignChange(p, m, 3, '1X2'), /dues opcions/);
  const t = L.tally({ enric: { s1: '1X', r1: 0 }, denis: { s1: '1', r1: 0 } }, m[0]);
  assert.equal(t[1], 2); assert.equal(t.X, 1); assert.equal(t.filled, 2); assert.equal(L.rowAgreement(t), null);
  const j = { matches: m, results: { 3: 'X', 4: '1' }, pleResult: {} };
  assert.equal(L.hits(p, j).count, 1);
  const c = L.compareColumns(p, { s3: '1', r3: 0 }, m);
  assert.equal(c.equal, 0);
});
test('ratxes', () => {
  const f = (s) => [...s].map((res) => ({ res }));
  assert.equal(L.streakLabel(f('DDDVV')), '3 derrotes seguides');
  assert.equal(L.streakLabel(f('VVEVD')), '2 victòries seguides');
  assert.equal(L.streakLabel(f('EEV')), '2 empats seguits');
  assert.equal(L.streakLabel(f('VEVED')), '4 partits sense perdre');
  assert.equal(L.streakLabel(f('DEDEV')), '4 partits sense guanyar');
  assert.equal(L.streakLabel(f('VDVDV')), 'Última: victòria');
});

test('temporades d’ESPN', async () => {
  const { seasons } = await import('../scripts/sync-stats.mjs');
  assert.deepEqual(seasons(new Date('2026-11-11T05:00:00Z'), 3), [2026, 2025, 2024]);
  assert.deepEqual(seasons(new Date('2027-03-01T05:00:00Z'), 1), [2026]);
});
