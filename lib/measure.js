// Eigene Messungen: belegt am eigenen Rad, was ein Datenpunkt bzw. ein Fahrmodus-Feld bedeutet.
// Ablauf: Stand merken → in der Flow-App oder am Rad genau eine Sache ändern → neu auslesen →
// Unterschiede ansehen → mit Notiz eintragen. Das Protokoll liegt im Browser (localStorage
// „selfbike-measure“) und lässt sich als Datei sichern; daraus wird später source in
// lib/datapoints.js fest eingetragen. Es wird nie etwas ans Rad geschrieben.

import { READ_PLAN } from './datapoints.js';

const KEY = 'selfbike-measure';
const MARK_KEY = 'selfbike-measure-mark';

export const OPEN_POINTS = READ_PLAN.filter((p) => p.source === 'offen');
// Fahrmodus-Parameter (UdamParams): Protobuf-Felder 1–8, Bedeutung je Feld selbst belegen
export const UDAM_FIELD_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8];
export const udamKey = (n) => `udam.${n}`;
const ALL_KEYS = [...OPEN_POINTS.map((p) => p.key), ...UDAM_FIELD_NUMBERS.map(udamKey)];

const empty = () => ({ v: 1, entries: {} });

export function loadProtocol() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY));
    return p && typeof p.entries === 'object' && p.entries ? p : empty();
  } catch { return empty(); }
}
function save(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); return true; } catch { return false; }
}

// Eintrag nur mit Notiz – was wurde geändert bzw. womit verglichen?
export function addEntry(key, { note, before = null, after = null }) {
  if (!ALL_KEYS.includes(key)) throw new Error(`Unbekannter Wert: ${key}`);
  const p = loadProtocol();
  p.entries[key] = { at: new Date().toISOString(), note: String(note).trim().slice(0, 300), before, after };
  return save(p);
}
export function removeEntry(key) {
  const p = loadProtocol();
  delete p.entries[key];
  return save(p);
}

export function measureStatus(p = loadProtocol()) {
  const open = ALL_KEYS.filter((k) => !p.entries[k]);
  return { total: ALL_KEYS.length, done: ALL_KEYS.length - open.length, open };
}

// ---------- Stand merken und vergleichen ----------

// Rohwerte der offenen Datenpunkte und alle UDAM-Felder je Fahrmodus
export function snapshot(rows, modes) {
  const points = {};
  for (const p of OPEN_POINTS) {
    const r = rows.find((x) => x.key === p.key);
    points[p.key] = r ? { raw: r.rawHex ?? '', text: r.status === 'ok' ? r.text : r.status } : null;
  }
  const udam = {};
  for (const m of modes) if (m.udamFields) udam[m.id] = { name: m.name, fields: { ...m.udamFields } };
  return { at: new Date().toISOString(), points, udam };
}

export function saveMark(snap) {
  try { localStorage.setItem(MARK_KEY, JSON.stringify(snap)); } catch { /* bleibt nur im Speicher */ }
}
export function loadMark() {
  try { const m = JSON.parse(localStorage.getItem(MARK_KEY)); return m?.points ? m : null; } catch { return null; }
}

// Zeilen für die Tabelle: changed nur, wenn ein gemerkter Stand da ist
export function diffSnapshots(a, b) {
  const points = OPEN_POINTS.map((p) => {
    const x = a?.points?.[p.key] ?? null;
    const y = b?.points?.[p.key] ?? null;
    return { key: p.key, address: p.address, before: x, after: y, changed: !!a && (x?.raw ?? null) !== (y?.raw ?? null) };
  });
  const fields = [];
  for (const [id, m] of Object.entries(b?.udam ?? {})) {
    for (const n of UDAM_FIELD_NUMBERS) {
      const x = a?.udam?.[id]?.fields?.[n] ?? null;
      const y = m.fields[n] ?? null;
      fields.push({ key: udamKey(n), field: n, modeId: id, mode: m.name, before: x, after: y, changed: !!a && x !== y });
    }
  }
  return { points, fields };
}

// ---------- Datei ----------

export const exportProtocol = () => JSON.stringify({ format: 'selfbike-measure/1', exportedAt: new Date().toISOString(), ...loadProtocol() }, null, 2);

// Übernimmt nur bekannte Schlüssel; vorhandene Einträge werden von der Datei ersetzt
export function importProtocol(text) {
  const d = JSON.parse(text);
  if (d?.format !== 'selfbike-measure/1' || typeof d.entries !== 'object' || !d.entries) throw new Error('format');
  const p = loadProtocol();
  let n = 0;
  for (const [k, e] of Object.entries(d.entries)) {
    if (!ALL_KEYS.includes(k) || typeof e?.at !== 'string' || !String(e.note ?? '').trim()) continue;
    p.entries[k] = { at: e.at, note: String(e.note).trim().slice(0, 300), before: e.before ?? null, after: e.after ?? null };
    n++;
  }
  save(p);
  return n;
}
