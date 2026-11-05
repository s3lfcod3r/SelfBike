// Fehlerspeicher – reine Lese-Abfragen (RPC), die bike-reader.js einzeln freigibt.
// Fehler löschen ist nicht möglich.

import { RPC, pbFields } from './messagebus.js';

export const FAULT_SOURCES = [
  { component: 'Motor', address: 4226 },
  { component: 'Akku', address: 169 },
  { component: 'Bedieneinheit', address: 8485 },
  { component: 'Display', address: 3092 },
  { component: 'ABS', address: 2337 },
];

const RETURN = { 0: 'OK', 1: 'kein weiterer Eintrag', 2: 'unbekannter Fehler', 3: 'Fehlschlag', 4: 'ungültige Anzahl', 5: 'kein Zugriff', 6: 'unbekannter Befehl' };
const fieldMap = (bytes) => Object.fromEntries(pbFields(bytes).map((f) => [f.field, f.value]));
const unzigzag = (n) => (n % 2 === 0 ? n / 2 : -(n + 1) / 2);

// Antwort des Fehlerspeichers: F1 Eintrag {F2 Zeitpunkt {F1 sint64}, F3 Häufigkeit},
// F2 Echo der Anfrage {F2 Fehlerkennung {F1 uint}}, F3 Rückgabewert, F4 Anzahl Einträge
export function decodeFaultReply(payload) {
  const f = fieldMap(payload);
  const out = { returnValue: f[3] ?? 0, entryCount: f[4] ?? 0, code: null, timestamp: null, count: null };
  if (f[1] instanceof Uint8Array) {
    const frame = fieldMap(f[1]);
    if (frame[2] instanceof Uint8Array) out.timestamp = unzigzag(fieldMap(frame[2])[1] ?? 0);
    out.count = frame[3] ?? null;
  }
  if (f[2] instanceof Uint8Array) {
    const params = fieldMap(f[2]);
    if (params[2] instanceof Uint8Array) out.code = fieldMap(params[2])[1] ?? 0;
  }
  return out;
}

// Liefert pro Komponente { component, status: 'ok'|'none'|'unavailable', faults: [...], reason }
export async function readFaults(reader, onProgress = () => {}) {
  const results = [];
  for (const src of FAULT_SOURCES) {
    onProgress(`Fehlerspeicher ${src.component}`);
    const out = { ...src, status: 'unavailable', faults: [], reason: null };
    results.push(out);
    try {
      const r = await reader.request(src.address, RPC, [0x08, 4]);
      if (r.status !== 0) {
        out.status = r.status === 2 ? 'none' : 'unavailable'; // 2 = Komponente nicht vorhanden
        out.reason = r.status === 2 ? 'nicht verbaut' : r.statusName;
        continue;
      }
      const head = decodeFaultReply(r.payload);
      if (head.returnValue !== 0) {
        out.reason = RETURN[head.returnValue] ?? `Rückgabe ${head.returnValue}`;
        continue;
      }
      // Zählweise nicht eindeutig (ab 0 oder ab 1) →
      // Einträge 0 … Anzahl lesen und Doppelte (gleicher Code + Zeitpunkt) verwerfen.
      for (let i = 0; i <= Math.min(head.entryCount, 62); i++) {
        const e = await reader.request(src.address, RPC, i ? [0x08, 5, 0x18, i] : [0x08, 5]);
        if (e.status !== 0) break;
        const d = decodeFaultReply(e.payload);
        if (d.returnValue === 1) { if (i === 0) continue; break; } // Ende der Liste
        const dup = out.faults.some((f) => f.code === d.code && f.timestamp === d.timestamp);
        if (d.returnValue === 0 && d.code != null && !dup) out.faults.push({ code: d.code, timestamp: d.timestamp, count: d.count });
      }
      out.status = 'ok';
    } catch (e) {
      out.reason = e.message;
    }
  }
  return results;
}
