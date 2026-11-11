// Lògica pura de Quiniela Reales: sense DOM ni base de dades, per poder-la provar.
import { TEAMS } from './teams.js';

export const PLAYERS = [
  { id: 'enric', name: 'Enric', short: 'En' },
  { id: 'denis', name: 'Denis', short: 'De' },
  { id: 'pere', name: 'Pere', short: 'Pe' },
  { id: 'dani', name: 'Dani', short: 'Da' },
  { id: 'pova', name: 'Pova', short: 'Po' },
  { id: 'hector', name: 'Hector', short: 'He' },
  { id: 'albert', name: 'Albert', short: 'Al' },
  { id: 'boyer', name: 'Boyer', short: 'Bo' },
];
export const ADMINS_INICIALS = ['denis', 'enric'];
export const STAT_COMPS = [['PD', 'Primera'], ['SD', 'Segona'], ['CL', 'Champions'], ['EL', 'Europa League'], ['ECL', 'Conference'], ['LF', 'Liga F']];
export const TEAM_GROUPS = [['PD', 'Primera'], ['SD', 'Segona'], ['CL', 'Champions'], ['EL', 'Europa League'], ['ECL', 'Conference'], ['LF', 'Liga F']];
export const SIGNS = ['1', 'X', '2'];
export const GOALS = ['0', '1', '2', 'M'];
export const TIMEZONE = 'Europe/Madrid';
export const CATEGORIES = {
  lliga: { label: 'Lliga', group: 'lliga' },
  europea: { label: 'Europea mixta', group: 'europa' },
  copa: { label: 'Copa i lligues estrangeres', group: 'altres' },
  especial: { label: 'Especial', group: 'altres' },
};

// ---------- Equips ----------
export function norm(text = '') {
  return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/ø/g, 'o').replace(/ç/g, 'c').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
const INDEX = new Map();
for (const t of TEAMS) {
  for (const key of [t.name, t.short, ...t.aliases]) {
    const k = norm(key);
    if (k && !INDEX.has(k)) INDEX.set(k, t);
  }
  if (!INDEX.has(t.id.replace(/-/g, ' '))) INDEX.set(t.id.replace(/-/g, ' '), t);
}
// Equips femenins: «Barça F», «R. Madrid F», «Tenerife F»... porten a l'escut de Liga F, mai al del masculí.
const FEMALE_MARK = /^(.+?) (?:f|fem|femeni|femenino|femenina|women|ladies)$/;
const FEMALE_ID = { tenerife: 'costa-adeje' };
export function findTeam(name) {
  const key = norm(name);
  const female = key.match(FEMALE_MARK);
  if (female) {
    const base = INDEX.get(female[1]);
    if (!base) return null;
    if (base.group === 'LF') return base;
    const id = FEMALE_ID[base.id] || `${base.id}-f`;
    return TEAMS.find((t) => t.id === id) || null;
  }
  return INDEX.get(key) || null;
}
/** Cerca per al selector: primer els que comencen pel text buscat. */
export function searchTeams(q, group = null) {
  const k = norm(q);
  const list = TEAMS.filter((t) => !group || k || t.group === group);
  if (!k) return list;
  const score = (t) => {
    const keys = [t.name, t.short, t.tla, ...t.aliases].map(norm);
    if (keys.some((x) => x === k)) return 0;
    if (keys.some((x) => x.startsWith(k))) return 1;
    if (keys.some((x) => x.split(' ').some((w) => w.startsWith(k)))) return 2;
    if (keys.some((x) => x.includes(k))) return 3;
    return 9;
  };
  return list.map((t) => [score(t), t]).filter(([s]) => s < 9).sort((a, b) => a[0] - b[0]).map(([, t]) => t);
}
export function teamById(id) { return TEAMS.find((t) => t.id === id) || null; }
export function teamView(name) {
  const t = findTeam(name);
  if (t) return { id: t.id, name: t.name, short: t.short, tla: t.tla, crest: `crests/${t.id}.webp`, known: true };
  const clean = String(name || '').trim() || 'Per confirmar';
  const letters = norm(clean).replace(/\b(cd|cf|fc|ud|sd|ad|rc|real|club|de)\b/g, ' ').replace(/\s/g, '').toUpperCase();
  return { id: null, name: clean, short: clean, tla: (letters || 'TBC').slice(0, 3), crest: null, known: false };
}

