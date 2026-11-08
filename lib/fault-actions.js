// Fehlerspeicher löschen – EIGENER, enger Pfad NEBEN WRITE_RULES. Kein freies Methodenrufen.
//
// VERIFIZIERT per Dekompilat (siehe QUELLE). Befehl: EXECUTE_INFORMATION_MANAGER_COMMAND.
// Nutzlast = { F1 command (DiagnosticCommandEnum), F2 issueId, F3 entryNumber }.
//
// DiagnosticCommandEnum (deklarierte protobuf-Werte):
//   BLOCK_REPORTING=0, UNBLOCK_REPORTING=1, DELETE_ALL_ISSUES=2, DELETE_ISSUE=3,
//   GET_ISSUE_COUNT=4, READ_ISSUE_BY_NUMBER=5, READ_ISSUE_BY_KEY=6.
// Beleg der Feldstruktur: GET_ISSUE_COUNT=4 und READ_ISSUE_BY_NUMBER=5 sind exakt die Payloads [08,4]/[08,5],
// die SelfBike heute schon zum Lesen nutzt → Feld 1 = command.
//
// Adresse: der Befehl läuft auf dem IBD-Kanal = genau die Adresse, an der SelfBike schon liest
//   (Akku 169, Motor 4226, Display 3092, Bedieneinheit 8485 = EXECUTE_INFORMATION_MANAGER_COMMAND_IBD).
//   Der Clear geht an diese Adresse (Befehlskanal), command 2 – unabhängig von reinen Lese-Adressen.
//
// Sequenz je ECU: BLOCK_REPORTING (0) → DELETE_ALL_ISSUES (2) → UNBLOCK_REPORTING (1).
//   Sonst füllt sich der Speicher während des Löschens durch aktive Meldungen sofort nach.
//
// Statuscodes (ResponseMessageStatusCode): 0 SUCCESS, 1 OVERLOADED, 2 NO_ROUTE_FOUND, 3 NOT_READY,
//   4 UNSUPPORTED, 5 UNAVAILABLE, 6 DENIED, 7 INVALID_VALUE, 8 MALFORMED, 9 TIMEOUT.
//
// QUELLE/VERSION: dekompiliert aus Bosch DiagnosticTool, bdp-messagebus-1.2.3.jar (BES3), JDK-javap, 08.11.2026.
//   Hinweis: Jar-Version 1.2.3 ≠ Rad-Firmware (z. B. 17.9.3); die Protokollebene (MessageBus / DiagnosticCommandEnum)
//   ist gleich, die Enum-Werte sind generierte protobuf-Werte.

import { RPC, encodeVarint } from './messagebus.js';

export const SOURCE = 'Bosch DiagnosticTool bdp-messagebus-1.2.3 (BES3), dekompiliert 08.11.2026';

// DiagnosticCommandEnum
export const CMD = {
  BLOCK_REPORTING: 0, UNBLOCK_REPORTING: 1, DELETE_ALL_ISSUES: 2, DELETE_ISSUE: 3,
  GET_ISSUE_COUNT: 4, READ_ISSUE_BY_NUMBER: 5, READ_ISSUE_BY_KEY: 6,
};
// Löschsequenz je ECU: Melden aus → alles löschen → Melden an
export const CLEAR_SEQUENCE = [CMD.BLOCK_REPORTING, CMD.DELETE_ALL_ISSUES, CMD.UNBLOCK_REPORTING];
const ALLOWED_CMDS = new Set(CLEAR_SEQUENCE); // nur diese Befehle lässt der Guard im Clear-Pfad durch

// Statuscode-Namen (für die Auswertung in der Oberfläche)
export const STATUS = {
  0: 'SUCCESS', 1: 'OVERLOADED', 2: 'NO_ROUTE_FOUND', 3: 'NOT_READY', 4: 'UNSUPPORTED',
  5: 'UNAVAILABLE', 6: 'DENIED', 7: 'INVALID_VALUE', 8: 'MALFORMED', 9: 'TIMEOUT',
};

