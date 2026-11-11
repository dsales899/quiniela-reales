// Interfície de Quiniela Reales: una sola pàgina per a la jornada i una pestanya de dades.
import { TEAMS } from './teams.js';
import {
  TEAM_GROUPS, STAT_COMPS, searchTeams, norm, toggleSign, checkSignChange, isDouble, doubleMatch, streakLabel, teamById, PLAYERS, SIGNS, GOALS, CATEGORIES, STATE_LABEL, teamView, validSign, needsReview, pleNeedsReview, pleDone, first14,
  columnStatus, progressLabel, tally, tallyLabel, rowAgreement, uncoveredSigns, compareColumns, similarPairs, hits,
  effectiveState, canEdit, fmtDay, fmtFull, toLocalInput, fromLocalInput, countdown, parseMatchList, mergeMatches,
  affectedPicks, jornadaTitle, whatsappMatches, whatsappSummary, gridCsv, teamForm, homeAway, headToHead, standingFor,
} from './logic.js';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sel = (a, b) => (a === b ? 'selected' : '');
const ordinal = (n) => `${n}${{ 1: 'r', 2: 'n', 3: 'r', 4: 't' }[n] || 'è'}`;

/** Actualitza el DOM canviant només el que és diferent: evita parpelleigs i conserva camps oberts. */
function morph(target, html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  syncChildren(target, tpl.content);
}
function syncChildren(a, b) {
  const from = [...a.childNodes]; const to = [...b.childNodes];
  to.forEach((node, i) => {
    const cur = from[i];
    if (!cur) a.appendChild(node);
    else if (cur.nodeType !== node.nodeType || cur.nodeName !== node.nodeName || (cur.dataset?.k !== node.dataset?.k)) a.replaceChild(node, cur);
    else if (cur.nodeType === 3) { if (cur.nodeValue !== node.nodeValue) cur.nodeValue = node.nodeValue; } else if (cur.nodeType === 1) syncEl(cur, node);
  });
  for (let i = to.length; i < from.length; i += 1) from[i].remove();
}
function syncEl(a, b) {
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name) && !(a.nodeName === 'DETAILS' && name === 'open')) a.removeAttribute(name);
  for (const { name, value } of [...b.attributes]) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  if (a.nodeName === 'SELECT') { syncChildren(a, b); const v = b.querySelector('option[selected]')?.value; if (v !== undefined) a.value = v; return; }
  if (a.nodeName === 'INPUT' || a.nodeName === 'TEXTAREA') {
    if (b.hasAttribute('data-v') && document.activeElement !== a) a.value = b.getAttribute('data-v');
    if (a.type === 'checkbox') a.checked = b.hasAttribute('checked');
    return;
  }
  syncChildren(a, b);
}