// ---------- Pronòstics ----------
export const pickSign = (pick, match) => {
  if (!pick) return '';
  return pick[`s${match.n}`] || '';
};
/** Un signe queda pendent de revalidar si el partit ha canviat després de posar-lo. */
export const needsReview = (pick, match) =>
  Boolean(pickSign(pick, match)) && (pick[`r${match.n}`] || 0) !== (match.rev || 0);
export const validSign = (pick, match) => (needsReview(pick, match) ? '' : pickSign(pick, match));
const pleMatch = (matches) => matches.find((m) => m.n === 15);
export const pleNeedsReview = (pick, matches) => {
  const ple = pleMatch(matches);
  return Boolean(pick && ple && (pick.pleH || pick.pleA) && (pick.rP || 0) !== (ple.rev || 0));
};
export const pleDone = (pick, matches) =>
  Boolean(pick && pick.pleH && pick.pleA) && !pleNeedsReview(pick, matches);
export const first14 = (matches) => matches.filter((m) => m.n <= 14).sort((a, b) => a.n - b.n);

export function columnStatus(pick, matches) {
  const rows = first14(matches);
  const signs = rows.filter((m) => validSign(pick, m)).length;
  const ple = pleDone(pick, matches);
  const partialPle = Boolean(pick && (pick.pleH || pick.pleA));
  const total = rows.length || 14;
  const complete = rows.length === 14 && signs === total && ple;
  const confirmed = Boolean(pick?.ok);
  const state = confirmed ? 'confirmada' : complete ? 'completa' : signs === 0 && !partialPle ? 'pendent' : 'en curs';
  return { signs, total, ple, complete, confirmed, state, review: rows.filter((m) => needsReview(pick, m)).length };
}
export function progressLabel(status) {
  if (status.confirmed) return 'OK donat';
  if (status.complete) return 'Completa · falta l’OK';
  return `${status.signs} de ${status.total} · Ple al 15 ${status.ple ? 'complet' : 'pendent'}`;
}

// ---------- Doble ----------
// Un doble es guarda com «1X», «X2» o «12», sempre en aquest ordre. Màxim un per columna.
export const DOUBLES = ['1X', 'X2', '12'];
export const isDouble = (s) => DOUBLES.includes(s);
export function toggleSign(current, sign) {
  const set = new Set(String(current || '').split('').filter(Boolean));
  if (set.has(sign)) set.delete(sign); else set.add(sign);
  return SIGNS.filter((s) => set.has(s)).join('');
}
export function doubleMatch(pick, matches) {
  const m = first14(matches).find((x) => isDouble(validSign(pick, x)));
  return m ? m.n : null;
}
/** Diu si es pot desar el nou valor: res de triples i un sol doble per columna. */
export function checkSignChange(pick, matches, n, value) {
  if (value.length > 2) return 'Només pots marcar dues opcions en un partit.';
  if (isDouble(value)) {
    const other = doubleMatch(pick, matches);
    if (other && other !== n) return `Ei, petardet, que ja tens un doble! (partit ${other})`;
  }
  return '';
}

export function tally(picks, match, players = PLAYERS) {
  const out = { 1: 0, X: 0, 2: 0, pending: 0, filled: 0, values: new Set() };
  for (const p of players) {
    const s = validSign(picks[p.id], match);
    if (!s) { out.pending += 1; continue; }
    out.filled += 1; out.values.add(s);
    for (const c of s) out[c] += 1;
  }
  return out;
}
export const tallyLabel = (t) => `1: ${t[1]} · X: ${t.X} · 2: ${t[2]} · Pendents: ${t.pending}`;

export function rowAgreement(t) {
  const informed = t.filled;
  if (informed < 2 || t.values.size !== 1) return null;
  if (t.pending === 0) return { kind: 'all', label: 'Tots igual' };
  return { kind: 'partial', label: `${informed} de ${informed} signes informats coincideixen` };
}
export const uncoveredSigns = (t) => SIGNS.filter((s) => t[s] === 0);