// AM RAD VERIFIZIERT an Performance Line CX Gen5 (BDU3843, Protokoll 1.2.3): Befehl aus bdp-messagebus-1.2.3 (BES3)
// dekompiliert, Löschen per issueId, am echten Rad (08.11.2026) an Motor und Bedieneinheit tatsächlich gelöscht.
// Tool 1.2.3 verbindet sich mit Gen5 und führt IBD-Operationen ohne Zertifikat aus (Clear bewiesen).
// KONFIGURATION ist NICHT pauschal gegatet, sondern FLAG-GESTEUERT: wo das OEM-„änderbar“-Flag true meldet,
// funktioniert Schreiben nachweislich (am Rad belegt: Licht 6177/6178 geschrieben und als 2,0 W zurückgelesen,
// Gen5/BDU3843 über IBD ohne Zertifikat). Gesperrt sind EINZELNE Felder (hier High-Port 6194, Speed-Source 6208);
// die Fahrmodi bleiben generell schreibgeschützt. IBD (Clear/Lesen) und Konfiguration je nach Flag bewerten.
export const VERIFIED = true;
// Ziel-ECUs in bewusster Reihenfolge: Akku zuerst (real bestätigt, risikoärmste), Motor zuletzt.
// ECUs, die den IM-Kanal beantworten: Battery 169, DriveUnit 4226, HeadUnit 3092, RemoteControl 8485 und
// ABS 2337. ABS wurde am Rad belegt: 2337 antwortet auf GET_ISSUE_COUNT (Status „ok"/„keine Einträge", nicht
// „kein Empfänger") – der fehlende MessageBus-Eintrag in 1.2.3 ist eine Tool-Lücke, kein Gegenbeweis; die
// Parameterklasse ist generisch, Nutzlast [08 02] wie überall, mit Block und Unblock. ConnectModule bleibt
// ausgeschlossen (Adressklasse ohne IM-Kanal). Battery2/681 existiert in 1.2.3 nicht.
export const CLEAR_TARGETS = [
  { address: 169, label: 'Akku' },
  { address: 8485, label: 'Bedieneinheit' },
  { address: 3092, label: 'Display' },
  { address: 2337, label: 'ABS' },
  { address: 4226, label: 'Motor' },
];
// Welche ECU-Adressen den Löschbefehl überhaupt unterstützen (für die UI: Häkchen nur hier anbieten).
export const CLEARABLE = new Set(CLEAR_TARGETS.map((t) => t.address));
export function isClearable(address) { return CLEARABLE.has(address); }

// Laufzeit: Clear nur an diesen Adressen erlaubt. Leer = nichts erlaubt (Normalbetrieb der App).
const cfg = { addresses: new Set() };
export function enableClear(addresses = []) { cfg.addresses = new Set(addresses); }
export function disableClear() { cfg.addresses = new Set(); }
export function clearEnabled() { return [...cfg.addresses]; }

// Nutzlast eines einfachen Befehls: { F1 command } → [0x08, command]
export function clearPayload(command) { return [0x08, command]; }

// Nutzlast DELETE_ISSUE (einzelnen Fehler löschen): { F1 command=3, F2 issueId { F1 value=code } }.
// Verifiziert: issueId_ ist Typ IssueId, IssueId = { F1 value:int }. code = der Fehlercode, den SelfBike liest.
export function deleteIssuePayload(code) {
  const issueId = [0x08, ...encodeVarint(code)];           // IssueId { F1 value }
  return [0x08, CMD.DELETE_ISSUE, 0x12, issueId.length, ...issueId]; // { command=3, issueId }
}

// Guard: NUR RPC an eine freigegebene Adresse. Erlaubt (a) die Sequenz-Befehle 0/1/2 als [08, c] und
// (b) einen DELETE_ISSUE-Aufruf [08 03 12 <len> 08 <varint>]. Sonst alles zu.
export function isFaultClear(address, type, payload) {
  if (type !== RPC || !cfg.addresses.has(address)) return false;
  const p = Array.from(payload);
  if (p.length === 2 && p[0] === 0x08 && ALLOWED_CMDS.has(p[1])) return true;
  if (p[0] === 0x08 && p[1] === CMD.DELETE_ISSUE && p[2] === 0x12) {
    const len = p[3];
    return len >= 2 && p.length === 4 + len && p[4] === 0x08;
  }
  return false;
}
