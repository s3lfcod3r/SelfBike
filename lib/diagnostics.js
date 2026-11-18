// Fehlerspeicher – reine Lese-Abfragen (RPC), die bike-reader.js einzeln freigibt.
// Fehler löschen ist nicht möglich.

import { RPC, pbFields } from './messagebus.js';

// Adressen = Diagnose-/Issue-Endpunkte je Komponente (NICHT die Daten-DIDs).
// Verifiziert gegen den BES3-Reader (rweijnen/bosch-bes3-reader) an echten Rädern:
// dessen Fehler-Reads laufen auf diese Adressen. Frühere Werte waren je 3 zu niedrig
// (0x1082/0xA9/0x2125/0xC14/0x921) → SelfBike fragte ins Leere und meldete „grün",
// obwohl Fehler gespeichert waren. Nicht ohne echten Gegenbeweis zurückdrehen.
export const FAULT_SOURCES = [
  { component: 'Motor', address: 0x1085 },        // DriveUnit  (4229)
  { component: 'Akku', address: 0x00ac },         // Battery    (172)
  { component: 'Bedieneinheit', address: 0x2128 },// RemoteControl (8488)
  { component: 'Display', address: 0x0c17 },      // HeadUnit   (3095)
  { component: 'ABS', address: 0x0924 },          // AntiLockBrakeSystem (2340)
  { component: 'Connect-Modul', address: 0x0a17 },// ConnectModule (2583)
  { component: 'Zweitakku', address: 0x02ac },    // Battery2   (684)
];

// Operation-Ebene: DiagnosticReturnValueEnum (verifiziert bdp-messagebus-1.2.3). 5 NO_ACCESS = Gate (keine Freigabe).
// NICHT verwechseln mit der Transport-Ebene ResponseMessageStatusCode (dort u. a. 3 NOT_READY, 6 DENIED).
const RETURN = { 0: 'OK', 1: 'kein weiterer Eintrag', 2: 'unbekannte Meldung', 3: 'Fehlschlag', 4: 'ungültige Anzahl', 5: 'kein Zugriff' };
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

// Liest EINE Komponente: { component, address, status: 'ok'|'none'|'unavailable', faults: [...], reason }.
// Nutzt GET_ISSUE_COUNT (4) + READ_ISSUE_BY_NUMBER (5). Auch einzeln aufrufbar (z. B. Rücklesen im blockierten Zustand).
export async function readFaultSource(reader, src) {
  const out = { ...src, status: 'unavailable', faults: [], reason: null };
  try {
    const r = await reader.request(src.address, RPC, [0x08, 4]);
    if (r.status !== 0) {
      out.status = r.status === 2 ? 'none' : 'unavailable'; // 2 = Komponente nicht vorhanden
      out.reason = r.status === 2 ? 'nicht verbaut' : r.statusName;
      return out;
    }
    const head = decodeFaultReply(r.payload);
    if (head.returnValue !== 0) {
      out.reason = RETURN[head.returnValue] ?? `Rückgabe ${head.returnValue}`;
      return out;
    }
    // Einträge der Reihe nach lesen, bis das Steuergerät „gibt es nicht" (DOES_NOT_EXIST=1) meldet.
    // NICHT bei entryCount aufhören: manche Räder melden entryCount gar nicht (0), haben aber Einträge –
    // dann würden echte Fehler übersehen (Rad meldet „grün", obwohl welche gespeichert sind). CAP nur
    // als Sicherheitsgrenze. Zählweise ist nicht eindeutig (ab 0 oder ab 1), Doppelte werden verworfen.
    const CAP = 64;
    for (let i = 0; i <= CAP; i++) {
      const e = await reader.request(src.address, RPC, i ? [0x08, 5, 0x18, i] : [0x08, 5]);
      if (e.status !== 0) break;
      const d = decodeFaultReply(e.payload);
      if (d.returnValue === 1) { if (i === 0) continue; break; } // Eintrag 0 kann leer sein (1-basiert), sonst Listenende
      const dup = out.faults.some((f) => f.code === d.code && f.timestamp === d.timestamp);
      if (d.returnValue === 0 && d.code != null && !dup) out.faults.push({ code: d.code, timestamp: d.timestamp, count: d.count });
    }
    out.status = 'ok';
  } catch (e) {
    out.reason = e.message;
  }
  return out;
}

// Liefert alle Komponenten.
export async function readFaults(reader, onProgress = () => {}) {
  const results = [];
  for (const src of FAULT_SOURCES) {
    onProgress(`Fehlerspeicher ${src.component}`);
    results.push(await readFaultSource(reader, src));
  }
  return results;
}
