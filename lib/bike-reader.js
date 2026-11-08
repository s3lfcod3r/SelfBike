// Spricht einzelne Datenpunkte über den MessageBus an.
//
// Sicherheitsregel an EINER Stelle (#guard, direkt vor dem Senden):
//   READ  – jede Adresse
//   WRITE – nur die Adressen in WRITE_RULES, mit der dort erlaubten Nutzlast
//           (Schiebehilfe 6182: nur an/aus, Geschwindigkeit höchstens 6 km/h)
//   RPC   – das Lebenszeichen, reine Lese-Abfragen (Fehlerspeicher, Statistik und
//           Parameter pro Fahrmodus) sowie Fahrmodus ändern/zurücksetzen –
//           Änderungen nur an Unterstützung, Dynamik und Höchstgeschwindigkeit; die
//           Tempo-Grenze ist die, die das Rad selbst für den Modus meldet (25er → 25,
//           45er → 45), absolut gedeckelt auf 45 km/h und ersatzweise 25, wenn das Rad
//           keine Grenze meldet. Der Wächter nutzt dafür nur die direkt vom Rad gelesene
//           Grenze, nie einen Wert aus dem Browser;
//           alle anderen Felder (Drehmoment, Leistung …) müssen exakt so bleiben, wie das Rad sie meldet
// Alles andere (z. B. Fehler löschen) wird verweigert, bevor ein Byte über USB geht.

import {
  buildFrame, parseResponse, FrameSplitter, READ, WRITE, RPC, decoders, hex, pbSummary,
} from './messagebus.js';
import { isFaultClear } from './fault-actions.js';

// Ein Varint ab Position i: [wert, nächste Position] oder null. Höchstens 8 Bytes, damit der Wert
// eine exakte Zahl bleibt (sehr lange Varints ergäben Infinity/NaN und würden Grenzprüfungen aushebeln).
function readVarint(p, i) {
  let v = 0;
  let f = 1;
  for (let n = 0; n < 8; n++) {
    if (i >= p.length) return null;
    const b = p[i++];
    v += (b & 0x7f) * f;
    if (!(b & 0x80)) return [v, i];
    f *= 128;
  }
  return null;
}
// Varint-Feld 1 ohne weitere Felder: [08 v…] → v, sonst null
function onlyUint(p) {
  if (p[0] !== 0x08) return null;
  const r = readVarint(p, 1);
  return r && r[1] === p.length ? r[0] : null;
}
// Service-Fälligkeit wie encodeService: leer, {F1 {F1 Zeitstempel zigzag ≥ 0}} und/oder {F2 Meter}, in dieser Reihenfolge
function isServicePayload(p) {
  let i = 0;
  if (p[i] === 0x0a) {
    const len = p[i + 1];
    const inner = p.slice(i + 2, i + 2 + len);
    const z = onlyUint(inner);
    if (len >= 0x80 || inner.length !== len || z == null || z % 2 !== 0) return false;
    i += 2 + len;
  }
  if (p[i] === 0x10) {
    const r = readVarint(p, i + 1);
    if (!r || r[0] > 0xffffffff) return false;
    i = r[1];
  }
  return i === p.length;
}
// Varint-Felder einer flachen Nachricht: {nummer: wert}, null bei allem anderen (Unternachrichten, doppelte Felder)
function uintFields(p) {
  const out = {};
  for (let i = 0; i < p.length;) {
    const tag = p[i++];
    if ((tag & 7) !== 0 || tag >> 3 < 1 || tag >> 3 > 15 || (tag >> 3) in out) return null;
    const r = readVarint(p, i);
    if (!r) return null;
    [out[tag >> 3], i] = r;
  }
  return out;
}
// Schiebehilfe: gesetzliche Grenze 6 km/h (Wert in 0,01 km/h); SelfBike schreibt ohnehin nur den gelesenen Wert zurück
export const MAX_WALK_SPEED_RAW = 600;

// Sprachcodes, die SelfBike auch selbst kennt
export const DISPLAY_LANGUAGES = ['de', 'en', 'fr', 'it', 'es', 'pt', 'nl', 'pl', 'cs', 'da', 'sv', 'fi'];

