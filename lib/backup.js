// Backups vor jeder Änderung: vollständiger Lesestand als JSON-Datei,
// zusätzlich eine Kopie im Browser-Speicher (letzte 20).

import { t } from './i18n.js';

const STORE_KEY = 'ebike-backups';
const FORMAT = 'ebike-backup/1';

// modes: Fahrmodus-Parameter zum Zeitpunkt des Backups (für Wiederherstellen)
export function createBackup(rows, change, modes = []) {
  const at = new Date();
  return {
    format: FORMAT,
    createdAt: at.toISOString(),
    bikeId: rows.find((r) => r.key === 'motorBikeId')?.value ?? null,
    plannedChange: change, // { title, steps: [{ key, before, after }] }
    modes: modes.map(({ id, name, udam, limits, defaults }) => ({ id, name, udam, limits, defaults })),
    rows: rows.map((r) => ({
      address: r.address, key: r.key, label: r.label, status: r.status,
      value: r.value, text: r.text, raw: r.rawHex,
    })),
  };
}

export function backupFileName(backup) {
  // Ortszeit im Dateinamen (createdAt selbst bleibt UTC)
  const d = new Date(backup.createdAt);
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  return `ebike-backup-${stamp}.json`;
}

// Öffnet den Speichern-Dialog. Muss direkt im Klick passieren (Browser verlangt Nutzeraktion);
// geschrieben wird später mit writeBackupFile. Gibt null zurück, wenn der Dialog nicht verfügbar ist.
export async function pickBackupFile(suggestedName) {
  if (!window.showSaveFilePicker) return null;
  return window.showSaveFilePicker({
    suggestedName,
    types: [{ description: 'E-Bike-Backup', accept: { 'application/json': ['.json'] } }],
  });
}

// Schreibt das Backup in die gewählte Datei (oder als Download) und in den Browser-Speicher.
export async function writeBackupFile(backup, handle) {
  const json = JSON.stringify(backup, null, 2);
  remember(backup);
  if (handle) {
    const w = await handle.createWritable();
    await w.write(json);
    await w.close();
    // Zur Sicherheit zurücklesen
    const check = await (await handle.getFile()).text();
    if (check !== json) throw new Error('Backup-Datei wurde nicht vollständig geschrieben');
    return { method: 'file', name: handle.name };
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = backupFileName(backup);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  return { method: 'download', name: a.download };
}

export function parseBackup(text) {
  const b = JSON.parse(text);
  if (b?.format !== FORMAT || !Array.isArray(b.rows)) throw new Error(t('err.backupFile'));
  return b;
}

export function storedBackups() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || []; } catch { return []; }
}

// Ergebnis (nachher-Stand) an das zuletzt gespeicherte Backup hängen
export function recordOutcome(createdAt, outcome) {
  const list = storedBackups();
  const entry = list.find((b) => b.createdAt === createdAt);
  if (!entry) return;
  entry.outcome = outcome;
  save(list);
}

function remember(backup) {
  save([backup, ...storedBackups().filter((b) => b.createdAt !== backup.createdAt)].slice(0, 20));
}

function save(list) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(list)); } catch { /* Speicher voll/gesperrt */ }
}
