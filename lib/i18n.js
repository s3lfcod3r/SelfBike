// Mehrsprachigkeit: ein Wörterbuch pro Sprache in lib/i18n/<code>.js, Deutsch ist die Quelle.
// t('schlüssel', { platzhalter }) liefert den Text; fehlt er in einer Sprache, gilt Deutsch.

import deBase from './i18n/de.js';
import deMore from './i18n/de.2.js';
import deMore3 from './i18n/de.3.js';
import deMore4 from './i18n/de.4.js';
import deMore5 from './i18n/de.5.js';
import deMore6 from './i18n/de.6.js';
import deMore7 from './i18n/de.7.js';
import deMore8 from './i18n/de.8.js';
import deMore9 from './i18n/de.9.js';

// Jede Sprache besteht aus Grundwortschatz (<code>.js) und Ergänzungen (<code>.2.js … <code>.9.js)
const de = { ...deBase, ...deMore, ...deMore3, ...deMore4, ...deMore5, ...deMore6, ...deMore7, ...deMore8, ...deMore9 };

export const LANGS = {
  de: 'Deutsch', en: 'English', fr: 'Français', it: 'Italiano', es: 'Español', pt: 'Português',
  nl: 'Nederlands', pl: 'Polski', cs: 'Čeština', da: 'Dansk', sv: 'Svenska', fi: 'Suomi',
};
const LOCALES = {
  de: 'de-DE', en: 'en-GB', fr: 'fr-FR', it: 'it-IT', es: 'es-ES', pt: 'pt-PT',
  nl: 'nl-NL', pl: 'pl-PL', cs: 'cs-CZ', da: 'da-DK', sv: 'sv-SE', fi: 'fi-FI',
};
const STORE_KEY = 'selfbike-lang';

let current = 'de';
let dict = de;

export const lang = () => current;
export const locale = () => LOCALES[current];

export function t(key, vars = {}) {
  const s = dict[key] ?? de[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
}

// Zahlen und Daten im Format der gewählten Sprache
export const fmtNum = (v, digits = 0) =>
  Number(v).toLocaleString(locale(), { maximumFractionDigits: digits, minimumFractionDigits: digits });
export const fmtDate = (ts) => new Date(ts * 1000).toLocaleDateString(locale(), { timeZone: 'UTC' });
export const fmtDateTime = (d, opts = { dateStyle: 'medium', timeStyle: 'short' }) => new Date(d).toLocaleString(locale(), opts);

export function detectLang() {
  try {
    const stored = localStorage.getItem(STORE_KEY);
    if (LANGS[stored]) return stored;
  } catch { /* kein Speicher */ }
  const nav = (navigator.language || 'de').slice(0, 2).toLowerCase();
  return LANGS[nav] ? nav : 'de';
}

export async function setLang(code) {
  if (!LANGS[code]) code = 'de';
  if (code === 'de') dict = de;
  else {
    const optional = (file) => import(file).catch(() => ({ default: {} }));
    const parts = await Promise.all([
      import(`./i18n/${code}.js`), optional(`./i18n/${code}.2.js`), optional(`./i18n/${code}.3.js`), optional(`./i18n/${code}.4.js`), optional(`./i18n/${code}.5.js`),
      optional(`./i18n/${code}.6.js`), optional(`./i18n/${code}.7.js`), optional(`./i18n/${code}.8.js`), optional(`./i18n/${code}.9.js`),
    ]);
    dict = Object.assign({}, ...parts.map((p) => p.default));
  }
  current = code;
  document.documentElement.lang = code;
  try { localStorage.setItem(STORE_KEY, code); } catch { /* egal */ }
  applyStatic();
}

// Feste Texte im HTML: data-i18n (Text), data-i18n-html (mit Auszeichnung), data-i18n-placeholder,
// data-i18n-title (Tooltip + Vorlesehilfe für Icon-Knöpfe ohne sichtbaren Text)
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of root.querySelectorAll('[data-i18n-title]')) { const s = t(el.dataset.i18nTitle); el.title = s; el.setAttribute('aria-label', s); }
}
