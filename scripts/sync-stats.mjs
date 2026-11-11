// Baixa cada dia les classificacions i els resultats de les sis competicions i escriu public/data/stats.json.
// Font: l'API pública d'ESPN, gratuïta i sense clau. No és oficial: si algun dia canvia, l'app mostra
// «Dades no disponibles» per a aquella competició i la resta continua igual.
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { findTeam } from '../public/logic.js';

const SITE = process.env.ESPN_SITE || 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const STAND = process.env.ESPN_STANDINGS || 'https://site.api.espn.com/apis/v2/sports/soccer';
// Codi d'ESPN de cada competició. Si una no surt, revisa'n el codi aquí.
export const COMPS = {
  PD: { name: 'Primera', espn: 'esp.1' },
  SD: { name: 'Segona', espn: 'esp.2' },
  CL: { name: 'Champions', espn: 'uefa.champions' },
  EL: { name: 'Europa League', espn: 'uefa.europa' },
  ECL: { name: 'Conference', espn: 'uefa.europa.conf' },
  LF: { name: 'Liga F', espn: 'esp.w.1' },
};
// Lligues d'altres països: només resultats, perquè els equips de Champions, Europa League i
// Conference també tinguin la forma dels últims 5 partits.
export const EXTRA = { ENG: 'eng.1', ITA: 'ita.1', GER: 'ger.1', FRA: 'fra.1', POR: 'por.1', NED: 'ned.1', BEL: 'bel.1', TUR: 'tur.1', SCO: 'sco.1' };
// Temporades guardades per als enfrontaments (l'actual i les quatre anteriors).
const SEASONS = Number(process.env.SYNC_SEASONS ?? 5);
const PAUSE = Number(process.env.SYNC_PAUSE ?? 400);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  await wait(PAUSE);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}
export function teamId(name, comp) {
  if (!name) return null;
  // A la Liga F mai es fa servir l'escut de l'equip masculí.
  if (comp === 'LF') { const t = findTeam(`${name} F`) || findTeam(name); return t?.group === 'LF' ? t.id : null; }
  return findTeam(name)?.id || null;
}
const stat = (stats, ...names) => {
  for (const n of names) { const s = stats?.find((x) => x.name === n || x.abbreviation === n); if (s && s.value != null) return Number(s.value); }
  return 0;
};
export function toTable(data, comp) {
  const groups = data.children?.length ? data.children : [data];
  const entries = groups.flatMap((g) => g.standings?.entries || []);
  const rows = entries.map((e) => {
    const name = e.team?.displayName || e.team?.name || '';
    const id = teamId(name, comp) || teamId(e.team?.shortDisplayName, comp);
    return { team: id, name, pos: stat(e.stats, 'rank'), pts: stat(e.stats, 'points', 'P'), pg: stat(e.stats, 'gamesPlayed', 'GP'),
      v: stat(e.stats, 'wins', 'W'), e: stat(e.stats, 'ties', 'D'), d: stat(e.stats, 'losses', 'L'), gf: stat(e.stats, 'pointsFor', 'F'), ga: stat(e.stats, 'pointsAgainst', 'A') };
  });
  rows.sort((a, b) => (a.pos && b.pos ? a.pos - b.pos : b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga)));
  return rows.map((r, i) => ({ ...r, pos: r.pos || i + 1 }));
}
export function toMatches(data, comp) {
  const out = [];
  for (const ev of data.events || []) {
    const c = ev.competitions?.[0];
    if (!(ev.status?.type?.completed ?? c?.status?.type?.completed)) continue;
    const home = c?.competitors?.find((x) => x.homeAway === 'home'); const away = c?.competitors?.find((x) => x.homeAway === 'away');
    if (!home || !away || home.score == null || away.score == null) continue;
    const hn = home.team?.displayName; const an = away.team?.displayName;
    out.push({ d: String(ev.date).slice(0, 10), h: teamId(hn, comp) || hn, a: teamId(an, comp) || an,
      hg: Number(home.score?.value ?? home.score), ag: Number(away.score?.value ?? away.score), c: comp });
  }
  return out;
}
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
/** Una consulta per temporada (de juliol a juny), la més recent primer. */
export function seasonRanges(now, count) {
  const start = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return Array.from({ length: count }, (_, i) => {
    const y = start - i;
    const to = i === 0 ? now : new Date(Date.UTC(y + 1, 5, 30));
    return `${ymd(new Date(Date.UTC(y, 6, 1)))}-${ymd(to)}`;
  });
}
/** ESPN no accepta períodes llargs: cada temporada es demana mes a mes. */
export function monthRanges(range) {
  const [a, b] = range.split('-');
  const d = (s) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
  const end = d(b); const out = [];
  for (let cur = d(a); cur <= end;) {
    const next = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
    const last = new Date(Math.min(next.getTime() - 864e5, end.getTime()));
    out.push(`${ymd(cur)}-${ymd(last)}`); cur = next;
  }
  return out;
}
const OFF_SEASON = new Set([6]); // juliol: gairebé sense partits oficials
async function results(espn, code, ranges, warnings, label) {
  const out = []; let fails = 0;
  for (const r of ranges.flatMap(monthRanges)) {
    if (OFF_SEASON.has(+r.slice(4, 6) - 1)) continue;
    try { out.push(...toMatches(await get(`${SITE}/${espn}/scoreboard?dates=${r}&limit=500`), code)); } catch (e) { fails += 1; if (fails <= 2) warnings.push(`${label} (${r}): ${e.message}`); }
  }
  return out;
}
export async function build(now = new Date()) {
  const comps = {}; const matches = []; const warnings = [];
  for (const [code, c] of Object.entries(COMPS)) {
    try {
      const table = toTable(await get(`${STAND}/${c.espn}/standings`), code);
      if (table.length) comps[code] = { name: c.name, table }; else warnings.push(`${c.name}: classificació buida`);
    } catch (e) { warnings.push(`${c.name}: ${e.message}`); }
    matches.push(...await results(c.espn, code, seasonRanges(now, SEASONS), warnings, c.name));
  }
  for (const [code, espn] of Object.entries(EXTRA)) matches.push(...await results(espn, code, seasonRanges(now, 1), warnings, espn));
  const seen = new Set();
  const unique = matches.filter((m) => { const k = `${m.d}|${m.h}|${m.a}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return { output: { source: 'ESPN', updatedAt: now.toISOString(), comps, matches: unique }, warnings };
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { output, warnings } = await build();
  for (const w of warnings) console.warn('Avís:', w);
  const file = 'public/data/stats.json';
  // Si aquest cop falla una competició, es conserven les dades d'ahir d'aquella competició.
  if (existsSync(file)) {
    try {
      const old = JSON.parse(readFileSync(file, 'utf8'));
      for (const [k, c] of Object.entries(old.comps || {})) if (!output.comps[k] && !old.example) output.comps[k] = c;
      const got = new Set(output.matches.map((m) => m.c));
      if (!old.example) output.matches.push(...(old.matches || []).filter((m) => !got.has(m.c)));
    } catch { /* fitxer antic il·legible: es reescriu */ }
  }
  if (!Object.keys(output.comps).length) { console.error('No s’ha pogut baixar cap competició. No es toca el fitxer.'); process.exit(1); }
  mkdirSync('public/data', { recursive: true });
  writeFileSync(file, JSON.stringify(output));
  console.log(`Fet: ${Object.keys(output.comps).length} competicions, ${output.matches.length} partits.`);
}