// Pro Adresse: { rule: erlaubte Nutzlast, flag: OEM-Freigabe-Referenz [key, feld] oder null (+ reason).
// flag ist die zweite Sicherung neben der Nutzlast-Regel: dokumentiert, welches Hersteller-„änderbar“-Flag
// den Schreibzugriff deckt (die eigentliche Laufzeit-Prüfung macht bike-writer). null = bewusst ohne OEM-Sperre
// (Flow-App-Einstellung oder SoC). Der Selbsttest unten lässt KEINEN Eintrag ohne diese Klassifikation durch –
// so bleibt die statische Tabelle nicht der blinde Teil des Guards.
const WRITE_RULES = new Map([
  [6176, { rule: (p) => onlyUint(p) === 1, flag: ['lightOem', 'configurable'] }], // Licht freischalten (nur „an“)
  [6177, { rule: (p) => { const v = onlyUint(p); return v != null && v >= 1 && v <= 4; }, flag: ['lightOem', 'configurable'] }], // Licht-Modus 1–4
  [6178, { rule: (p) => { const v = onlyUint(p); return v != null && v >= 10 && v <= 180; }, flag: ['lightOem', 'configurable'] }], // Licht-Leistung 1,0–18,0 W (0,1 W)
  [8581, { rule: isServicePayload, flag: null, reason: 'Serviceintervall – Flow-App-Einstellung, keine OEM-Sperre' }],
  // Anzeige-Einstellungen wie in der Flow-App (keine OEM-Sperre)
  [6180, { rule: (p) => { const v = onlyUint(p); return v != null && v >= 1 && v <= 6; }, flag: ['startModeOem', 'configurable'] }], // Startmodus
  [8578, { rule: (p) => p.length === 0 || onlyUint(p) === 1, flag: null, reason: 'Einheiten metrisch/imperial – Flow-App-Einstellung' }],
  [8579, { rule: (p) => p.length === 0 || onlyUint(p) === 1, flag: null, reason: 'Uhrzeitformat 24/12 h – Flow-App-Einstellung' }],
  [8577, { rule: (p) => p[0] === 0x0a && p[1] === 2 && p.length === 4 && // Sprache
    DISPLAY_LANGUAGES.includes(String.fromCharCode(p[2], p[3])), flag: null, reason: 'Anzeigesprache – Flow-App-Einstellung' }],
  [8226, { rule: (p) => { // Uhrzeit: nur auf „jetzt“ (± 1 Tag)
    const z = onlyUint(p);
    return z != null && z % 2 === 0 && Math.abs(z / 2 - Date.now() / 1000) < 86400;
  }, flag: null, reason: 'Uhrzeit auf jetzt – Flow-App-Einstellung' }],
  // Power Ports nur an/aus, und nur wenn die jeweilige Herstellerfreigabe 6192 „änderbar“ meldet (prüft bike-writer).
  // 6192 selbst bleibt unbeschreibbar. Gesperrter Port wird angezeigt, aber nie geschrieben.
  [6193, { rule: (p) => p.length === 0 || onlyUint(p) === 1, flag: ['portOem', 'lowConfigurable'] }], // Low Power Port
  [6194, { rule: (p) => p.length === 0 || onlyUint(p) === 1, flag: ['portOem', 'highConfigurable'] }], // High Power Port
  [6182, { rule: (p) => { // Schiebehilfe {F1 an (fehlt = aus), F2 Höchstgeschwindigkeit}
    const f = uintFields(p);
    return f != null && Object.keys(f).every((n) => n === '1' || n === '2') &&
      (f[1] === undefined || f[1] === 1) && f[2] >= 1 && f[2] <= MAX_WALK_SPEED_RAW;
  }, flag: ['walkAssistOem', 'configurable'] }],
  // Ladefenster (SoC-Grenzen, Beta): nur Prozent 0–100. Mindestabstand/Obergrenze prüft der Plan.
  // Keine OEM-Begleitnachricht am Rad → bewusst ohne Flag; nur Schreibversuch, Ergebnis bleibt unbestätigt.
  [162, { rule: (p) => { const v = onlyUint(p); return v != null && v >= 0 && v <= 100; }, flag: null, reason: 'SoC-Untergrenze – keine OEM-Begleitnachricht, nur Schreibversuch (unbestätigt)' }],
  [163, { rule: (p) => { const v = onlyUint(p); return v != null && v >= 0 && v <= 100; }, flag: null, reason: 'SoC-Obergrenze – keine OEM-Begleitnachricht, nur Schreibversuch (unbestätigt)' }],
  // Akkuschonung (ChargingSettings 229): {F1 chargingMode 0|1 und/oder F2 chargingLimitSoc 50–100}. Mindestens ein Feld,
  // nie andere Felder. Kein OEM-Flag am Rad möglich → flag:null; Guard ist diese Typ-Regel + Bestätigungsdialog in der UI.
  [229, { rule: (p) => {
    const f = uintFields(p);
    if (!f) return false;
    const keys = Object.keys(f);
    if (!keys.length || !keys.every((n) => n === '1' || n === '2')) return false;
    if (f[1] !== undefined && f[1] !== 0 && f[1] !== 1) return false;
    if (f[2] !== undefined && !(f[2] >= 50 && f[2] <= 100)) return false;
    return true;
  }, flag: null, reason: 'Akkuschonung ChargingSettings – kein OEM-Flag am Rad, nur Schreibversuch (unbestätigt), Guard über Typ-Regel + Bestätigung' }],
  // RESET_SETTINGS 230: setzt die Akkuschonung auf Werk zurück – leere Nutzlast.
  [230, { rule: (p) => p.length === 0, flag: null, reason: 'Akkuschonung zurücksetzen (RESET_SETTINGS) – leere Nutzlast, nur Schreibversuch (unbestätigt)' }],
]);

