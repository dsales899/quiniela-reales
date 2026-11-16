// Quins avisos toca enviar ara. Lògica pura, sense Firebase, per poder-la provar (test/notify.test.mjs).

export const HOUR = 3600000;
export const REMINDER_BEFORE = 2 * HOUR;

export function jornadaLabel(j) {
  if (j.quinielaNum) return String(j.quinielaNum);
  return j.name || '';
}

export const TEXTS = {
  open: (j) => `Ei petardet🧨, la jornada ${jornadaLabel(j)} ja és activa, ompli-la ara!`,
  reminder: (j) => `Ei petardet🧨, queden 2h per omplir la jornada ${jornadaLabel(j)} , aspavil!`,
};

/**
 * j: jornada activa ({ id, state, deadline (ms), quinielaNum, matches })
 * sent: el que ja s'ha enviat d'aquesta jornada ({ open: bool, reminderFor: ms del termini avisat })
 * Torna { send: ['open' | 'reminder'], mark: { ...canvis a desar } }.
 */
export function decide(j, sent = {}, now = Date.now()) {
  const out = { send: [], mark: {} };
  if (!j || j.state !== 'open' || !(j.matches || []).length || !j.deadline || now >= j.deadline) return out;
  const reminderDue = j.deadline - now <= REMINDER_BEFORE && sent.reminderFor !== j.deadline;
  if (!sent.open) {
    out.mark.open = true;
    // Si s'ha publicat amb menys de 2 h de marge, n'hi ha prou amb el recordatori.
    if (!reminderDue) out.send.push('open');
  }
  if (reminderDue) {
    out.send.push('reminder');
    out.mark.reminderFor = j.deadline;
  }
  return out;
}

/** El recordatori només va a qui encara no ha donat l'OK. L'avís de jornada nova, a tothom. */
export function recipients(kind, players, picks = {}) {
  if (kind === 'reminder') return players.filter((p) => !picks[p]?.ok);
  return players;
}
