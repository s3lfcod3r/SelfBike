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

// Pro Adresse: welche Nutzlast erlaubt ist
const WRITE_RULES = new Map([
  [6176, (p) => onlyUint(p) === 1], // Licht freischalten (nur „an“)
  [6177, (p) => { const v = onlyUint(p); return v != null && v >= 1 && v <= 4; }], // Licht-Modus 1–4
  [6178, (p) => { const v = onlyUint(p); return v != null && v >= 10 && v <= 180; }], // Licht-Leistung 1,0–18,0 W (0,1 W)
  [8581, isServicePayload], // Serviceintervall (leer = Erinnerung löschen)
  // Anzeige-Einstellungen wie in der Flow-App
  [6180, (p) => { const v = onlyUint(p); return v != null && v >= 1 && v <= 6; }], // Startmodus
  [8578, (p) => p.length === 0 || onlyUint(p) === 1], // Einheiten: metrisch (leer) / imperial
  [8579, (p) => p.length === 0 || onlyUint(p) === 1], // Uhrzeitformat: 24 h (leer) / 12 h
  [8577, (p) => p[0] === 0x0a && p[1] === 2 && p.length === 4 && // Sprache
    DISPLAY_LANGUAGES.includes(String.fromCharCode(p[2], p[3]))],
  [8226, (p) => { // Uhrzeit: nur auf „jetzt“ (± 1 Tag)
    const z = onlyUint(p);
    return z != null && z % 2 === 0 && Math.abs(z / 2 - Date.now() / 1000) < 86400;
  }],
  // Power Ports nur an/aus, und nur wenn die Herstellerfreigabe 6192 „änderbar“ meldet (prüft bike-writer).
  // 6192 selbst bleibt unbeschreibbar.
  [6193, (p) => p.length === 0 || onlyUint(p) === 1], // Low Power Port: aus (leer) / an
  [6194, (p) => p.length === 0 || onlyUint(p) === 1], // High Power Port: aus (leer) / an
  [6182, (p) => { // Schiebehilfe {F1 an (fehlt = aus), F2 Höchstgeschwindigkeit}
    const f = uintFields(p);
    return f != null && Object.keys(f).every((n) => n === '1' || n === '2') &&
      (f[1] === undefined || f[1] === 1) && f[2] >= 1 && f[2] <= MAX_WALK_SPEED_RAW;
  }],
  // Ladefenster (SoC-Grenzen, Beta): nur Prozent 0–100. Der Mindestabstand min<max wird im Plan geprüft.
  [162, (p) => { const v = onlyUint(p); return v != null && v >= 0 && v <= 100; }], // SoC-Untergrenze %
  [163, (p) => { const v = onlyUint(p); return v != null && v >= 0 && v <= 100; }], // SoC-Obergrenze %
]);
export const WRITABLE = new Set(WRITE_RULES.keys());
export const HEARTBEAT = 8454; // hält die Sitzung während Änderungen offen
export const FAULT_MEMORY = new Set([4226, 169, 8485, 3092, 2337]); // Motor, Akku, Bedieneinheit, Display, ABS
export const ASSIST_MODE_STATISTICS = 4236;
// Fahrmodus-Parameter (UDAM): lesen, Grenzen, Werkseinstellung, ändern, zurücksetzen
export const UDAM = { READ: 4240, DEFAULTS: 4241, LIMITS: 4242, SET: 4243, RESET: 4244 };
const UDAM_ARG_ONLY = new Set([ASSIST_MODE_STATISTICS, UDAM.READ, UDAM.DEFAULTS, UDAM.LIMITS, UDAM.RESET]);
// Ersatzgrenze, wenn das Rad keine eigene Grenze meldet: 25 km/h (Wert in 0,01 km/h)
export const MAX_ASSIST_SPEED_RAW = 2500;
// Absolute Decke, egal was das Rad meldet: höchste legale Klasse 45 km/h. Schützt auch bei
// einem fehlerhaft gelesenen Grenzwert davor, über eine legale Klasse hinaus zu gehen.
export const ABS_MAX_ASSIST_SPEED_RAW = 4500;

const FAULT_COUNT = [0x08, 4];
// Anzahl lesen [08 04], Eintrag 0 lesen [08 05], Eintrag n lesen [08 05 18 n]
const isFaultRead = (p) =>
  (p.length === 2 && p[0] === FAULT_COUNT[0] && (p[1] === FAULT_COUNT[1] || p[1] === 5)) ||
  (p.length === 4 && p[0] === 0x08 && p[1] === 5 && p[2] === 0x18 && p[3] >= 1 && p[3] < 64);
const isConfigId = (p) =>
  p.length >= 3 && p.length <= 34 && p[0] === 0x0a && p[1] === p.length - 2 &&
  /^[A-Za-z0-9_-]+$/.test(String.fromCharCode(...p.slice(2)));

