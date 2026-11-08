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

import { RPC } from './messagebus.js';

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

// Verifiziert per Dekompilat UND am echten Rad bestätigt (08.11.2026: Akku-Clear akzeptiert + Speicher leer).
export const VERIFIED = true;
// Ziel-ECUs in bewusster Reihenfolge: Akku zuerst (real bestätigt, risikoärmste), Motor zuletzt.
// Adressen = EXECUTE_INFORMATION_MANAGER_COMMAND_IBD / der Kanal, an dem SelfBike bereits liest.
export const CLEAR_TARGETS = [
  { address: 169, label: 'Akku' },
  { address: 8485, label: 'Bedieneinheit' },
  { address: 3092, label: 'Display' },
  { address: 2337, label: 'ABS' },
  { address: 4226, label: 'Motor' },
];

// Laufzeit: Clear nur an diesen Adressen erlaubt. Leer = nichts erlaubt (Normalbetrieb der App).
const cfg = { addresses: new Set() };
export function enableClear(addresses = []) { cfg.addresses = new Set(addresses); }
export function disableClear() { cfg.addresses = new Set(); }
export function clearEnabled() { return [...cfg.addresses]; }

// Nutzlast eines Befehls: { F1 command } → [0x08, command]
export function clearPayload(command) { return [0x08, command]; }

// Guard: NUR RPC an eine freigegebene Adresse mit einem der Sequenz-Befehle (0/1/2) und leerer Argumentliste.
// Im Normalbetrieb der App ist keine Adresse freigegeben → dieser Pfad bleibt zu.
export function isFaultClear(address, type, payload) {
  if (type !== RPC || !cfg.addresses.has(address)) return false;
  const p = Array.from(payload);
  return p.length === 2 && p[0] === 0x08 && ALLOWED_CMDS.has(p[1]);
}
