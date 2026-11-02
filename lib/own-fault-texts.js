// Eigene Fehlertexte aus data/fault-texts.csv – selbst formuliert, keine Bosch-Texte.
// Spalten: code;lang;title;hint (Kopfzeile Pflicht). lang leer = gilt für alle Sprachen.
// Trennzeichen ; oder , (wie Excel speichert), Felder dürfen in "Anführungszeichen" stehen.

const FILE = 'data/fault-texts.csv';

let texts = new Map(); // code (HEX, 6-stellig) → { [lang|'*']: { t, h, s } }

// Spalte severity (optional): Kritisch/Fehler/Warnung/Info (oder englisch) → Schlüssel wie im Bosch-Katalog (sev.*)
const SEVERITY = {
  kritisch: 'CRITICAL_ERROR', critical: 'CRITICAL_ERROR', fehler: 'ERROR', error: 'ERROR',
  warnung: 'WARNING', warning: 'WARNING', info: 'INFO',
};

// Eine CSV-Zeile in Felder zerlegen ("" innerhalb von Anführungszeichen = ")
function splitLine(line, sep) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') quoted = false; else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseFaultCsv(text) {
  const map = new Map();
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
  if (!lines.length) return map;
  const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  const head = splitLine(lines[0], sep).map((h) => h.toLowerCase());
  const col = (name) => head.indexOf(name);
  const [ci, li, ti, hi, si] = ['code', 'lang', 'title', 'hint', 'severity'].map(col);
  if (ci < 0 || (ti < 0 && hi < 0)) return map;
  for (const line of lines.slice(1)) {
    const f = splitLine(line, sep);
    const code = (f[ci] || '').toUpperCase().replace(/^0X/, '');
    if (!/^[0-9A-F]{1,8}$/.test(code)) continue;
    const key = code.padStart(6, '0');
    const lang = (li >= 0 && f[li] ? f[li].toLowerCase() : '*');
    const entry = { t: ti >= 0 ? f[ti] || '' : '', h: hi >= 0 ? f[hi] || '' : '', s: SEVERITY[(si >= 0 ? f[si] : '').toLowerCase()] ?? null };
    if (!entry.t && !entry.h) continue;
    if (!map.has(key)) map.set(key, {});
    map.get(key)[lang] = entry;
  }
  return map;
}

export async function loadOwnTexts() {
  texts = new Map();
  try {
    const res = await fetch(FILE, { cache: 'no-cache' });
    if (res.ok) texts = parseFaultCsv(await res.text());
  } catch { /* keine Datei */ }
  return texts.size;
}

// Eigener Text zu einem Code: gewünschte Sprache, sonst „alle Sprachen“, sonst Deutsch
export function lookupOwn(code, lang) {
  const e = texts.get((code ?? 0).toString(16).toUpperCase().padStart(6, '0'));
  return e ? e[lang] ?? e['*'] ?? e.de ?? null : null;
}
