// Prova temporal: quins formats de l'API d'ESPN funcionen.
const B = 'https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1';
const urls = [
  `${B}/scoreboard`, `${B}/scoreboard?dates=20261108`, `${B}/scoreboard?dates=20261101-20261111`,
  `${B}/scoreboard?dates=20261101-20261111&limit=500`, `${B}/scoreboard?dates=20261101-20261111&limit=100`,
  `${B}/scoreboard?dates=2026`, `${B}/teams`, `${B}/teams/83/schedule`, `${B}/teams/83/schedule?season=2025`,
  `${B}/teams/83/schedule?season=2026&fixture=false`,
];
for (const u of urls) {
  try {
    const r = await fetch(u); const t = await r.text(); let info = '';
    try { const j = JSON.parse(t); info = `events=${j.events?.length ?? '-'} teams=${j.sports?.[0]?.leagues?.[0]?.teams?.length ?? '-'} keys=${Object.keys(j).slice(0, 6).join(',')}`;
      const ev = j.events?.[0]; if (ev) info += ` primer=${ev.date} ${ev.name || ''} completat=${ev.competitions?.[0]?.status?.type?.completed ?? ev.status?.type?.completed} score=${JSON.stringify(ev.competitions?.[0]?.competitors?.[0]?.score)}`;
      const tm = j.sports?.[0]?.leagues?.[0]?.teams?.[0]?.team; if (tm) info += ` equip=${tm.id}:${tm.displayName}`;
    } catch { info = t.slice(0, 120); }
    console.log(r.status, u.replace(B, ''), info);
  } catch (e) { console.log('ERR', u, e.message); }
}
