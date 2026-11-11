// Crea un codi d'invitació per a cada amic i genera firestore.rules. Executa-ho una sola vegada.
import { createHash, randomInt } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const PLAYERS = ['enric', 'denis', 'pere', 'dani', 'pova', 'hector', 'albert', 'boyer'];
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = () => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
const sha = (t) => createHash('sha256').update(t).digest('hex');

export function buildRules(codes) {
  const map = PLAYERS.map((p) => `'${p}': '${sha(codes[p])}'`).join(', ');
  return readFileSync('firestore.rules.template', 'utf8').replace('__INVITES__', `{${map}}`);
}
if (process.argv[1].endsWith('setup.mjs')) {
  if (existsSync('invitacions.txt') && !process.argv.includes('--force')) {
    console.log('Ja existeix invitacions.txt. Per regenerar els codis: npm run setup -- --force');
    process.exit(0);
  }
  const codes = Object.fromEntries(PLAYERS.map((p) => [p, code()]));
  writeFileSync('firestore.rules', buildRules(codes));
  writeFileSync('invitacions.txt', PLAYERS.map((p) => `${p}: ${codes[p]}`).join('\n') + '\n');
  console.log('Fet. Els codis són a invitacions.txt. Envia a cada amic el seu per privat.');
}
