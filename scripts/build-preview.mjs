// Empaqueta l'app en un sol fitxer amb dades d'exemple per veure-la sense servidor.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const out = process.argv[2] || 'preview.html';
const src = (f) => readFileSync(`public/${f}`, 'utf8').replace(/^import[\s\S]*?from '.*?';\n/gm, '').replace(/^export /gm, '');
const crests = Object.fromEntries(readdirSync('public/crests').map((f) => [f.replace('.webp', ''), `data:image/webp;base64,${readFileSync(`public/crests/${f}`).toString('base64')}`]));
const stats = readFileSync('public/data/stats.json', 'utf8');
writeFileSync(out, `<title>Quiniela Reales</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@500;600;700;800&display=swap">
<style>${readFileSync('public/styles.css', 'utf8')}</style>
<div id="root"></div>
<script>
(() => {
const CRESTS = ${JSON.stringify(crests)};
${src('teams.js')}
${src('logic.js')}
${src('store-demo.js')}
${src('app.js')}
startApp(createDemoStore({ persist: false }), { preview: true, season: '2026-27', firstNumber: 19, stats: ${stats}, crestUrl: (t) => CRESTS[t.id] });
})();
</script>
`);