// Selbsttest: jeder WRITE_RULES-Eintrag MUSS eine Nutzlast-Regel und eine bewusste Flag-Klassifikation tragen –
// entweder eine Flag-Referenz [datenpunkt, feld] oder flag:null MIT Begründung. Ein Eintrag ohne das ist der
// blinde Fleck, den wir ausschließen. Läuft beim Import; ein Fehler hier lässt die App gar nicht erst starten.

// Sammelt ALLE Probleme (bricht nicht beim ersten ab) und beschreibt sie im Klartext: Adresse + was fehlt.
export function checkWriteRulesClassified(rules = WRITE_RULES) {
  const problems = [];
  for (const [address, e] of rules) {
    if (!e || typeof e.rule !== 'function') { problems.push(`Adresse ${address}: keine Nutzlast-Regel (rule)`); continue; }
    if (!('flag' in e)) { problems.push(`Adresse ${address}: Flag-Referenz fehlt – flag:[datenpunkt, feld] oder flag:null + reason setzen`); continue; }
    if (e.flag === null) {
      if (!e.reason) problems.push(`Adresse ${address}: flag:null ohne Begründung (reason)`);
    } else if (!Array.isArray(e.flag) || e.flag.length !== 2 || typeof e.flag[0] !== 'string' || typeof e.flag[1] !== 'string') {
      problems.push(`Adresse ${address}: Flag-Referenz muss [datenpunkt, feld] sein, ist ${JSON.stringify(e.flag)}`);
    }
  }
  return problems;
}

// Wirft bei Problemen mit einer lesbaren Klartext-Meldung (Adresse + fehlende Referenz) und schreibt sie
// zusätzlich nach console.error – damit der Grund sichtbar ist und nicht nur als Stacktrace verpufft.
export function assertWriteRulesClassified(rules = WRITE_RULES) {
  const problems = checkWriteRulesClassified(rules);
  if (problems.length) {
    const msg = `WRITE_RULES-Selbsttest fehlgeschlagen – ${problems.length} Schreibadresse(n) ohne gültige Flag-Klassifikation:\n`
      + problems.map((p) => '  • ' + p).join('\n');
    if (typeof console !== 'undefined') console.error('[SelfBike] ' + msg);
    throw new Error(msg);
  }
  return true;
}
assertWriteRulesClassified();

