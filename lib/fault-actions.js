// Fehlerspeicher löschen – EIGENER, enger Pfad NEBEN WRITE_RULES. Kein freies Methodenrufen:
// erlaubt ist nur ein RPC an eine BEKANNTE Fehlerspeicher-ECU mit GENAU der eingestellten Befehls-Nutzlast.
//
// Kanal: Löschen läuft über EXECUTE_INFORMATION_MANAGER_COMMAND auf dem IBD-Kanal (nicht RIDER). Die fünf
// Kanal-Suffixe RIDER/IBD/OEM/SP/BOSCH sind Berechtigungsstufen im Adressraum selbst – die IBD-Kanaladresse
// einer ECU ist also NICHT die Basis-/Leseadresse. Diese IBD-Adressen sind hier noch nicht bekannt.
//
// Nutzlast: KEIN Wert, sondern eine Befehlsnachricht mit einer Befehlsnummer aus der Enum
// InformationManagerCommand. Diese Enum ist öffentlich NICHT dokumentiert – das ist die verbleibende Lücke.
//
// UNVERIFIZIERT. „verifiziert" heißt im Code: belegt durch ENTWEDER (a) einen USB-Mitschnitt eines echten
// Bosch-Diagnosegeräts ODER (b) zwei unabhängige erfolgreiche Läufe auf derselben Systemgeneration. Erst dann
// VERIFIED = true und die echten Werte als Konstanten hinterlegen.
//
// Beschaffung der Befehlsnummer: Dekompilierung der Flow-App im Bereich um ACKNOWLEDGE_ISSUE_VISUALIZATION_EVENT
// (8531), alternativ `strings` über das BDT nach INFORMATION_MANAGER / CLEAR / DELETE / DTC.
//
// QUELLE/ATTRIBUTION: Es werden hier NUR die Fehlerspeicher-Adressen genutzt, die ohnehin schon im Projekt
// stehen (siehe diagnostics.js FAULT_SOURCES). Weitere Adressen aus einer fremden Registry (z. B. Akku 2 681,
// ConnectModule 2580) sind bewusst NICHT übernommen, solange die nötige Namensnennung (CC BY 4.0) nicht geklärt ist.

import { RPC } from './messagebus.js';

// Bekannte Fehlerspeicher-ECUs (Basis-/Leseadressen) in bewusster Reihenfolge: risikoärmste zuerst, Motor zuletzt.
// readAddress = Lesen des Fehlerspeichers. clearAddress = IBD-Kanaladresse für den Löschbefehl (noch unbekannt → null).
export const FAULT_ECUS = [
  { key: 'battery', label: 'Akku', readAddress: 169, clearAddress: null },
  { key: 'controlUnit', label: 'Bedieneinheit', readAddress: 8485, clearAddress: null },
  { key: 'display', label: 'Display', readAddress: 3092, clearAddress: null },
  { key: 'abs', label: 'ABS', readAddress: 2337, clearAddress: null },
  { key: 'motor', label: 'Motor', readAddress: 4226, clearAddress: null },
];
// Whitelist: NUR an diese Adressen darf der Guard einen Löschbefehl überhaupt durchlassen. Die echten
// IBD-Kanaladressen gehören später ebenfalls hier hinein, sobald sie bekannt und verifiziert sind.
export const KNOWN_CLEAR_TARGETS = new Set(FAULT_ECUS.map((e) => e.readAddress));

// Nur für den Demo-Modus: eine erfundene Befehlsnummer, damit die Funktion ohne Rad vollständig testbar ist.
export const DEMO_CLEAR_COMMAND = 2;

// Ist der echte Aufruf bestätigt? Bleibt false, bis Mitschnitt ODER zwei unabhängige Läufe vorliegen.
export const VERIFIED = false;
// Echte Werte, sobald verifiziert (dann hier eintragen und VERIFIED = true). Bis dahin null.
export const CLEAR_COMMAND = null;      // Befehlsnummer aus InformationManagerCommand
export const CLEAR_CHANNEL_OFFSET = null; // Versatz Basis-Adresse → IBD-Kanaladresse

// Laufzeit-Zustand: eingestellte Befehlsnummer + erlaubte Ziel-Adressen (Teilmenge der Whitelist).
// Ohne gesetzte Befehlsnummer oder ohne erlaubte Adresse ist KEIN Löschen erlaubt.
const cfg = { command: null, addresses: new Set() };

// Setzt Befehl + Ziel-Adressen. Adressen außerhalb der Whitelist werden verworfen (kein freies Adressieren).
export function setClear(command, addresses = []) {
  cfg.command = Number.isInteger(command) ? command : null;
  cfg.addresses = new Set([...addresses].filter((a) => KNOWN_CLEAR_TARGETS.has(a)));
}
export function clearConfig() { return { command: cfg.command, addresses: [...cfg.addresses] }; }

// Nutzlast des Löschbefehls: Befehlsnachricht {F1 = Befehlsnummer}. Struktur UNVERIFIZIERT (bestes Modell:
// Feld 1 trägt die Befehlsnummer, wie der Methodenselektor beim Lesen).
export function clearPayload(command) { return [0x08, command]; }

// Guard-Prüfung: erlaubt NUR RPC an eine freigegebene (whitelisted + konfigurierte) Adresse mit genau der
// eingestellten Befehls-Nutzlast. Im Normalbetrieb der App ist nichts gesetzt → dieser Pfad bleibt zu.
export function isFaultClear(address, type, payload) {
  if (type !== RPC || cfg.command == null || !cfg.addresses.has(address)) return false;
  const p = Array.from(payload);
  return p.length === 2 && p[0] === 0x08 && p[1] === cfg.command;
}
