// Zwei Stände vergleichen: SelfBike-Backup, Daten-Export oder „Alle Werte“-Export.
// Verglichen wird der angezeigte Text, bei Rohwerten die Bytes.

export function parseSnapshotFile(text, fileName = '') {
  const data = JSON.parse(text);
  if (!Array.isArray(data?.rows)) throw new Error('unknown-file');
  const kind = data.format?.startsWith('ebike-backup') ? 'backup' : data.rows.some((r) => r.key) ? 'export' : 'scan';
  const values = new Map();
  for (const r of data.rows) {
    const id = r.key || (r.component && r.name ? `${r.component}.${r.name}` : null) || String(r.address);
    const shown = r.status === 'ok' ? (r.text !== '' && r.text != null ? String(r.text) : r.raw ?? r.rawHex ?? '') : null;
    values.set(id, { id, address: r.address, label: r.label || r.name || id, key: r.key, value: shown, status: r.status });
  }
  return { kind, createdAt: data.createdAt || null, fileName, values };
}

// Liefert alle Zeilen; changed = Wert unterschiedlich (auch neu/weg)
export function compareSnapshots(a, b) {
  const ids = [...new Set([...a.values.keys(), ...b.values.keys()])];
  return ids.map((id) => {
    const x = a.values.get(id), y = b.values.get(id);
    const before = x?.value ?? null, after = y?.value ?? null;
    return { id, key: x?.key || y?.key, label: (y || x).label, address: (y || x).address, before, after, changed: before !== after };
  }).sort((p, q) => Number(q.changed) - Number(p.changed) || (p.address ?? 0) - (q.address ?? 0));
}