export function compareColumns(a, b, matches) {
  const rows = first14(matches);
  let comparable = 0; let equal = 0; const same = [];
  for (const m of rows) {
    const sa = validSign(a, m); const sb = validSign(b, m);
    if (!sa || !sb) continue;
    comparable += 1;
    if (sa === sb) { equal += 1; same.push(m.n); }
  }
  const complete = rows.length === 14 && comparable === 14;
  const bothPle = pleDone(a, matches) && pleDone(b, matches);
  const samePle = bothPle && a.pleH === b.pleH && a.pleA === b.pleA;
  const sameFourteen = complete && equal === 14;
  const identical = sameFourteen && samePle;
  let label = `${equal} de ${comparable} signes iguals`;
  if (!complete) label += ' · Comparació parcial';
  let verdict = null;
  if (identical) verdict = 'Columna idèntica amb Ple al 15';
  else if (sameFourteen) verdict = 'Mateixos 14 signes';
  let pleLabel = 'Ple al 15 pendent de comparar';
  if (bothPle) pleLabel = samePle ? 'Mateix Ple al 15' : 'Ple al 15 diferent';
  return { comparable, equal, same, complete, label, verdict, identical, sameFourteen, bothPle, samePle, pleLabel,
    flagged: complete && equal >= 12 };
}
export function similarPairs(picks, matches, players = PLAYERS) {
  const out = [];
  players.forEach((a, i) => players.slice(i + 1).forEach((b) => {
    const c = compareColumns(picks[a.id], picks[b.id], matches);
    if (c.flagged) out.push({ a, b, ...c });
  }));
  return out.sort((x, y) => (y.equal + (y.identical ? 1 : 0)) - (x.equal + (x.identical ? 1 : 0)));
}

// ---------- Resultats ----------
export function hits(pick, jornada) {
  const rows = first14(jornada.matches);
  const results = jornada.results || {};
  const loaded = rows.filter((m) => results[m.n]).length;
  const status = columnStatus(pick, jornada.matches);
  const count = rows.filter((m) => results[m.n] && validSign(pick, m).includes(results[m.n])).length;
  const r = jornada.pleResult || {};
  let ple = 'pendent';
  if (r.h && r.a) {
    if (!pleDone(pick, jornada.matches)) ple = 'sense Ple';
    else ple = pick.pleH === r.h && pick.pleA === r.a ? 'encertat' : 'fallat';
  }
  return { count, loaded, ple, incomplete: !status.complete };
}

// ---------- Terminis i dates ----------
export function effectiveState(j, now = Date.now()) {
  if (j.state === 'open' && now >= j.deadline) return 'closed';
  return j.state;
}
export const STATE_LABEL = { draft: 'Esborrany', open: 'Oberta', closed: 'Tancada', final: 'Finalitzada' };
export const canEdit = (j, now = Date.now()) => j.state === 'open' && now < j.deadline;