export function startApp(store, opts = {}) {
  const root = document.getElementById('root');
  const crestUrl = opts.crestUrl || ((t) => t.crest);
  const S = {
    session: store.session?.() || null, app: { activeId: null, access: {} }, jornades: [], picks: {}, payments: {}, okAsk: null, pick: null, pickGroup: null, stats: opts.stats || null, statsState: opts.stats ? 'ok' : 'loading',
    selectedId: null, manual: false, group: 'totes', season: null, tab: 'jornada', compare: null, onlyEqual: false, onlyGap: false, expanded: null, wide: false,
    overlay: {}, errors: {}, saving: 0, saved: false, toast: '', copyText: '', dataMatch: 1, statsComp: null,
    login: { step: 'name', player: null, pin: '', code: '', error: '', first: false, busy: false },
    ad: { reason: '', otherNum: '', results: null, ple: null, note: '', show: null, resultsFor: null }, ed: null,
  };
  let unwatchPicks = null; let unwatchPay = null; let watchedId = null; let toastTimer = null;

  // ---------- Dades derivades ----------
  const J = () => S.jornades.find((j) => j.id === S.selectedId) || null;
  const me = () => S.session?.playerId;
  const isAdmin = () => S.app.access?.[me()]?.role === 'admin';
  const sorted = () => [...S.jornades].sort((a, b) => (a.deadline || 0) - (b.deadline || 0));
  const seasons = () => [...new Set([...S.jornades.map((j) => j.season), opts.season || '2026-27'])].sort().reverse();
  const inScope = (j) => j.season === S.season && (S.group === 'totes' || CATEGORIES[j.category]?.group === S.group)
    && (j.state !== 'draft' || isAdmin());
  const scoped = () => sorted().filter(inScope);
  function picksFor(j) {
    const out = { ...(S.picks[j.id] || {}) };
    const mine = S.overlay[j.id];
    if (mine && me()) out[me()] = { ...(out[me()] || {}), ...mine };
    return out;
  }
  const ordered = (j) => [...(j.matches || [])].sort((a, b) => a.n - b.n);

  // ---------- Peces ----------
  function crest(name, size = '') {
    const t = teamView(name);
    const url = t.crest ? crestUrl(t) : null;
    if (url) return `<img class="crest ${size}" src="${esc(url)}" alt="" loading="lazy" decoding="async" data-k="${esc(t.id)}">`;
    return `<span class="nocrest ${size}" data-k="x${esc(t.tla)}" aria-hidden="true">${esc(t.tla)}</span>`;
  }
  const team = (name) => `<span class="team">${crest(name)}<span>${esc(teamView(name).short)}</span></span>`;

  // ---------- Portada ----------
  function ticket(j) {
    const list = scoped();
    const idx = list.findIndex((x) => x.id === j?.id);
    const options = list.map((x) => `<option value="${esc(x.id)}" ${sel(x.id, j?.id)}>J${esc(x.quinielaNum ?? '–')} · ${esc(fmtDay(x.deadline))} · ${esc(CATEGORIES[x.category]?.label || 'Altres')}${x.id === S.app.activeId ? ' · activa' : ''}</option>`).join('');
    const chips = [['lliga', 'Lliga'], ['europa', 'Champions i Europa'], ['altres', 'Altres'], ['totes', 'Totes']]
      .map(([k, t]) => `<button class="chip" data-act="group" data-v="${k}" aria-pressed="${S.group === k}">${t}</button>`).join('');
    const seasonSel = `<select id="season" data-change="season" aria-label="Temporada" style="height:34px;flex:none;width:auto;border-radius:99px;border:1.5px solid rgba(255,255,255,.5);background:rgba(0,0,0,.14);color:#fff;font-weight:700;font-size:14px;padding-inline:8px">${seasons().map((s) => `<option ${sel(s, S.season)}>${esc(s)}</option>`).join('')}</select>`;
    const pick = `<div class="pickers">
      <button class="arrow" data-act="step" data-v="-1" aria-label="Jornada anterior" ${idx <= 0 ? 'disabled' : ''}>‹</button>
      <select id="jornada" data-change="jornada" aria-label="Jornada">${options || '<option>Cap jornada en aquest filtre</option>'}</select>
      <button class="arrow" data-act="step" data-v="1" aria-label="Jornada següent" ${idx < 0 || idx >= list.length - 1 ? 'disabled' : ''}>›</button>
    </div><div class="chips">${seasonSel}${chips}</div>`;
    if (!j) return `<section class="ticket"><div class="pad">${pick}<div class="headline"><div class="headmeta"><h1>Encara no hi ha cap jornada</h1><p class="deadline">${isAdmin() ? 'Crea-la a la pestanya Jornades.' : 'Quan Denis o Enric en publiquen una, apareixerà aquí.'}</p></div></div></div></section>`;
    const picks = picksFor(j);
    const st = PLAYERS.map((p) => ({ p, s: columnStatus(picks[p.id], j.matches || []) }));
    const done = st.filter((x) => x.s.confirmed).length;
    const state = effectiveState(j);
    const left = state === 'open' ? ` · queden <b>${esc(countdown(j.deadline))}</b>` : '';
    const tags = [
      j.id === S.app.activeId ? '<span class="tag solid">Jornada activa</span>' : '',
      `<span class="tag">${esc(STATE_LABEL[state])}</span>`,
      j.primeraNum ? `<span class="tag">Primera J${esc(j.primeraNum)}</span>` : '',
      j.segundaNum ? `<span class="tag">Segona J${esc(j.segundaNum)}</span>` : '',
      j.europeanPhase ? `<span class="tag">${esc(j.europeanPhase)}</span>` : '',
      j.provisional ? '<span class="tag note">Provisional</span>' : '',
    ].join('');
    const friends = st.map(({ p, s }) => {
      const pct = Math.round(((s.signs + (s.ple ? 1 : 0)) / 15) * 100);
      return `<div class="friend ${p.id === me() ? 'me' : ''}" title="${esc(p.name)}: ${esc(s.state)}"><span class="ring" style="--p:${pct}"><i>${esc(p.short)}</i></span><small>${s.confirmed ? 'OK' : s.complete ? '✓' : s.signs}</small></div>`;
    }).join('');
    return `<section class="ticket"><div class="pad">${pick}
      <div class="headline"><div class="bignum">${esc(j.quinielaNum ?? '–')}</div>
        <div class="headmeta"><div class="eyebrow">La Quiniela ${esc(j.season)}</div><h1>${esc(j.name || CATEGORIES[j.category]?.label || 'Jornada')}</h1>
        <p class="deadline">${state === 'open' ? 'Tanca' : 'Va tancar'} ${esc(fmtFull(j.deadline))}${left}</p></div></div>
      <div class="tags">${tags}</div>
      <div class="friends">${friends}</div>
      <p class="count-line">${done} de 8 han donat l’OK</p>
      <div class="cta"><button class="btn white" data-act="goto" data-v="columna">Ompli la meua columna</button><button class="btn line" data-act="goto" data-v="graella">Veure les 8 columnes</button></div>
    </div></section>`;
  }

  // ---------- La meua columna ----------
  function rowMessage(j, key) {
    const e = S.errors[`${j.id}:${key}`];
    if (!e) return '';
    return `<div class="rowmsg err">${esc(e.message)}${e.retry ? ` <button data-act="retry" data-v="${esc(key)}">Reintenta</button>` : ''}</div>`;
  }
  function column(j) {
    const picks = picksFor(j); const mine = picks[me()];
    const status = columnStatus(mine, j.matches); const editable = canEdit(j) && !status.confirmed;
    const rows = first14(j.matches).map((m) => {
      const v = validSign(mine, m); const review = needsReview(mine, m);
      return `<div class="mrow" data-k="m${m.n}"><div class="mnum">${m.n}</div><div class="teams">${team(m.home)}${team(m.away)}</div>
        <div class="boxes" role="group" aria-label="Partit ${m.n}">${SIGNS.map((s) => `<button class="box ${isDouble(v) ? 'dbl' : ''}" data-act="sign" data-n="${m.n}" data-v="${s}" aria-pressed="${v.includes(s)}" ${editable ? '' : 'disabled'}>${s}</button>`).join('')}</div>
        ${review ? `<div class="rowmsg review">Partit canviat: torna a validar el signe (tenies ${esc(mine[`s${m.n}`])})</div>` : ''}${rowMessage(j, `s${m.n}`)}</div>`;
    }).join('');
    const pm = j.matches.find((m) => m.n === 15);
    const stale = pleNeedsReview(mine, j.matches);
    const pleRow = (side, name) => {
      const v = stale ? '' : (mine?.[side === 'h' ? 'pleH' : 'pleA'] || '');
      return `<div class="plerow">${team(name)}<div class="boxes" role="group" aria-label="Gols de ${esc(name)}">${GOALS.map((g) => `<button class="box" data-act="ple" data-side="${side}" data-v="${g}" aria-pressed="${v === g}" ${editable ? '' : 'disabled'}>${g}</button>`).join('')}</div></div>`;
    };
    const ple = pm ? `<div class="plebox" data-k="ple"><div class="pletitle">Ple al 15</div>${pleRow('h', pm.home)}${pleRow('a', pm.away)}<p class="help">M vol dir tres gols o més.</p>
      ${stale ? '<div class="rowmsg review" style="grid-column:auto">Partit canviat: torna a triar el Ple al 15</div>' : ''}${rowMessage(j, 'pleh') || rowMessage(j, 'plea')}</div>` : '';
    const pct = ((status.signs + (status.ple ? 1 : 0)) / 15) * 100;
    const dbl = doubleMatch(mine, j.matches);
    const dblHelp = dbl ? `<p class="dblhelp on">Doble al partit ${dbl}</p>` : (editable ? '<p class="dblhelp">Pots marcar dues opcions en un partit (doble). És opcional.</p>' : '');
    return `<section class="sec pad" id="columna"><div class="sechead"><h2>La meua columna</h2><p>${esc(progressLabel(status))}</p></div>${dblHelp}
      <div class="progressbar"><i style="width:${pct}%"></i></div>
      ${editable || status.confirmed ? '' : `<p class="help" style="margin-bottom:8px">${j.state === 'draft' ? 'La jornada encara no està oberta.' : 'Jornada tancada: ja no es poden canviar signes.'}</p>`}
      ${status.confirmed ? okBanner(mine) : ''}
      <div class="slip">${rows || '<div class="empty">Els partits encara no s’han publicat.</div>'}${ple}</div>${okBox(j, status)}</section>`;
  }
  function okBanner(mine) {
    const at = typeof mine.okAt === 'number' ? ` el ${fmtFull(mine.okAt)}` : '';
    return `<div class="okbanner" data-k="okb"><b>OK donat${esc(at)}</b><span>La columna ja no es pot canviar. Si t’has equivocat, avisa Denis o Enric.</span></div>`;
  }
  function okBox(j, status) {
    if (status.confirmed || !canEdit(j)) return '';
    if (!status.complete) return `<p class="okhint" data-k="okh">Quan tinguis els 14 signes i el Ple al 15, podràs donar l’OK.</p>`;
    if (S.okAsk === j.id) {
      return `<div class="okask" data-k="oka"><b>Segur? Després no podràs canviar cap signe.</b><span>Només Denis o Enric la poden tornar a obrir.</span>
        <div class="two"><button class="btn ghost" data-act="ok-no">Encara no</button><button class="btn ink" data-act="ok-yes">Sí, dono l’OK</button></div></div>`;
    }
    return `<button class="btn ink okbtn" data-k="okbtn" data-act="ok-ask">Dono l’OK a la meua columna</button>`;
  }

  // ---------- Avisos ----------
  function alerts(j) {
    const picks = picksFor(j); const list = similarPairs(picks, j.matches);
    const mineFirst = [...list].sort((a, b) => Number(b.a.id === me() || b.b.id === me()) - Number(a.a.id === me() || a.b.id === me()));
    if (!list.length) return `<details class="alert off" data-k="off"><summary><b>0</b>Cap parella arriba a 12 signes iguals</summary><ul><li><small>L’avís apareix quan les dues persones tenen els 14 signes posats.</small></li></ul></details>`;
    const name = (x) => (x.a.id === me() ? `Tu i ${x.b.name}` : x.b.id === me() ? `Tu i ${x.a.name}` : `${x.a.name} i ${x.b.name}`);
    const top = mineFirst[0];
    return `<details class="alert on" data-k="on"><summary><b>${list.length}</b><span>${esc(name(top))}: ${top.equal} de 14 iguals</span><em>Detall</em></summary>
      <ul>${mineFirst.map((x) => `<li><strong>${esc(name(x))}: ${x.equal} de 14 iguals</strong><small>${esc(x.verdict ? `${x.verdict} · ` : '')}${esc(x.pleLabel)}</small></li>`).join('')}</ul></details>`;
  }

  // ---------- Graella ----------
  function grid(j) {
    const picks = picksFor(j); const results = j.results || {};
    const statusDot = (p) => { const s = columnStatus(picks[p.id], j.matches).state; return `<i class="colstate ${s === 'confirmada' ? 'okdone' : s === 'completa' ? 'completa' : s === 'en curs' ? 'encurs' : ''}"></i>`; };
    const head = `<tr><th class="corner">Partit</th>${PLAYERS.map((p) => `<th class="${p.id === me() ? 'me' : ''}" scope="col" title="${esc(p.name)}: columna ${esc(columnStatus(picks[p.id], j.matches).state)}">${esc(S.wide ? p.name : p.short)}${statusDot(p)}</th>`).join('')}</tr>`;
    const myPick = picks[me()];
    const other = S.compare ? picks[S.compare] : null;
    const rows = first14(j.matches).filter((m) => {
      const t = tally(picks, m);
      if (S.onlyGap && !(uncoveredSigns(t).length && t.pending < 8)) return false;
      if (S.onlyEqual) {
        if (S.compare) { const a = validSign(myPick, m); return a && a === validSign(other, m); }
        return Boolean(rowAgreement(t));
      }
      return true;
    }).map((m) => {
      const t = tally(picks, m); const a = rowAgreement(t); const total = t[1] + t.X + t[2];
      const h = teamView(m.home); const v = teamView(m.away);
      const marks = t[1] + t.X + t[2];
      const bar = total ? SIGNS.map((s) => `<i class="b${s}" style="width:${(t[s] / Math.max(8, marks)) * 100}%"></i>`).join('') : '';
      const res = results[m.n];
      const cells = PLAYERS.map((p) => {
        const s = validSign(picks[p.id], m); const rev = needsReview(picks[p.id], m);
        const mark = res && s ? (s === res ? 'hit' : 'miss') : '';
        return `<td class="cell ${rev ? 'review' : s ? `v${s}` : 'empty'} ${mark}">${rev ? '!' : s || '—'}</td>`;
      }).join('');
      const open = S.expanded === m.n;
      const detail = open ? `<tr class="detail" data-k="d${m.n}"><td colspan="9"><div class="dline"><strong>${esc(h.name)} - ${esc(v.name)}</strong>
        <span>${esc(tallyLabel(t))}</span>${a ? `<span class="agree">${esc(a.label)}</span>` : ''}
        ${uncoveredSigns(t).length && total ? `<span class="gap">Sense cobrir: ${uncoveredSigns(t).join(', ')}</span>` : ''}
        ${res ? `<span>Resultat oficial: <b>${esc(res)}</b></span>` : ''}
        <button class="linkbtn" data-act="fitxa" data-v="${m.n}">Veure la forma dels equips</button></div></td></tr>` : '';
      return `<tr data-k="r${m.n}"><th scope="row"><button class="rowbtn" data-act="expand" data-v="${m.n}" aria-expanded="${open}" aria-label="Partit ${m.n}: ${esc(h.name)} - ${esc(v.name)}"><span class="n">${m.n}</span>${crest(m.home)}${crest(m.away)}<span class="sig ${a?.kind === 'all' ? 'check' : ''}">${a?.kind === 'all' ? '✓' : S.wide ? `${esc(h.tla)}-${esc(v.tla)}` : ''}</span><span class="tbar">${bar}</span></button></th>${cells}</tr>${detail}`;
    }).join('');
    const pm = j.matches.find((m) => m.n === 15);
    const res = j.pleResult || {};
    const plerow = (cls, side, name) => `<tr class="ple ${cls}" data-k="${cls}"><th scope="row"><div class="rowbtn" style="grid-template-columns:24px 20px minmax(0,1fr)"><span class="n">${side === 'h' ? 'P15' : ''}</span>${crest(name)}<span class="sig">${esc(teamView(name).tla)}</span></div></th>${PLAYERS.map((p) => {
      const pick = picks[p.id]; const stale = pleNeedsReview(pick, j.matches);
      const g = stale ? '' : pick?.[side === 'h' ? 'pleH' : 'pleA'] || '';
      const official = res[side];
      return `<td class="cell ${stale ? 'review' : g ? 'pg' : 'empty'} ${official && g ? (g === official ? 'hit' : 'miss') : ''}">${stale ? '!' : g || '—'}</td>`;
    }).join('')}</tr>`;
    const ple = pm && !S.onlyEqual && !S.onlyGap ? plerow('ple1', 'h', pm.home) + plerow('ple2', 'a', pm.away) : '';
    const empty = rows ? '' : `<tr data-k="none"><td colspan="9"><div class="empty">Cap partit compleix aquest filtre.</div></td></tr>`;
    const friendChips = PLAYERS.filter((p) => p.id !== me()).map((p) => `<button class="mini" data-act="compare" data-v="${p.id}" aria-pressed="${S.compare === p.id}">${esc(p.name)}</button>`).join('');
    const compare = S.compare ? compareView(j, picks) : '';
    return `<section class="sec pad" id="graella"><div class="sechead"><h2>Les 8 columnes</h2><p>Toca una fila per al detall</p></div>
      <div id="alerts">${alerts(j)}</div>
      <div class="tools"><button class="tool" data-act="onlyEqual" aria-pressed="${S.onlyEqual}">Mostra on coincidim</button><button class="tool" data-act="onlyGap" aria-pressed="${S.onlyGap}">Mostra els partits amb un signe sense cobrir</button><button class="tool" data-act="wide" aria-pressed="${S.wide}">Noms sencers</button></div>
      <div class="gridwrap ${S.wide ? '' : 'fit'}"><table class="grid ${S.wide ? 'wide' : ''}"><thead>${head}</thead><tbody>${rows}${empty}${ple}</tbody></table></div>
      <div class="gridlegend"><span><i></i>Pendent</span><span><i class="a"></i>En curs</span><span><i class="b"></i>Completa</span><span><i class="c"></i>OK donat</span><span>! Cal revalidar</span></div>
      <div class="cmp"><div class="sechead" style="margin-bottom:6px"><h2 style="font-size:20px">Compara amb mi</h2></div><div class="tools" style="margin-top:0">${friendChips}</div>${compare}</div></section>`;
  }
  function compareView(j, picks) {
    const a = picks[me()]; const b = picks[S.compare]; const c = compareColumns(a, b, j.matches);
    const friend = PLAYERS.find((p) => p.id === S.compare);
    const cell = (s) => `<span class="cmpcell ${s ? `cell v${s}` : 'cell empty'}" style="height:34px">${s || '—'}</span>`;
    const rows = first14(j.matches).map((m) => {
      const x = validSign(a, m); const y = validSign(b, m);
      if (S.onlyEqual && !(x && x === y)) return '';
      return `<div class="cmprow ${x && x === y ? 'same' : ''}" data-k="c${m.n}"><div class="mnum">${m.n}</div><div class="teams" style="grid-template-columns:1fr 1fr">${team(m.home)}${team(m.away)}</div>${cell(x)}${cell(y)}</div>`;
    }).join('');
    return `<div class="slip"><div class="cmpsum"><strong>${esc(c.label)}</strong>${c.verdict ? `<em>${esc(c.verdict)}</em>` : ''}<span class="help">${esc(c.pleLabel)}</span></div>
      <div class="cmprow" style="border-top:0"><span></span><span></span><div class="cmphead">Tu</div><div class="cmphead">${esc(friend.short)}</div></div>${rows}</div>`;
  }

  // ---------- Resultats i exportació ----------
  function results(j) {
    const picks = picksFor(j);
    const loaded = first14(j.matches).filter((m) => j.results?.[m.n]).length;
    const showHits = j.showHits && (loaded > 0 || j.pleResult?.h);
    const list = showHits ? `<div class="sechead" style="margin-top:0"><p style="text-align:left">${loaded} de 14 resultats oficials carregats</p></div><div class="slip">${PLAYERS.map((p) => {
      const h = hits(picks[p.id], j);
      return `<div class="hitrow" data-k="h${p.id}"><b>${esc(p.name)}</b><div class="hitbar"><i style="width:${(h.count / 14) * 100}%"></i></div><strong>${h.count}<span style="font-size:13px;color:var(--muted)">/14</span></strong><small>${h.incomplete ? 'Incompleta' : `Ple ${esc(h.ple)}`}</small></div>`;
    }).join('')}</div>${j.resultNote ? `<p class="sourceline">${esc(j.resultNote)}</p>` : ''}` : '';
    return `<section class="sec pad" id="resum"><div class="sechead"><h2>${showHits ? 'Encerts dels 14' : 'Comparteix'}</h2></div>${list}
      <div class="exports"><button class="btn ink wide" data-act="wa-summary">Copia per a WhatsApp: els 8 pronòstics</button><button class="btn ghost" data-act="wa-matches">Copia els partits</button><button class="btn ghost" data-act="csv">Exporta CSV</button></div></section>`;
  }

  // ---------- Dades ----------
  function dataTab(j) {
    const stats = S.stats;
    const rows = j ? ordered(j) : [];
    const strip = rows.map((m) => `<button class="mchip" data-act="dmatch" data-v="${m.n}" aria-pressed="${S.dataMatch === m.n}" aria-label="${esc(m.home)} - ${esc(m.away)}"><b>${m.n === 15 ? 'P15' : m.n}</b>${crest(m.home)}${crest(m.away)}</button>`).join('');
    const m = rows.find((x) => x.n === S.dataMatch) || rows[0];
    const updated = stats?.updatedAt ? new Date(stats.updatedAt).toLocaleString('ca-ES', { timeZone: 'Europe/Madrid', dateStyle: 'medium', timeStyle: 'short' }) : null;
    const source = stats ? `<p class="sourceline">${stats.example ? 'Dades d’exemple' : `Font: ${esc(stats.source || 'football-data.org')}`}${updated ? ` · actualitzat ${esc(updated)}` : ''}${stats.note ? `. ${esc(stats.note)}` : ''}</p>` : '';
    let card = '<div class="slip"><div class="empty">Dades no disponibles</div></div>';
    if (m) {
      const a = teamView(m.home); const b = teamView(m.away);
      const block = (t, render) => (t.id ? render(t.id) : '<span class="nodata">Dades no disponibles</span>');
      const standing = (t) => block(t, (id) => {
        const s = standingFor(stats, id, j?.category === 'europea' ? ['CL', 'EL', 'ECL'] : ['PD', 'SD', 'LF']);
        return s ? `<span class="stat">${ordinal(s.pos)} · ${s.pts} pts</span><span class="statsub">${esc(s.comp)} · ${s.pg} PJ · ${s.v}V ${s.e}E ${s.d}D</span>` : '<span class="nodata">Dades no disponibles</span>';
      });
      const form = (t) => block(t, (id) => {
        const f = teamForm(stats, id);
        return f.length ? `<div class="form">${f.map((x) => `<span class="fbox ${x.res}" title="${esc(x.gf)}-${esc(x.ga)} ${esc(x.home ? 'a casa' : 'fora')}">${x.res}</span>`).join('')}</div><span class="streak ${f[0].res}">${esc(streakLabel(f))}</span>` : '<span class="nodata">Dades no disponibles</span>';
      });
      const split = (t) => block(t, (id) => {
        if (!teamForm(stats, id).length) return '<span class="nodata">Dades no disponibles</span>';
        const ha = homeAway(stats, id);
        return `<span class="statsub"><b>Casa</b> ${ha.home.V}V ${ha.home.E}E ${ha.home.D}D</span><span class="statsub"><b>Fora</b> ${ha.away.V}V ${ha.away.E}E ${ha.away.D}D</span>`;
      });
      const h2h = a.id && b.id ? headToHead(stats, a.id, b.id) : [];
      const h2hList = h2h.length ? `<ul class="h2h">${h2h.map((x) => `<li><small>${esc(new Date(x.d).toLocaleDateString('ca-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }))}</small><span class="r">${esc(teamView(x.h).short)}</span><b>${x.hg}-${x.ag}</b><span>${esc(teamView(x.a).short)}</span></li>`).join('')}</ul>` : '<span class="nodata">Dades no disponibles</span>';
      card = `<div class="slip"><div class="versus"><div>${crest(m.home, 'lg')}<span>${esc(a.short)}</span></div><span>–</span><div>${crest(m.away, 'lg')}<span>${esc(b.short)}</span></div></div>
        <div class="dsec"><h3>Classificació</h3><div class="pair"><div>${standing(a)}</div><div>${standing(b)}</div></div></div>
        <div class="dsec"><h3>Últims 5 partits</h3><div class="pair"><div>${form(a)}</div><div>${form(b)}</div></div></div>
        <div class="dsec"><h3>Casa i fora</h3><div class="pair"><div>${split(a)}</div><div>${split(b)}</div></div></div>
        <div class="dsec"><h3>Últims 5 enfrontaments</h3>${h2hList}</div></div>`;
    }
    const active = S.statsComp || (j?.category === 'europea' ? 'CL' : 'PD');
    const seg = STAT_COMPS.map(([k, name]) => `<button class="mini" data-act="statscomp" data-v="${k}" aria-pressed="${k === active}">${esc(name)}</button>`).join('');
    const hl = m ? [teamView(m.home).id, teamView(m.away).id] : [];
    const comp = stats?.comps?.[active];
    const nameOf = (r) => (r.team ? teamById(r.team)?.name : null) || r.name || '';
    const mini = (r) => {
      const f = teamForm(stats, r.team, 5, active);
      return f.length ? `<span class="mform">${f.map((x) => `<i class="${x.res}" title="${x.gf}-${x.ga}">${x.res}</i>`).join('')}</span>` : '<span class="mform none">—</span>';
    };
    const tableBody = comp?.table?.length ? `<div class="slip"><table class="stable"><thead><tr><th></th><th>Equip</th><th>PJ</th><th>Pts</th><th class="fcol">Ratxa</th></tr></thead><tbody>${comp.table.map((r) => `<tr class="${r.team && hl.includes(r.team) ? 'hl' : ''}"><td>${r.pos}</td><td>${team(nameOf(r))}</td><td>${r.pg}</td><td><b>${r.pts}</b></td><td class="fcol">${mini(r)}</td></tr>`).join('')}</tbody></table></div><p class="sourceline">Ratxa: últims 5 partits d’aquesta competició, el més recent a l’esquerra.</p>`
      : `<div class="slip"><div class="empty">Dades no disponibles${stats?.pending?.includes(active) ? '. S’ompliran quan s’activi l’actualització diària.' : ''}</div></div>`;
    const table = `<div class="segment segscroll">${seg}</div>${tableBody}`;
    return `<section class="sec pad" style="padding-top:18px"><div class="sechead"><h2>Com arriben</h2><p>${j ? esc(jornadaTitle(j)) : ''}</p></div>
      ${!stats ? `<p class="help">${S.statsState === 'loading' ? 'Carregant dades…' : 'Dades no disponibles'}</p>` : ''}
      <div class="matchstrip">${strip}</div>${card}${source}</section>
      <section class="sec pad"><div class="sechead"><h2>Classificacions</h2></div>${table}${source}</section>`;
  }

  // ---------- Administració: pestanya Jornades ----------
  const CATEGORY_BUTTONS = [['lliga', 'Lliga'], ['europea', 'Europa'], ['copa', 'Copa']];
  const shortCategory = (j) => ({ lliga: 'Lliga', europea: 'Europa', copa: 'Copa', especial: 'Especial' }[j.category] || 'Altres');
  const seasonJornades = () => S.jornades.filter((j) => j.season === S.season).sort((a, b) => (a.quinielaNum || 0) - (b.quinielaNum || 0));
  function nextNumbers() {
    const list = seasonJornades().map((j) => j.quinielaNum || 0);
    const first = (list.length ? Math.max(...list) : (opts.firstNumber || 1) - 1) + 1;
    return [first, first + 1, first + 2];
  }
  function openEditor(num) {
    const j = seasonJornades().find((x) => x.quinielaNum === num) || null;
    if (j) selectJornada(j.id);
    const rows = [];
    for (let n = 1; n <= 15; n += 1) { const m = j?.matches?.find((x) => x.n === n); rows.push(m ? { n, home: m.home, away: m.away, comp: m.comp || '' } : { n, home: '', away: '', comp: '' }); }
    S.ed = { num, id: j?.id || null, category: j?.category === 'europea' || j?.category === 'copa' ? j.category : j ? 'lliga' : '', deadline: j ? toLocalInput(j.deadline) : '', text: '',
      rows, problems: [], confirm: false, primeraNum: j?.primeraNum || '', segundaNum: j?.segundaNum || '', europeanPhase: j?.europeanPhase || '', name: j?.name || '', provisional: Boolean(j?.provisional) };
    paint();
  }
  function parseEditor() {
    const e = S.ed; if (!e || !e.text.trim()) return;
    const r = parseMatchList(e.text);
    e.rows = r.matches.map((m) => ({ ...m })); for (const n of r.missing) e.rows.push({ n, home: '', away: '', comp: '' });
    e.rows.sort((a, b) => a.n - b.n); e.problems = r.problems; e.confirm = false; paint();
  }
  function checkLoad(j) {
    const rows = S.ed.rows || [];
    const incoming = rows.filter((m) => m.home.trim() && m.away.trim());
    const { merged, changed } = mergeMatches(j?.matches || [], incoming);
    const missing = []; for (let i = 1; i <= 15; i += 1) if (!incoming.some((m) => m.n === i)) missing.push(i);
    const affected = j ? affectedPicks(changed, picksFor(j)) : [];
    const needs = affected.some((c) => c.players.length);
    return { merged, changed, affected, missing, needsConfirm: needs };
  }
  function blocker(e, j, c) {
    if (!e.category) return 'Tria Lliga, Europa o Copa';
    if (!e.deadline) return 'Posa l’hora límit';
    if (c.missing.length) return `Falten ${c.missing.length} partits`;
    if (!j && fromLocalInput(e.deadline) <= Date.now()) return 'L’hora límit ha de ser futura';
    if (c.needsConfirm && !e.confirm) return 'Confirma els canvis de partits';
    return '';
  }
  function editor(j) {
    const e = S.ed;
    const published = j && j.state !== 'draft';
    const check = checkLoad(j);
    const stop = blocker(e, j, check);
    const cat = CATEGORY_BUTTONS.map(([k, t]) => `<button class="catb" data-act="ed-cat" data-v="${k}" aria-pressed="${e.category === k}">${t}</button>`).join('');
    const slot = (m, side) => {
      const name = side === 'home' ? m.home : m.away;
      const t = name.trim() ? teamView(name) : null;
      const label = `${m.n === 15 ? 'Ple al 15' : `Partit ${m.n}`}, ${side === 'home' ? 'local' : 'visitant'}`;
      return `<button class="slot ${t ? '' : 'empty'}" data-act="pick-open" data-n="${m.n}" data-side="${side}" aria-label="${esc(label)}${t ? `: ${esc(t.name)}` : ''}">${t ? `${crest(name)}<span>${esc(t.short)}</span>` : '<span>+ Equip</span>'}</button>`;
    };
    const rows = e.rows.map((m) => `<div class="editrow" data-k="e${m.n}"><span class="mnum">${m.n === 15 ? 'P' : m.n}</span>${slot(m, 'home')}${slot(m, 'away')}</div>`).join('');
    const noCrest = e.rows ? [...new Set(e.rows.flatMap((m) => [m.home, m.away]).filter((x) => x.trim() && !teamView(x).known))] : [];
    const notices = `${noCrest.length ? `<div class="notice"><span>Sense escut: ${noCrest.map(esc).join(', ')}</span><span>Toca la casella per triar l’equip correcte. Si no hi és, sortirà amb les seues sigles.</span></div>` : ''}
      ${e.problems.length ? `<div class="notice">No he pogut llegir:${e.problems.map((p) => `<span>${esc(p)}</span>`).join('')}</div>` : ''}
      ${check.needsConfirm ? `<div class="notice"><span>Aquests canvis afecten pronòstics. La resta es conserva.</span>${check.affected.filter((c) => c.players.length).map((c) => `<span>${c.n === 15 ? 'P15' : c.n}: ${esc(c.before)} → ${esc(c.after)} (${esc(c.players.join(', '))})</span>`).join('')}<label style="display:flex;gap:7px;align-items:center;margin-top:4px"><input id="ed-confirm" type="checkbox" data-ed="confirm" ${e.confirm ? 'checked' : ''}> Confirmo que vull substituir aquests partits</label></div>` : ''}`;
    const primera = `<option value="">—</option>${Array.from({ length: 38 }, (_, i) => `<option ${sel(String(i + 1), String(e.primeraNum))}>${i + 1}</option>`).join('')}`;
    const more = `<details class="more" data-k="more"><summary>Més opcions</summary><div class="morein">
      <div class="two"><label class="field">Jornada de Primera<select id="ed-p" data-ed="primeraNum">${primera}</select></label><label class="field">Jornada de Segona<input id="ed-s" inputmode="numeric" data-ed="segundaNum" value="${esc(e.segundaNum)}" data-v="${esc(e.segundaNum)}"></label></div>
      <label class="field">Fase europea<input id="ed-f" data-ed="europeanPhase" value="${esc(e.europeanPhase)}" data-v="${esc(e.europeanPhase)}"></label>
      <label class="field">Nom propi<input id="ed-n" data-ed="name" value="${esc(e.name)}" data-v="${esc(e.name)}"></label>
      <label style="display:flex;gap:8px;align-items:center;font-weight:700"><input id="ed-pr" type="checkbox" data-ed="provisional" ${e.provisional ? 'checked' : ''}> Dates provisionals</label></div></details>`;
    const state = j ? effectiveState(j) : null;
    const active = j && j.id === S.app.activeId;
    const manage = published ? `<div class="edsec"><h3>Estat: ${esc(STATE_LABEL[state])}${active ? ' · activa' : ''}</h3>
      <div class="two">${active ? '' : '<button class="btn ghost" data-act="ad-active">Fes-la activa</button>'}
      ${state === 'open' ? '<button class="btn ghost" data-act="ad-state" data-v="closed">Tanca l’edició</button>' : ''}${state === 'closed' ? '<button class="btn ghost" data-act="ad-state" data-v="final">Finalitza</button>' : ''}</div>
      ${state === 'closed' || state === 'final' ? `<label class="field">Motiu per reobrir-la<input id="ad-reason" data-input="reason" value="${esc(S.ad.reason)}" data-v="${esc(S.ad.reason)}" placeholder="Ex.: partit ajornat"></label><button class="btn ghost" data-act="ad-reopen">Reobri amb l’hora límit d’aquí dalt</button>` : ''}
      ${(j.reopenLog || []).map((l) => `<p class="logline">Reoberta ${esc(fmtFull(l.at))}: ${esc(l.reason)}</p>`).join('')}</div>${columnsAdmin(j)}${resultsAdmin(j)}` : '';
    const label = published ? 'Desa els canvis' : 'Publica la jornada';
    return `<tr class="edrow" data-k="ed"><td colspan="3"><div class="editor">
      <div class="catrow" role="group" aria-label="Tipus de jornada">${cat}</div>
      <label class="field">Hora límit (hora de Madrid)<input id="ed-deadline" type="datetime-local" data-ed="deadline" value="${esc(e.deadline)}" data-v="${esc(e.deadline)}"></label>
      <div class="field">Partits<span class="help">Toca una casella i tria l’equip.</span></div>
      <div class="editlist">${rows}</div>
      <details class="more" data-k="paste"><summary>O enganxa la llista de WhatsApp</summary><div class="morein"><textarea class="pastebox" id="ed-text" data-ed="text" aria-label="Llista de partits" placeholder="1. Barça - Betis&#10;2. Girona - Sevilla&#10;…&#10;P15. R. Madrid - Atlético" data-v="${esc(e.text)}">${esc(e.text)}</textarea></div></details>
      ${notices}${more}
      <button class="btn ink" data-act="ed-publish" ${stop ? 'disabled' : ''}>${esc(stop || label)}</button>
      ${published ? '' : '<p class="help">En publicar, queda oberta i passa a ser la jornada activa del grup.</p>'}${manage}
    </div></td></tr>`;
  }
  function jornadesTab() {
    const rows = [];
    const add = (num, j) => {
      const open = S.ed?.num === num;
      const state = j ? effectiveState(j) : null;
      const active = j && j.id === S.app.activeId;
      const status = !j ? '<span class="st add">+ Afegeix partits</span>' : active ? `<span class="st on">✓ Activa</span>` : `<span class="st">${esc(STATE_LABEL[state])}</span>`;
      rows.push(`<tr class="jrow ${open ? 'open' : ''}" data-k="j${num}"><td class="jnum"><button data-act="ed-open" data-v="${num}" aria-expanded="${open}" aria-label="Jornada ${num}">J${num}</button></td><td><button class="jmain" data-act="ed-open" data-v="${num}" tabindex="-1">${j ? esc(shortCategory(j)) : '<span class="muted">Per definir</span>'}</button></td><td><button class="jmain r" data-act="ed-open" data-v="${num}" tabindex="-1">${status}</button></td></tr>`);
      if (open) rows.push(editor(j));
    };
    for (const j of seasonJornades()) add(j.quinielaNum, j);
    for (const n of nextNumbers()) add(n, null);
    if (S.ed && !rows.some((r) => r.includes(`data-k="j${S.ed.num}"`))) add(S.ed.num, null);
    const acc = `<details class="acard" data-k="a5"><summary>Comptes</summary><div>${PLAYERS.map((p) => {
      const x = S.app.access?.[p.id] || {};
      return `<div class="accrow" data-k="u${p.id}"><span>${esc(p.name)}<small>${x.claimed ? 'Compte actiu' : 'Pendent d’entrar'}</small></span>${x.role === 'admin' ? '<span class="chipst">Admin</span>' : ''}<button class="mini" data-act="ad-pin" data-v="${p.id}" ${x.claimed ? '' : 'disabled'}>Reinicia PIN</button></div>`;
    }).join('')}</div></details>`;
    return `<section class="sec pad"><div class="sechead"><h2>Jornades</h2><p>${esc(S.season || '')}</p></div>
      <div class="slip"><table class="jtable"><tbody>${rows.join('')}</tbody></table></div>
      <div class="otherrow"><label class="field">Una altra jornada<input id="other-num" inputmode="numeric" data-input="otherNum" value="${esc(S.ad.otherNum || '')}" data-v="${esc(S.ad.otherNum || '')}" placeholder="Número"></label><button class="btn ghost" data-act="ed-other">Obre</button></div>
      <div style="margin-top:12px">${acc}</div></section>`;
  }
  function columnsAdmin(j) {
    const picks = picksFor(j); const pay = S.payments[j.id] || {};
    const list = PLAYERS.map((p) => ({ p, s: columnStatus(picks[p.id], j.matches) }));
    const okN = list.filter((x) => x.s.confirmed).length; const paidN = PLAYERS.filter((p) => pay[p.id]).length;
    const label = (s) => (s.confirmed ? '<span class="chipst ok">OK</span>' : s.complete ? '<span class="chipst">Completa</span>' : s.state === 'en curs' ? `<span class="chipst">${s.signs}/14</span>` : '<span class="chipst off">Pendent</span>');
    return `<div class="edsec" data-k="cols"><h3>Columnes i pagaments</h3><p class="logline">${okN} de 8 amb l’OK · ${paidN} de 8 han pagat</p>
      <div class="paylist">${list.map(({ p, s }) => `<div class="payrow" data-k="p${p.id}"><b>${esc(p.name)}</b>${label(s)}
        ${s.confirmed ? `<button class="mini" data-act="ad-unlock" data-v="${p.id}">Desbloqueja</button>` : '<span></span>'}
        <button class="mini" data-act="ad-paid" data-v="${p.id}" aria-pressed="${Boolean(pay[p.id])}">${pay[p.id] ? '✓ Pagat' : 'Pagat'}</button></div>`).join('')}</div></div>`;
  }
  // ---------- Selector d'equips ----------
  function pickerSheet() {
    const P = S.pick; if (!P || !S.ed) return '';
    const row = S.ed.rows.find((r) => r.n === P.n);
    const current = row[P.side];
    const group = P.q.trim() ? null : S.pickGroup || (S.ed.category === 'europea' ? 'CL' : 'PD');
    const list = searchTeams(P.q, group).slice(0, 60);
    const chips = TEAM_GROUPS.map(([k, t]) => `<button class="mini" data-act="pick-group" data-v="${k}" aria-pressed="${!P.q.trim() && group === k}">${t}</button>`).join('');
    const other = row[P.side === 'home' ? 'away' : 'home'];
    const title = `${P.n === 15 ? 'Ple al 15' : `Partit ${P.n}`} · ${P.side === 'home' ? 'Local' : 'Visitant'}`;
    const free = P.q.trim() && !list.some((t) => norm(t.name) === norm(P.q)) ? `<button class="freeb" data-act="pick-free">Fes servir «${esc(P.q.trim())}» sense escut</button>` : '';
    return `<div class="sheetbg" data-act="pick-close"></div><div class="sheet" role="dialog" aria-label="${esc(title)}">
      <div class="sheethead"><div><b>${esc(title)}</b>${other.trim() ? `<small>${P.side === 'home' ? 'contra' : 'rep'} ${esc(teamView(other).short)}</small>` : ''}</div><button class="mini" data-act="pick-close">Fet</button></div>
      <input id="pick-q" class="pickq" data-input="pickQ" placeholder="Busca un equip" autocomplete="off" value="${esc(P.q)}" data-v="${esc(P.q)}">
      <div class="pickchips">${chips}</div>
      <div class="pickgrid">${list.map((t) => `<button class="pickt ${current && teamView(current).id === t.id ? 'on' : ''}" data-act="pick-team" data-v="${t.id}" data-k="t${t.id}"><img src="${esc(crestUrl({ ...t, crest: `crests/${t.id}.webp` }))}" alt="" loading="lazy"><span>${esc(t.short)}</span></button>`).join('')}</div>
      ${list.length ? '' : '<p class="help">Cap equip amb aquest nom.</p>'}${free}
      ${current.trim() ? '<button class="freeb" data-act="pick-clear">Buida la casella</button>' : ''}</div>`;
  }
  function pickAdvance() {
    const P = S.pick; const rows = S.ed.rows;
    if (P.side === 'home' && !rows.find((r) => r.n === P.n).away.trim()) { S.pick = { ...P, side: 'away', q: '' }; return; }
    const next = rows.find((r) => r.n > P.n && (!r.home.trim() || !r.away.trim()));
    S.pick = next ? { n: next.n, side: next.home.trim() ? 'away' : 'home', q: '' } : null;
  }
  function pickSet(name) {
    const row = S.ed.rows.find((r) => r.n === S.pick.n);
    row[S.pick.side] = name; S.ed.confirm = false; pickAdvance(); paint();
    if (S.pick) setTimeout(() => document.querySelector('.sheet .pickgrid')?.scrollTo?.({ top: 0 }), 0);
  }
  function resultsAdmin(j) {
    if (S.ad.resultsFor !== j.id) {
      S.ad.resultsFor = j.id; S.ad.results = { ...(j.results || {}) }; S.ad.ple = { ...(j.pleResult || {}) }; S.ad.note = j.resultNote || ''; S.ad.show = Boolean(j.showHits);
    }
    const a = S.ad;
    const rows = first14(j.matches).map((m) => `<div class="mrow" data-k="ar${m.n}" style="padding-block:4px"><div class="mnum">${m.n}</div><div class="teams">${team(m.home)}${team(m.away)}</div><div class="boxes">${SIGNS.map((s) => `<button class="box" data-act="ad-res" data-n="${m.n}" data-v="${s}" aria-pressed="${a.results[m.n] === s}">${s}</button>`).join('')}</div></div>`).join('');
    const pm = j.matches.find((m) => m.n === 15);
    const ple = pm ? ['h', 'a'].map((side) => `<div class="plerow">${team(side === 'h' ? pm.home : pm.away)}<div class="boxes">${GOALS.map((g) => `<button class="box" data-act="ad-ple" data-side="${side}" data-v="${g}" aria-pressed="${a.ple[side] === g}">${g}</button>`).join('')}</div></div>`).join('') : '';
    return `<details class="more" data-k="res"><summary>Resultats oficials</summary><div class="morein"><div>${rows}</div>${ple}
      <label class="field">Nota (partit ajornat o resolució especial)<input id="ad-note" data-input="note" value="${esc(a.note)}" data-v="${esc(a.note)}"></label>
      <label style="display:flex;gap:8px;align-items:center;font-weight:700"><input id="ad-show" type="checkbox" data-input="show" ${a.show ? 'checked' : ''}> Mostra el recompte d’encerts</label>
      <button class="btn ink" data-act="ad-results">Desa els resultats</button></div></details>`;
  }

  // ---------- Entrada ----------
  function loginView() {
    const L = S.login;
    if (L.step === 'name') {
      return `<div class="login pad"><h1>Quiniela<br>Reales</h1><p>Qui ets?</p><div class="names">${PLAYERS.map((p) => `<button class="nameb" data-act="l-name" data-v="${p.id}">${esc(p.name)}</button>`).join('')}</div></div>`;
    }
    const p = PLAYERS.find((x) => x.id === L.player);
    const dots = [0, 1, 2, 3].map((i) => `<i class="${L.pin.length > i ? 'on' : ''}"></i>`).join('');
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => `<button data-act="l-key" data-v="${k}" ${L.busy ? 'disabled' : ''}>${k}</button>`).join('');
    return `<div class="login pad"><h1 style="font-size:46px">${esc(p.name)}</h1>
      ${L.first ? `<label class="field">Codi d’invitació<input id="invite" data-input="code" autocomplete="off" autocapitalize="characters" value="${esc(L.code)}" data-v="${esc(L.code)}"></label><p>Tria un PIN de 4 xifres</p>` : '<p>Escriu el teu PIN</p>'}
      ${L.error ? `<div class="error">${esc(L.error)}</div>` : ''}
      <div class="pin-dots" role="status" aria-label="${L.pin.length} de 4 xifres">${dots}</div>
      <div class="pad-num">${keys}<button data-act="l-back" aria-label="Enrere">‹</button><button data-act="l-key" data-v="0">0</button><button data-act="l-del" aria-label="Esborra">⌫</button></div>
      <button class="linklike" data-act="l-first">${L.first ? 'Ja tinc PIN' : 'Primer cop? Tinc un codi d’invitació'}</button></div>`;
  }
  function authError(e) {
    const c = e?.code || '';
    if (c === 'bad-invite') return 'El codi d’invitació no és correcte.';
    if (c.includes('email-already-in-use')) return 'Aquest perfil ja té compte. Entra amb el teu PIN.';
    if (c.includes('too-many-requests')) return 'Massa intents. Espera uns minuts.';
    if (c.includes('network')) return 'No hi ha connexió. Torna-ho a provar.';
    return 'PIN incorrecte. Torna-ho a provar.';
  }
  async function submitPin() {
    const L = S.login; L.busy = true; L.error = ''; paint();
    try {
      if (L.first) {
        if (!L.code.trim()) { L.error = 'Escriu el codi d’invitació.'; L.pin = ''; return; }
        await store.claim(L.player, L.code, L.pin);
      } else await store.login(L.player, L.pin);
    } catch (e) { L.error = authError(e); L.pin = ''; } finally { L.busy = false; paint(); }
  }

  // ---------- Pintat ----------
  function paint() {
    if (!S.session) { morph(root, loginView()); return; }
    const j = J();
    const demo = store.mode === 'demo' ? `<div class="demo pad"><span>Prova amb dades d’exemple · Ets</span><select id="demo-user" data-change="demo-user" aria-label="Persona">${PLAYERS.map((p) => `<option value="${p.id}" ${sel(p.id, me())}>${esc(p.name)}</option>`).join('')}</select><button data-act="demo-reset">Reinicia</button></div>` : '';
    const save = S.saving ? '<span class="savepill">Desant</span>' : Object.keys(S.errors).length ? '<span class="savepill err">Error en desar</span>' : S.saved ? '<span class="savepill">Desat</span>' : '';
    const body = S.tab === 'dades' ? dataTab(j) : S.tab === 'admin' ? jornadesTab() : (j && (j.matches || []).length ? column(j) + grid(j) + results(j) : '');
    if (S.tab === 'admin' && !isAdmin()) S.tab = 'jornada';
    morph(root, `<div class="app">${demo}<header class="topbar"><div class="topbar-in pad"><div class="brand">Quiniela <span>Reales</span></div><div>${save}</div></div>
      <nav class="tabs" role="tablist"><button role="tab" data-act="tab" data-v="jornada" aria-selected="${S.tab === 'jornada'}">Jornada</button><button role="tab" data-act="tab" data-v="dades" aria-selected="${S.tab === 'dades'}">Dades</button>${isAdmin() ? `<button role="tab" data-act="tab" data-v="admin" aria-selected="${S.tab === 'admin'}">Jornades</button>` : ''}</nav></header>
      <main>${S.tab === 'jornada' ? ticket(j) : ''}${body}</main>
      <footer class="footer pad"><span>Hola, ${esc(PLAYERS.find((p) => p.id === me())?.name || '')}<br><small>Escuts: FootyLogos.com</small></span><button data-act="logout">Tanca la sessió</button></footer></div>
      ${S.copyText ? `<div class="toast" style="width:calc(100vw - 32px);max-width:560px;bottom:12px"><p style="margin-bottom:6px">No s’ha pogut copiar sol. Selecciona el text:</p><textarea class="copybox" id="copybox" readonly>${esc(S.copyText)}</textarea><button data-act="copy-close" style="text-decoration:underline;margin-top:5px;color:inherit">Tanca</button></div>` : ''}
      ${S.tab === 'admin' ? pickerSheet() : ''}
      ${S.toast ? `<div class="toast" role="status">${esc(S.toast)}</div>` : ''}`);
    document.body.classList.toggle('locked', Boolean(S.pick && S.tab === 'admin'));
  }
  function toast(text) {
    S.toast = text; clearTimeout(toastTimer); paint();
    toastTimer = setTimeout(() => { S.toast = ''; paint(); }, 2400);
  }
  async function copy(text, done) {
    try { await navigator.clipboard.writeText(text); toast(done); } catch { S.copyText = text; paint(); }
  }

  // ---------- Desar ----------
  function saveError(e) {
    if (e?.code === 'permission-denied') return { message: 'Jornada tancada: el canvi no s’ha desat.', retry: false };
    return { message: 'Error en desar.', retry: true };
  }
  const retries = {};
  async function persist(j, key, patch, run) {
    const id = j.id;
    S.overlay[id] = { ...(S.overlay[id] || {}), ...patch };
    delete S.errors[`${id}:${key}`]; S.saving += 1; S.saved = false; paint();
    retries[key] = () => persist(j, key, patch, run);
    try {
      await run();
      S.saved = true;
      // El servidor ja té el canvi: es deixa de fer servir la còpia local perquè manin les dades compartides.
      const o = S.overlay[id]; const live = S.picks[id]?.[me()] || {};
      if (o) for (const k of Object.keys(patch)) if (live[k] === o[k]) delete o[k];
    } catch (e) {
      S.errors[`${id}:${key}`] = saveError(e);
      if (e?.code === 'permission-denied') { const o = S.overlay[id]; if (o) for (const k of Object.keys(patch)) delete o[k]; }
    } finally { S.saving -= 1; paint(); }
  }
  function selectJornada(id, manual = true) {
    S.selectedId = id; if (manual) S.manual = true;
    S.compare = null; S.expanded = null; S.dataMatch = 1; S.ad.reason = '';
    if (id !== watchedId) {
      unwatchPicks?.(); watchedId = id;
      unwatchPicks = id ? store.watchPicks(id, (picks) => {
        S.picks[id] = picks;
        const o = S.overlay[id];
        const mine = picks[me()];
        if (o && mine && !S.saving) for (const k of Object.keys(o)) if (mine[k] === o[k]) delete o[k];
        paint();
      }) : null;
      unwatchPay?.();
      unwatchPay = id && store.watchPayments ? store.watchPayments(id, (pay) => { S.payments[id] = pay; paint(); }) : null;
    }
    paint();
  }
  function adminRun(fn, okText) {
    Promise.resolve().then(fn).then(() => toast(okText)).catch((e) => toast(e?.code === 'permission-denied' ? 'No tens permís per fer-ho.' : 'No s’ha pogut desar. Torna-ho a provar.'));
  }

  // ---------- Accions ----------
  const actions = {
    tab: (b) => { S.tab = b.dataset.v; paint(); window.scrollTo({ top: 0 }); },
    group: (b) => { S.group = b.dataset.v; const list = scoped(); if (list.length && !list.some((x) => x.id === S.selectedId)) selectJornada(list[list.length - 1].id); paint(); },
    step: (b) => { const list = scoped(); const i = list.findIndex((x) => x.id === S.selectedId); const n = list[i + Number(b.dataset.v)]; if (n) selectJornada(n.id); },
    goto: (b) => document.getElementById(b.dataset.v)?.scrollIntoView(),
    sign(b) {
      const j = J(); if (columnStatus(picksFor(j)[me()], j.matches).confirmed) return; const n = Number(b.dataset.n); const m = j.matches.find((x) => x.n === n);
      const mine = picksFor(j)[me()];
      const value = toggleSign(validSign(mine, m), b.dataset.v);
      const problem = checkSignChange(mine, j.matches, n, value);
      if (problem) { toast(problem); return; }
      const rev = m.rev || 0;
      persist(j, `s${n}`, { [`s${n}`]: value, [`r${n}`]: rev }, () => store.saveSign(j.id, me(), n, value, rev));
    },
    ple(b) {
      const j = J(); if (columnStatus(picksFor(j)[me()], j.matches).confirmed) return; const side = b.dataset.side; const f = side === 'h' ? 'pleH' : 'pleA';
      const m = j.matches.find((x) => x.n === 15); const rev = m.rev || 0;
      const value = picksFor(j)[me()]?.[f] === b.dataset.v ? '' : b.dataset.v;
      persist(j, `ple${side}`, { [f]: value, rP: rev }, () => store.savePle(j.id, me(), side, value, rev));
    },
    retry: (b) => retries[b.dataset.v]?.(),
    expand: (b) => { const n = Number(b.dataset.v); S.expanded = S.expanded === n ? null : n; paint(); },
    fitxa: (b) => { S.dataMatch = Number(b.dataset.v); S.tab = 'dades'; paint(); window.scrollTo({ top: 0 }); },
    onlyEqual: () => { S.onlyEqual = !S.onlyEqual; paint(); },
    onlyGap: () => { S.onlyGap = !S.onlyGap; paint(); },
    wide: () => { S.wide = !S.wide; paint(); },
    compare: (b) => { S.compare = S.compare === b.dataset.v ? null : b.dataset.v; paint(); },
    dmatch: (b) => { S.dataMatch = Number(b.dataset.v); paint(); },
    statscomp: (b) => { S.statsComp = b.dataset.v; paint(); },
    'wa-summary': () => { const j = J(); copy(whatsappSummary(j, picksFor(j)), 'Resum copiat. Ja el pots enganxar a WhatsApp.'); },
    'wa-matches': () => copy(whatsappMatches(J()), 'Partits copiats.'),
    csv() {
      const j = J(); const text = gridCsv(j, picksFor(j));
      if (opts.preview) { copy(text, 'CSV copiat. A la versió publicada es descarrega com a fitxer.'); return; }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([`﻿${text}`], { type: 'text/csv;charset=utf-8' }));
      a.download = `quiniela-reales-${(j.quinielaNum || j.id)}.csv`; a.click(); URL.revokeObjectURL(a.href); toast('CSV descarregat.');
    },
    logout: () => store.logout(),
    'copy-close': () => { S.copyText = ''; paint(); },
    'demo-reset': () => { store.resetDemo(); S.overlay = {}; S.errors = {}; toast('Dades d’exemple reiniciades.'); },
    'l-name': (b) => { Object.assign(S.login, { step: 'pin', player: b.dataset.v, pin: '', error: '' }); paint(); },
    'l-key': (b) => { const L = S.login; if (L.pin.length >= 4 || L.busy) return; L.pin += b.dataset.v; paint(); if (L.pin.length === 4) submitPin(); },
    'l-del': () => { S.login.pin = S.login.pin.slice(0, -1); paint(); },
    'l-back': () => { Object.assign(S.login, { step: 'name', pin: '', error: '', first: false }); paint(); },
    'l-first': () => { S.login.first = !S.login.first; S.login.error = ''; S.login.pin = ''; paint(); },
    'ad-active': () => { const j = J(); adminRun(() => store.setActive(j.id), `${jornadaTitle(j)} ja és la jornada activa.`); },
    'ad-state': (b) => { const j = J(); adminRun(() => store.setState(j.id, b.dataset.v), `Estat: ${STATE_LABEL[b.dataset.v]}.`); },
    'ad-reopen': () => {
      const j = J(); const reason = S.ad.reason.trim();
      if (!reason) { toast('Escriu el motiu de la reobertura.'); return; }
      const deadline = S.ed?.deadline ? fromLocalInput(S.ed.deadline) : j.deadline;
      if (deadline <= Date.now()) { toast('Tria una hora límit futura.'); return; }
      adminRun(() => store.setState(j.id, 'open', { reason, deadline }), 'Jornada reoberta.');
      S.ad.reason = '';
    },
    'ed-open': (b) => { const n = Number(b.dataset.v); if (S.ed?.num === n) { S.ed = null; paint(); } else openEditor(n); },
    'ed-other': () => { const n = Number(S.ad.otherNum); if (n > 0) { S.ad.otherNum = ''; openEditor(n); } else toast('Escriu un número de jornada.'); },
    'ok-ask': () => { S.okAsk = J().id; paint(); },
    'ok-no': () => { S.okAsk = null; paint(); },
    'ok-yes': () => {
      const j = J(); S.okAsk = null;
      if (!columnStatus(picksFor(j)[me()], j.matches).complete) { toast('Encara falten signes.'); return; }
      persist(j, 'ok', { ok: true }, () => store.confirm(j.id, me()));
      toast('OK donat. Ja pots fer el pagament.');
    },
    'ad-unlock': (b) => { const j = J(); const p = PLAYERS.find((x) => x.id === b.dataset.v); adminRun(() => store.unlock(j.id, p.id), `Columna de ${p.name} desbloquejada.`); },
    'ad-paid': (b) => { const j = J(); const v = !(S.payments[j.id] || {})[b.dataset.v]; adminRun(() => store.setPaid(j.id, b.dataset.v, v), v ? 'Marcat com a pagat.' : 'Pagament desmarcat.'); },
    'pick-open': (b) => { S.pick = { n: Number(b.dataset.n), side: b.dataset.side, q: '' }; paint(); },
    'pick-close': () => { S.pick = null; paint(); },
    'pick-group': (b) => { S.pickGroup = b.dataset.v; S.pick.q = ''; paint(); },
    'pick-team': (b) => { const t = TEAMS.find((x) => x.id === b.dataset.v); pickSet(t.name); },
    'pick-free': () => pickSet(S.pick.q.trim()),
    'pick-clear': () => { S.ed.rows.find((r) => r.n === S.pick.n)[S.pick.side] = ''; S.ed.confirm = false; paint(); },
    'ed-cat': (b) => { S.ed.category = b.dataset.v; paint(); },
    'ed-publish': () => {
      const e = S.ed; const j = e.id ? S.jornades.find((x) => x.id === e.id) : null; const c = checkLoad(j);
      if (blocker(e, j, c)) return;
      const published = j && j.state !== 'draft';
      const toNum = (v) => (v === '' || v == null ? null : Number(v));
      const row = { ...(j || { id: `${S.season}-j${e.num}`, season: S.season, results: {}, pleResult: {}, showHits: false, reopenLog: [] }),
        quinielaNum: e.num, category: e.category, deadline: fromLocalInput(e.deadline), matches: c.merged, source: 'Càrrega manual',
        primeraNum: toNum(e.primeraNum), segundaNum: toNum(e.segundaNum), europeanPhase: e.europeanPhase.trim(), name: e.name.trim(), provisional: Boolean(e.provisional), state: published ? j.state : 'open' };
      S.ed = null;
      adminRun(async () => { await store.saveJornada(row); if (!published) { await store.setActive(row.id); selectJornada(row.id); } }, published ? 'Canvis desats.' : `Jornada ${row.quinielaNum} publicada. Ja és l’activa.`);
    },
    'ad-res': (b) => { const n = b.dataset.n; if (S.ad.results[n] === b.dataset.v) delete S.ad.results[n]; else S.ad.results[n] = b.dataset.v; paint(); },
    'ad-ple': (b) => { const s = b.dataset.side; if (S.ad.ple[s] === b.dataset.v) delete S.ad.ple[s]; else S.ad.ple[s] = b.dataset.v; paint(); },
    'ad-results': () => { const j = J(); const a = S.ad; adminRun(() => store.saveResults(j.id, { ...a.results }, { ...a.ple }, a.note, a.show), 'Resultats desats.'); },
    'ad-pin': (b) => { const p = PLAYERS.find((x) => x.id === b.dataset.v); adminRun(() => store.resetPin(p.id), `${p.name} ja pot tornar a entrar amb el seu codi.`); },
  };

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b && !b.disabled) actions[b.dataset.act]?.(b);
  });
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.change === 'jornada') selectJornada(t.value);
    if (t.dataset.change === 'season') { S.season = t.value; const l = scoped(); selectJornada(l.at(-1)?.id || null); }
    if (t.dataset.change === 'demo-user') store.login(t.value);
    if (t.dataset.input === 'show') S.ad.show = t.checked;
    if (t.dataset.ed && S.ed) {
      S.ed[t.dataset.ed] = t.type === 'checkbox' ? t.checked : t.value;
      if (t.dataset.ed === 'text') parseEditor(); else paint();
    }
    if (t.dataset.edit) { S.ed.confirm = false; paint(); }
  });
  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.input === 'code') S.login.code = t.value;
    else if (t.dataset.input === 'pickQ' && S.pick) { S.pick.q = t.value; paint(); }
    else if (['reason', 'note', 'otherNum'].includes(t.dataset.input)) S.ad[t.dataset.input] = t.value;
    if (t.dataset.ed && S.ed && t.type !== 'checkbox') S.ed[t.dataset.ed] = t.value;
    if (t.dataset.edit) { const row = S.ed.rows.find((r) => r.n === Number(t.dataset.n)); row[t.dataset.edit] = t.value; }
  });
  // En enganxar, els partits apareixen de seguida sense haver de sortir del camp.
  root.addEventListener('paste', (e) => {
    if (e.target.dataset.ed !== 'text') return;
    setTimeout(() => { S.ed.text = e.target.value; parseEditor(); }, 0);
  });
  setInterval(() => { if (S.session) paint(); }, 30000);

  // ---------- Connexions ----------
  let unwatch = [];
  store.onSession((session) => {
    S.session = session;
    unwatch.forEach((u) => u()); unwatch = [];
    if (!session) { unwatchPicks?.(); unwatchPicks = null; watchedId = null; S.selectedId = null; S.manual = false; Object.assign(S.login, { step: 'name', pin: '', error: '', first: false }); paint(); return; }
    unwatch.push(store.watchApp((app) => {
      S.app = app;
      if (app.activeId && (!S.manual || !S.selectedId)) { const j = S.jornades.find((x) => x.id === app.activeId); if (j) { S.season = j.season; selectJornada(app.activeId, false); } }
      paint();
    }));
    unwatch.push(store.watchJornades((list) => {
      S.jornades = list;
      if (!S.season) S.season = list.find((j) => j.id === S.app.activeId)?.season || opts.season || '2026-27';
      if (!S.selectedId || !list.some((j) => j.id === S.selectedId)) {
        const target = list.find((j) => j.id === S.app.activeId) || sorted().filter(inScope).at(-1);
        if (target) { S.season = target.season; selectJornada(target.id, false); }
      }
      paint();
    }));
    paint();
  });
  if (!opts.stats && opts.statsUrl) {
    fetch(opts.statsUrl).then((r) => r.json()).then((d) => { S.stats = d; S.statsState = 'ok'; paint(); }).catch(() => { S.statsState = 'error'; paint(); });
  } else if (!opts.stats) S.statsState = 'error';
  paint();
}
