// Verlauf: bei jedem Auslesen ein paar Kennzahlen im Browser merken (localStorage),
// damit sich Kilometer, Akku-Gesundheit, Ladezyklen usw. über die Zeit zeigen lassen.
// Alte Backups und Daten-Exporte lassen sich nachträglich übernehmen.

const STORE_KEY = 'selfbike-history';
const FORMAT = 'selfbike-history/1';
const MAX = 2000;

// Kennzahl → Datenpunkt (Werte wie in datapoints.js dekodiert)
export const METRICS = [
  { id: 'km', key: 'odometer', unit: 'km', digits: 0, fromValue: (v) => v / 1000 },
  { id: 'soh', key: 'batterySoh', unit: '%', digits: 0 },
  { id: 'cycles', key: 'batteryCycles', unit: '', digits: 1 },
  { id: 'kwh', key: 'batteryEnergy', unit: 'kWh', digits: 1, fromValue: (v) => v / 1000 },
  { id: 'motorH', key: 'motorHours', unit: 'h', digits: 0 },
  { id: 'onH', key: 'powerOnHours', unit: 'h', digits: 0 },
];

export function loadHistory() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; }
}
function save(list) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(-MAX))); return true; } catch { return false; }
}

// Zeilen (aus readAll, Backup oder Daten-Export) → Messpunkt
export function snapshotFromRows(rows, at) {
  const get = (key) => {
    const r = rows.find((x) => x.key === key);
    return r?.status === 'ok' && typeof r.value === 'number' ? r.value : null;
  };
  const snap = { at: new Date(at).toISOString(), bike: rows.find((r) => r.key === 'motorBikeId')?.value || null };
  for (const m of METRICS) {
    const v = get(m.key);
    if (v != null) snap[m.id] = m.fromValue ? m.fromValue(v) : v;
  }
  return snap.km != null || snap.kwh != null ? snap : null;
}

// Neuen Messpunkt einfügen; gleicher Tag + gleicher Kilometerstand ersetzt den alten
export function addSnapshot(snap, list = loadHistory()) {
  if (!snap) return list;
  const day = snap.at.slice(0, 10);
  const next = list.filter((s) => !(s.bike === snap.bike && s.at.slice(0, 10) === day && s.km === snap.km));
  next.push(snap);
  next.sort((a, b) => a.at.localeCompare(b.at));
  save(next);
  return next;
}

export function historyFor(bike, list = loadHistory()) {
  return bike ? list.filter((s) => s.bike === bike) : list;
}

// Verbrauch je Abschnitt zwischen zwei Messpunkten (Wh/km), nur bei mind. 5 km gefahrener Strecke
export function consumption(list) {
  const out = [];
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1], b = list[i];
    const dKm = b.km - a.km, dKwh = b.kwh - a.kwh;
    if (dKm >= 5 && dKwh >= 0) out.push({ at: b.at, whkm: (dKwh * 1000) / dKm });
  }
  return out;
}

export function clearHistory(bike) {
  save(bike ? loadHistory().filter((s) => s.bike !== bike) : []);
}

export function exportHistory() {
  return { format: FORMAT, createdAt: new Date().toISOString(), entries: loadHistory() };
}

// Datei übernehmen: Verlauf-Export, SelfBike-Backup oder Daten-Export. Gibt Anzahl neuer Punkte zurück.
export function importIntoHistory(text) {
  const data = JSON.parse(text);
  let snaps = [];
  if (data?.format === FORMAT && Array.isArray(data.entries)) snaps = data.entries.filter((s) => s?.at);
  else if (Array.isArray(data?.rows) && data.rows.some((r) => r.key) && data.createdAt) {
    snaps = [snapshotFromRows(data.rows, data.createdAt)].filter(Boolean);
  } else throw new Error('unknown-file');
  let list = loadHistory();
  const before = list.length;
  for (const s of snaps) list = addSnapshot(s, list);
  return list.length - before;
}