const fmt = (opts) => new Intl.DateTimeFormat('ca-ES', { timeZone: TIMEZONE, ...opts });
export const fmtDay = (ms) => fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(ms);
export const fmtHour = (ms) => fmt({ hour: '2-digit', minute: '2-digit', hour12: false }).format(ms);
export const fmtFull = (ms) => `${fmtDay(ms)}, ${fmtHour(ms)}`;
export function madridParts(ms) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(ms);
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}
export function toLocalInput(ms) {
  const p = madridParts(ms);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
/** Converteix l'hora escrita (hora de Madrid) a mil·lisegons, també en canvis d'horari. */
export function fromLocalInput(value) {
  const [d, t] = value.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [h, mi] = t.split(':').map(Number);
  const wanted = Date.UTC(y, mo - 1, da, h, mi);
  let guess = wanted;
  for (let i = 0; i < 3; i += 1) {
    const p = madridParts(guess);
    const seen = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    guess += wanted - seen;
  }
  return guess;
}
export function countdown(ms, now = Date.now()) {
  const left = ms - now;
  if (left <= 0) return 'Termini passat';
  const min = Math.floor(left / 60000);
  const d = Math.floor(min / 1440); const h = Math.floor((min % 1440) / 60); const m = min % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

// ---------- Càrrega de partits ----------
const CLEAN_LINE = /^[\s*_~•·\-–—>#]*(?:partit\s*)?/i;
export function parseMatchList(text) {
  const matches = []; const problems = [];
  // Els números amb emoji (1️⃣, 🔟, 1️⃣1️⃣) passen a xifres i el que hi ha després de la fletxa s'ignora.
  const rows = String(text || '').split(/\r?\n/).map((l) => l
    .replace(/(\d)️?⃣/g, '$1').replace(/\u{1F51F}/gu, '10')
    .replace(/\p{Extended_Pictographic}|️/gu, '')
    .replace(/\s*(?:→|➡|=>|->).*$/, '').trim()).filter(Boolean);
  for (const raw of rows) {
    if (/^(n|num|numero|#)\s*[;,\t]/i.test(raw)) continue;
    // Títols i instruccions del missatge: no porten número de partit al davant.
    if (!/^[\s*_~]*(?:\d{1,2}|p(?:le(?:no)?)?\s*(?:al\s*)?15\b)/i.test(raw) && /quiniela|jornada|ple al|pleno|ompliu|pron[oò]stic/i.test(raw)) continue;
    const csv = raw.split(/[;\t]/).map((c) => c.trim());
    let n; let home; let away; let comp = '';
    if (csv.length >= 3 && /^\d{1,2}$/.test(csv[0])) {
      [n, home, away, comp = ''] = csv;
      n = Number(n);
    } else {
      const line = raw.replace(CLEAN_LINE, '');
      // Primer es busca un guió amb espais, per no partir noms com «Saint-Germain».
      const head = '^(?:(p(?:le(?:no)?)?\\s*(?:al\\s*)?15|\\d{1,2})\\s*[.:)\\-–—]?\\s+)?(.+?)';
      const tail = '(.+?)\\s*(?:[(\\[].*)?$';
      const m = line.match(new RegExp(`${head}\\s+(?:[-–—]|vs\\.?|v|contra)\\s+${tail}`, 'i'))
        || line.match(new RegExp(`${head}\\s*[-–—]\\s*${tail}`, 'i'));
      if (!m) { if (/[-–—]/.test(line)) problems.push(raw); continue; }
      const num = m[1] ? (/^\d/.test(m[1]) ? Number(m[1]) : 15) : matches.length + 1;
      n = num; home = m[2].replace(/[*_~]/g, '').trim(); away = m[3].replace(/[*_~]/g, '').trim();
    }
    if (n < 1 || n > 15) { problems.push(raw); continue; }
    if (matches.some((x) => x.n === n)) { problems.push(raw); continue; }
    matches.push({ n, home, away, comp });
  }
  matches.sort((a, b) => a.n - b.n);
  const missing = [];
  for (let i = 1; i <= 15; i += 1) if (!matches.some((m) => m.n === i)) missing.push(i);
  return { matches, problems, missing };
}
const sameFixture = (a, b) => norm(a.home) === norm(b.home) && norm(a.away) === norm(b.away);
/** Compara una càrrega nova amb la jornada: només puja la revisió dels partits canviats. */
export function mergeMatches(current, incoming) {
  const changed = []; const merged = [];
  for (const m of incoming) {
    const old = current.find((c) => c.n === m.n);
    if (old && sameFixture(old, m)) { merged.push({ ...old, comp: m.comp || old.comp || '' }); continue; }
    const rev = old ? (old.rev || 0) + 1 : 0;
    merged.push({ ...m, rev });
    if (old) changed.push({ n: m.n, before: `${old.home} - ${old.away}`, after: `${m.home} - ${m.away}` });
  }
  return { merged, changed };
}
export function affectedPicks(changed, picks, players = PLAYERS) {
  return changed.map((c) => ({ ...c, players: players.filter((p) => picks[p.id]?.[`s${c.n}`] || (c.n === 15 && (picks[p.id]?.pleH || picks[p.id]?.pleA))).map((p) => p.name) }));
}

// ---------- Exportacions ----------
export function jornadaTitle(j) {
  if (j.name) return j.name;
  if (j.quinielaNum) return `Jornada ${j.quinielaNum}`;
  if (j.primeraNum) return `Jornada ${j.primeraNum} de Primera`;
  return 'Jornada';
}
const cleanPle = (p) => (p?.pleH && p?.pleA ? `${p.pleH}-${p.pleA}` : '—');
export function whatsappMatches(j) {
  const lines = [`*Quiniela Reales · ${jornadaTitle(j)}*`, `Tanca: ${fmtFull(j.deadline)}`, ''];
  for (const m of [...j.matches].sort((a, b) => a.n - b.n)) lines.push(`${m.n === 15 ? 'P15' : m.n}. ${m.home} - ${m.away}`);
  return lines.join('\n');
}
export function whatsappSummary(j, picks, players = PLAYERS) {
  const lines = [`*Quiniela Reales · ${jornadaTitle(j)}*`, `\`    ${players.map((p) => p.short).join(' ')}\``];
  for (const m of first14(j.matches)) {
    const home = teamView(m.home).tla; const away = teamView(m.away).tla;
    const row = players.map((p) => (validSign(picks[p.id], m) || '—').padEnd(2, ' ')).join(' ');
    lines.push(`\`${String(m.n).padStart(2, ' ')}  ${row}\` ${home}-${away}`);
  }
  const ple = j.matches.find((m) => m.n === 15);
  if (ple) {
    lines.push('', `*Ple al 15:* ${ple.home} - ${ple.away}`);
    lines.push(players.map((p) => `${p.name} ${cleanPle(picks[p.id])}`).join(' · '));
  }
  return lines.join('\n');
}
const csvCell = (v) => (/[";\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
export function gridCsv(j, picks, players = PLAYERS) {
  const rows = [['Jornada', 'Partit', 'Local', 'Visitant', ...players.map((p) => p.name)]];
  for (const m of first14(j.matches)) rows.push([jornadaTitle(j), m.n, m.home, m.away, ...players.map((p) => validSign(picks[p.id], m))]);
  const ple = j.matches.find((m) => m.n === 15);
  if (ple) rows.push([jornadaTitle(j), 'P15', ple.home, ple.away, ...players.map((p) => (cleanPle(picks[p.id]) === '—' ? '' : cleanPle(picks[p.id])))]);
  return rows.map((r) => r.map(csvCell).join(';')).join('\n');
}

// ---------- Dades d'equips ----------
function resultFor(row, teamId) {
  const home = row.h === teamId;
  const gf = home ? row.hg : row.ag; const ga = home ? row.ag : row.hg;
  return { date: row.d, home, opp: home ? row.a : row.h, gf, ga, res: gf > ga ? 'V' : gf < ga ? 'D' : 'E', comp: row.c };
}
const byDateDesc = (a, b) => (a.d < b.d ? 1 : -1);
export function teamForm(stats, teamId, count = 5, comp = null) {
  if (!stats?.matches || !teamId) return [];
  return stats.matches.filter((m) => (m.h === teamId || m.a === teamId) && (!comp || m.c === comp)).sort(byDateDesc).slice(0, count)
    .map((m) => resultFor(m, teamId));
}
const STREAK = { V: ['victòria', 'victòries'], E: ['empat', 'empats'], D: ['derrota', 'derrotes'] };
/** «3 derrotes seguides», «5 sense perdre»... a partir de la forma (la més recent primer). */
export function streakLabel(form) {
  if (!form.length) return '';
  const first = form[0].res; let n = 0;
  while (n < form.length && form[n].res === first) n += 1;
  if (n >= 2) return `${n} ${STREAK[first][1]} seguides`.replace('empats seguides', 'empats seguits');
  let unbeaten = 0; while (unbeaten < form.length && form[unbeaten].res !== 'D') unbeaten += 1;
  if (unbeaten >= 3) return `${unbeaten} partits sense perdre`;
  let winless = 0; while (winless < form.length && form[winless].res !== 'V') winless += 1;
  if (winless >= 3) return `${winless} partits sense guanyar`;
  return `Última: ${STREAK[first][0]}`;
}
export function homeAway(stats, teamId) {
  const out = { home: { V: 0, E: 0, D: 0 }, away: { V: 0, E: 0, D: 0 } };
  for (const m of stats?.matches || []) {
    if (m.h !== teamId && m.a !== teamId) continue;
    const r = resultFor(m, teamId);
    out[r.home ? 'home' : 'away'][r.res] += 1;
  }
  return out;
}
export function headToHead(stats, a, b, count = 5) {
  if (!stats?.matches) return [];
  return stats.matches.filter((m) => (m.h === a && m.a === b) || (m.h === b && m.a === a)).sort(byDateDesc).slice(0, count);
}
export function standingFor(stats, teamId, prefer = []) {
  if (!teamId) return null;
  const all = Object.entries(stats?.comps || {}).sort(([a], [b]) => (prefer.includes(b) ? 1 : 0) - (prefer.includes(a) ? 1 : 0));
  for (const [, comp] of all) {
    const row = comp.table?.find((r) => r.team === teamId);
    if (row) return { ...row, comp: comp.name };
  }
  return null;
}
