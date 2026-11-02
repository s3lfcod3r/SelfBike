// Klartexte zu Fehlercodes – nur wenn auf dem eigenen Server eine Datei liegt (data/private, nicht im Repository).
// Die Texte gehören Bosch: SelfBike liefert sie nicht mit. Ohne Datei zeigt SelfBike die eigene Einordnung
// aus fault-categories.js.
// Format der Datei: { <sprache>: { tier, issues: { "1B7210": { s, t, d, m } } } }

// Auf dem eigenen Server abgelegte Fassung (einmalig aus der eigenen Flow-App erzeugt, nicht weitergeben)
const SERVER_FILE = 'data/private/issues-catalog.json';

let memory = null; // { [lang]: { tier, issues } }

export async function loadCatalog() {
  memory = null;
  // ?texte=eigene: Server-Katalog ignorieren und die eigenen Texte zeigen (wie für alle anderen Nutzer)
  if (new URLSearchParams(location.search).get('texte') === 'eigene') return memory;
  try {
    const res = await fetch(SERVER_FILE, { cache: 'no-cache' });
    if (res.ok) memory = await res.json();
  } catch { /* keine Datei auf dem Server */ }
  return memory;
}

// Eintrag zu einem Code in der gewünschten Sprache (sonst Englisch, Deutsch, irgendeine)
export function lookupIssue(code, lang) {
  if (!memory) return null;
  const key = code.toString(16).toUpperCase();
  for (const l of [lang, 'en', 'de', ...Object.keys(memory)]) {
    const e = memory[l]?.issues?.[key];
    if (e) return e;
  }
  return null;
}