// UdamParams als {Feldnummer: Wert}, nur Varint-Felder 1–8 (sonst null)
function udamFields(params) {
  const out = new Map();
  for (let j = 0; j < params.length;) {
    const tag = params[j++];
    const num = tag >> 3;
    if ((tag & 7) !== 0 || num < 1 || num > 8 || out.has(num)) return null;
    const r = readVarint(params, j);
    if (!r) return null;
    [, j] = r;
    out.set(num, r[0]);
  }
  return out;
}
// Frei änderbar: 1 Unterstützung, 3 Dynamik, 4 Höchstgeschwindigkeit
const UDAM_EDITABLE = new Set([1, 3, 4]);

// Aus einer LIMITS-Antwort die Tempo-Grenze (Feld 4 des Max-Teils) lesen.
// Struktur: {F1 = Max-UdamParams, F2 = Min-UdamParams}; in Max ist Feld 4 die Höchstgeschwindigkeit.
// Null bei allem Unerwarteten – dann greift die Ersatzgrenze.
function speedLimitFromLimits(p) {
  if (p[0] !== 0x0a) return null; // Feld 1 (Max), länge, Inhalt
  const len = p[1];
  if (len == null || len >= 0x80 || 2 + len > p.length) return null;
  const f = udamFields(p.slice(2, 2 + len));
  return f && f.has(4) ? f.get(4) : null;
}

// SET_UDAM_VALUES_PARAMETERS: {F1 ConfigId, F2 UdamParams}. Feld 4 (Höchstgeschwindigkeit) höchstens
// bis zur Grenze, die das Rad selbst für diesen Modus gemeldet hat (limits), absolut gedeckelt auf 45 km/h
// und ersatzweise 25, wenn keine Grenze bekannt ist. Alle übrigen Felder nur mit dem Wert,
// den das Rad zuletzt für diesen Modus gemeldet hat (seen).
function isSafeUdamSet(p, seen, limits) {
  // F1 enthält selbst eine ConfigId-Nachricht {F1: Kennung}
  if (p[0] !== 0x0a) return false;
  const idLen = p[1];
  const id = Array.from(p.slice(2, 2 + idLen));
  if (!isConfigId(id)) return false;
  let i = 2 + idLen;
  if (p[i] !== 0x12) return false;
  const len = p[i + 1];
  const params = p.slice(i + 2, i + 2 + len);
  // Längen nur einbytig (< 128), sonst wäre die Längenangabe selbst ein mehrbytiger Varint
  if (len >= 0x80 || params.length !== len || i + 2 + len !== p.length) return false;
  const want = udamFields(params);
  const known = seen.get(id.join(','));
  if (!want || !known) return false;
  // Grenze aus der direkt vom Rad gelesenen LIMITS-Antwort, nie aus dem Browser
  const speedCap = Math.min(limits.get(id.join(',')) ?? MAX_ASSIST_SPEED_RAW, ABS_MAX_ASSIST_SPEED_RAW);
  for (const [num, v] of want) {
    if (num === 4 && !(v <= speedCap)) return false;
    if (!UDAM_EDITABLE.has(num) && known.get(num) !== v) return false;
  }
  // Nicht-änderbare Felder dürfen auch nicht wegfallen
  for (const num of known.keys()) if (!UDAM_EDITABLE.has(num) && !want.has(num)) return false;
  return true;
}

export class BikeReader {
  #usb;
  #seq = 0;
  #splitter = new FrameSplitter();
  #busy = Promise.resolve();
  // Zuletzt gelesene Fahrmodus-Parameter je ConfigId (Grundlage der Prüfung beim Ändern)
  #udamSeen = new Map();
  // Zuletzt vom Rad gemeldete Tempo-Grenze je ConfigId (Obergrenze beim Ändern von Feld 4)
  #udamSpeedLimit = new Map();
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
    if (type === WRITE && WRITABLE.has(address) && payload.length <= 64 && WRITE_RULES.get(address)(Array.from(payload))) return;
    if (type === RPC && address === HEARTBEAT && payload.length === 0) return;
    if (type === RPC && FAULT_MEMORY.has(address) && isFaultRead(payload)) return;
    if (type === RPC && UDAM_ARG_ONLY.has(address) && isConfigId(payload)) return;
    if (type === RPC && address === UDAM.SET && isSafeUdamSet(Array.from(payload), this.#udamSeen, this.#udamSpeedLimit)) return;
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
          if (type === RPC && r.status === 0) {
            const key = Array.from(payload).join(',');
            if (address === UDAM.READ) {
              const f = udamFields(Array.from(r.payload ?? []));
              if (f) this.#udamSeen.set(key, f); else this.#udamSeen.delete(key);
            } else if (address === UDAM.LIMITS) {
              const lim = speedLimitFromLimits(Array.from(r.payload ?? []));
              if (lim != null) this.#udamSpeedLimit.set(key, lim); else this.#udamSpeedLimit.delete(key);
            }
          }
          return r;
        }
      }
    }
    throw Object.assign(new Error('Keine Antwort'), { timeout: true });
  }
}