// Welches OEM-„änderbar“-Flag deckt eine Schreibadresse ab (null = bewusst ohne OEM-Sperre). Für Anzeige/Prüfung.
export const WRITE_FLAG = new Map(Array.from(WRITE_RULES, ([a, e]) => [a, e.flag]));
export const WRITABLE = new Set(WRITE_RULES.keys());
export const HEARTBEAT = 8454; // hält die Sitzung während Änderungen offen
export const FAULT_MEMORY = new Set([4226, 169, 8485, 3092, 2337]); // Motor, Akku, Bedieneinheit, Display, ABS
const FAULT_COUNT = [0x08, 4];
// Anzahl lesen [08 04], Eintrag 0 lesen [08 05], Eintrag n lesen [08 05 18 n]
const isFaultRead = (p) =>
  (p.length === 2 && p[0] === FAULT_COUNT[0] && (p[1] === FAULT_COUNT[1] || p[1] === 5)) ||
  (p.length === 4 && p[0] === 0x08 && p[1] === 5 && p[2] === 0x18 && p[3] >= 1 && p[3] < 64);
export class BikeReader {
  #usb;
  #seq = 0;
  #splitter = new FrameSplitter();
  #busy = Promise.resolve();
  lastActivity = 0;

  constructor(usb) {
    this.#usb = usb;
  }

  read(address, timeoutMs = 1800) {
    return this.request(address, READ, [], timeoutMs);
  }

  // Liefert { address, type, seq, status, statusName, payload }.
  request(address, type, payload = [], timeoutMs = 1800) {
    // Anfragen strikt nacheinander abarbeiten
    const job = this.#busy.then(() => this.#exchange(address, type, payload, timeoutMs));
    this.#busy = job.catch(() => {});
    return job;
  }

  // Liest und dekodiert einen Eintrag aus READ_PLAN.
  async readPoint(point) {
    const started = performance.now();
    const row = { ...point, status: 'error', text: '', value: null, rawHex: '', error: null };
    try {
      const r = await this.read(point.address);
      row.rawHex = hex(r.payload);
      row.fields = pbSummary(r.payload);
      if (r.status !== 0) {
        row.status = 'rejected';
        row.error = r.statusName;
      } else {
        row.status = 'ok';
        try {
          Object.assign(row, decoders[point.decoder](r.payload, point));
        } catch (e) {
          row.status = 'decode';
          row.error = `Dekodierung: ${e.message}`;
        }
      }
    } catch (e) {
      row.status = e.timeout ? 'timeout' : 'error';
      row.error = e.message;
    }
    row.elapsed = Math.round(performance.now() - started);
    return row;
  }

  #guard(address, type, payload) {
    if (type === READ && payload.length === 0) return;
    if (type === WRITE && WRITABLE.has(address) && payload.length <= 64 && WRITE_RULES.get(address).rule(Array.from(payload))) return;
    if (type === RPC && address === HEARTBEAT && payload.length === 0) return;
    if (type === RPC && FAULT_MEMORY.has(address) && isFaultRead(payload)) return;
    // Fehlerspeicher löschen: enger Pfad (fault-actions.js). Nur wenn eine Clear-Methode gesetzt ist –
    // im Normalbetrieb der App ist keine gesetzt, dann bleibt dieser Pfad zu.
    if (isFaultClear(address, type, payload)) return;
    throw new Error(`Sicherheitsprüfung: Befehl ${type} an Adresse ${address} ist nicht erlaubt`);
  }

  async #exchange(address, type, payload, timeoutMs) {
    this.#guard(address, type, payload);
    const seq = this.#seq++ & 0x0f;
    this.lastActivity = performance.now();
    await this.#usb.send(buildFrame(address, type, seq, payload));

    const deadline = performance.now() + timeoutMs;
    while (performance.now() < deadline) {
      const raw = await this.#usb.receive(2, 3);
      if (!raw) continue;
      for (const f of this.#splitter.push(raw)) {
        const r = parseResponse(f);
        if (r && r.address === address && r.type === type + 1 && r.seq === seq) {
          return r;
        }
      }
    }
    throw Object.assign(new Error('Keine Antwort'), { timeout: true });
  }
}
