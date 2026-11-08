// Demo-Fahrrad ohne USB: gleiche Schnittstelle wie McspUsb (open, close, send, receive),
// antwortet aber aus lib/demo-data.js. BikeReader samt Sicherheits-Guard läuft unverändert davor,
// so lässt sich die ganze App (auch Änderungen mit Rücklesen) ohne Fahrrad ausprobieren.
// Geschriebene Werte leben nur bis zum Trennen.

import DATA from './demo-data.js';
import { HOST, READ, WRITE, RPC, pbFields, encodeVarint } from './messagebus.js';
import { CMD } from './fault-actions.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fromHex = (h) => (h ? h.split(' ').map((x) => parseInt(x, 16)) : []);
const fieldMap = (bytes) => Object.fromEntries(pbFields(Uint8Array.from(bytes)).map((f) => [f.field, f.value]));
// Protobuf-Helfer: Varint-Feld, Unternachricht
const num = (n, v) => [n << 3, ...encodeVarint(v)];
const msg = (n, bytes) => [(n << 3) | 2, bytes.length, ...bytes];
const zz = (v) => (v >= 0 ? v * 2 : -v * 2 - 1);

// Ein Eintrag im Fehlerspeicher der Bedieneinheit, damit die Fehleranzeige etwas zeigt
// Beispiel-Meldungen aus allen Bereichen und Schweregraden (kritisch, Fehler, Warnung, Info)
// k = Art: 'h' historisch (löschbar), 'a' aktiv (kommt nach dem Löschen sofort zurück), 'p' permanent (nicht löschbar)
const at = (m, d, h) => Date.UTC(2026, m - 1, d, h, 0) / 1000;
const FAULTS = {
  4226: [ // Motor
    { code: 0x500006, count: 1, at: at(9, 3, 15), k: 'a' },
    { code: 0x50300a, count: 2, at: at(7, 17, 10), k: 'h' },
    { code: 0x50100a, count: 4, at: at(8, 2, 14), k: 'h' },
    { code: 0x517003, count: 1, at: at(10, 1, 9), k: 'p' },
  ],
  169: [], // Akku – im Demo leer (wie am echten Rad), damit der Akku-Pipeline-Selbsttest sichtbar ist
  8485: [ // Bedieneinheit (0x142003 bewusst doppelt: Known Issue – ein issueId trifft beide)
    { code: 0x113111, count: 1, at: at(6, 5, 12), k: 'h' },
    { code: 0x1b7210, count: 3, at: at(10, 12, 16), k: 'a' },
    { code: 0x142003, count: 1, at: at(10, 16, 9), k: 'h' },
    { code: 0x142003, count: 1, at: at(3, 2, 8), k: 'h' },
    { code: 0x144010, count: 2, at: at(4, 9, 8), k: 'h' },
  ],
  3092: [ // Display
    { code: 0x430006, count: 1, at: at(7, 30, 13), k: 'h' },
    { code: 0x420001, count: 3, at: at(2, 1, 7), k: 'a' },
  ],
  2337: [ // ABS – am Rad geprüft und verworfen: Löschkanal nicht zuverlässig erreichbar → kein Löschziel,
    // der Demo lehnt den Löschaufruf hier ab (Realität: ABS nicht löschbar).
    { code: 0x1c8020, count: 1, at: at(3, 11, 11), k: 'h' },
    { code: 0x821000, count: 2, at: at(6, 18, 15), k: 'h' },
    { code: 0x872000, count: 1, at: at(6, 18, 15), k: 'h' },
  ],
};
const FAULT_ADDRESSES = [4226, 169, 8485, 3092, 2337];
// ECU, die den Löschaufruf im Demo ablehnt (Status 3) – ABS ist kein Löschziel (siehe fault-actions.js)
const DEMO_CLEAR_REJECTS = 2337;

export class DemoUsb {
  device = { productName: 'SelfBike Demo', opened: false };
  #queue = [];
  #values = new Map();
  #modes = new Map();
  #faults = new Map(); // aktueller (veränderbarer) Fehlerspeicher je ECU
  #faultSource = new Map(); // Originalquelle je ECU (aktive/permanente melden sich nach UNBLOCK neu)
  #blocked = new Set(); // ECUs mit abgeschaltetem Reporting (BLOCK_REPORTING) – echtes Feld, prüfbar

  constructor(log = () => {}) {
    this.log = log;
  }

  async open() {
    this.device.opened = true;
    for (const [address, v] of Object.entries(DATA)) this.#values.set(Number(address), typeof v === 'string' ? fromHex(v) : v);
    // Fahrmodi aus der Liste der aktiven Modi: Werkseinstellung 100 % / 100 % / 25 km/h
    const ids = pbFields(Uint8Array.from(this.#values.get(6222) ?? []))
      .map((f) => new TextDecoder().decode(fieldMap(f.value)[1] ?? new Uint8Array()));
    // Rohwerte nach Gen5-Skala (aus Flow.apk): assist/dyn 100=Standard, torque ×10 (850=85 Nm), speed ×100 (2500=25 km/h), power in W
    ids.forEach((id, i) => this.#modes.set(id, {
      udam: { 1: 100, 2: 850, 3: 100, 4: 2500, 5: 600, 6: 1, 7: 1, 8: 1 }, distance: [9800, 4200, 15100, 5200][i] ?? 1000, energy: [52, 31, 128, 61][i] ?? 10,
    }));
    // Fehlerspeicher als veränderbare Kopie + unveränderte Quelle (für Wieder-Melden nach UNBLOCK)
    for (const [addr, list] of Object.entries(FAULTS)) {
      this.#faults.set(Number(addr), list.map((e) => ({ ...e })));
      this.#faultSource.set(Number(addr), list.map((e) => ({ ...e })));
    }
    this.log('Demo-Fahrrad bereit (keine echte Verbindung).');
  }

  async close() {
    this.device.opened = false;
    this.#queue = [];
  }

  async send(frame) {
    const address = ((frame[4] & 0x7f) << 8) | frame[5];
    const type = frame[6] >> 4;
    const seq = frame[6] & 0x0f;
    const payload = Array.from(frame.slice(7));
    const [status, reply] = this.#answer(address, type, payload);
    const body = [address >> 8, address & 0xff, HOST >> 8, HOST & 0xff, ((type + 1) << 4) | seq, status, ...reply];
    this.#queue.push(Uint8Array.from([0x30 | (body.length >> 8), body.length & 0xff, ...body]));
  }

  async receive() {
    await sleep(8);
    return this.#queue.shift() ?? null;
  }

  // Liefert [Status, Nutzdaten]
  #answer(address, type, p) {
    if (type === READ) {
      const v = this.#values.get(address);
      if (v === undefined) return [2, []];
      return typeof v === 'number' ? [v, []] : [0, v];
    }
    if (type === WRITE) {
      if (typeof this.#values.get(address) === 'number') return [this.#values.get(address), []];
      // Wie das echte Fahrrad: „0“ wird weggelassen
      this.#values.set(address, p.length === 2 && p[0] === 0x08 && p[1] === 0 ? [] : p);
      return [0, []];
    }
    if (type !== RPC) return [2, []];
    if (address === 8454) return [0, []];
    if (FAULT_ADDRESSES.includes(address)) return this.#fault(address, p);
    return this.#udam(address, p);
  }

  // Zustand für Tests: ist diese ECU gerade blockiert?
  isBlocked(address) { return this.#blocked.has(address); }
  anyBlocked() { return this.#blocked.size > 0; }

  // Aktive ('a') und permanente ('p') Fehler, die gelöscht wurden, melden sich bei laufendem Reporting wieder.
  #refresh(address) {
    const cur = this.#faults.get(address) ?? [];
    for (const e of this.#faultSource.get(address) ?? []) {
      if ((e.k === 'a' || e.k === 'p') && !cur.some((x) => x.code === e.code && x.at === e.at)) cur.push({ ...e });
    }
    this.#faults.set(address, cur);
  }

  #fault(address, p) {
    // Reporting-Zustand als echtes Feld je ECU: BLOCK setzt, UNBLOCK löscht.
    if (p.length === 2 && p[0] === 0x08 && p[1] === CMD.BLOCK_REPORTING) { this.#blocked.add(address); return [0, []]; }
    if (p.length === 2 && p[0] === 0x08 && p[1] === CMD.UNBLOCK_REPORTING) { this.#blocked.delete(address); return [0, []]; }
    // DELETE_ISSUE: [08 03 12 len 08 <varint code>] – ALLE Einträge mit diesem Code entfernen
    // (doppelter Code = mehrdeutig, Known Issue). ABS lehnt ab (kein Löschziel).
    if (p[0] === 0x08 && p[1] === CMD.DELETE_ISSUE && p[2] === 0x12) {
      if (address === DEMO_CLEAR_REJECTS) return [3, []];
      let v = 0; let f = 1; let i = 5;
      while (i < p.length) { const b = p[i++]; v += (b & 0x7f) * f; if (!(b & 0x80)) break; f *= 128; }
      this.#faults.set(address, (this.#faults.get(address) ?? []).filter((e) => e.code !== v));
      return [0, []];
    }
    // DELETE_ALL_ISSUES: alles aus dem Speicher (aktive/permanente kommen bei laufendem Reporting zurück).
    if (p.length === 2 && p[0] === 0x08 && p[1] === CMD.DELETE_ALL_ISSUES) {
      if (address === DEMO_CLEAR_REJECTS) return [3, []];
      this.#faults.set(address, []);
      return [0, []];
    }
    // Lesen: nur wenn NICHT blockiert, melden sich aktive/permanente Fehler wieder (Reporting läuft).
    if (!this.#blocked.has(address)) this.#refresh(address);
    const list = this.#faults.get(address) ?? [];
    if (p.length === 2 && p[1] === 4) return [0, [...num(3, 0), ...num(4, list.length)]];
    const i = p.length === 4 ? p[3] : 0;
    const e = list[i];
    if (!e) return [0, [...num(3, 1), ...num(4, list.length)]];
    const frame = [...msg(2, num(1, zz(e.at))), ...num(3, e.count)];
    return [0, [...msg(1, frame), ...msg(2, msg(2, num(1, e.code))), ...num(3, 0), ...num(4, list.length)]];
  }

  #udam(address, p) {
    const f = fieldMap(p);
    const idBytes = f[1];
    // SET: {F1 ConfigId {F1 Kennung}, F2 Parameter}; sonst direkt ConfigId {F1 Kennung}
    const id = new TextDecoder().decode(address === 4243 ? fieldMap(idBytes)[1] : idBytes);
    const mode = this.#modes.get(id);
    if (!mode) return [2, []];
    const params = (u) => Object.entries(u).flatMap(([n, v]) => num(Number(n), v));
    switch (address) {
      // GET_ASSIST_MODE_INFORMATION: AssistModeInformation{… F6 userAdjustable}. Demo: alle Modi änderbar (true).
      case 4235: return [0, num(6, 1)];
      case 4236: return [0, msg(1, [...num(1, mode.distance), ...num(2, mode.energy)])];
      case 4240: return [0, params(mode.udam)];
      case 4241: return [0, params({ 1: 100, 2: 85, 3: 100, 4: 2500, 5: 600, 6: 1, 7: 1, 8: 1 })];
      case 4242: return [0, [...msg(1, params({ 1: 150, 2: 120, 3: 150, 4: 2500, 5: 750, 6: 10, 7: 3, 8: 1 })), ...msg(2, params({ 1: 50, 2: 10, 3: 50, 4: 1000, 5: 250, 6: 0, 7: 0, 8: 0 }))]];
      case 4243: {
        const set = fieldMap(f[2]);
        mode.udam = Object.fromEntries(Object.entries(set).filter(([, v]) => typeof v === 'number'));
        return [0, num(1, 1)];
      }
      case 4244: mode.udam = { 1: 100, 2: 850, 3: 100, 4: 2500, 5: 600, 6: 1, 7: 1, 8: 1 }; return [0, num(1, 1)];
      // ASSIST_MODE_IS_OEM_ADJUSTABLE: Boolean je Fahrmodus. Im Demo einer freigegeben (zeigt beide Zustände).
      case 4246: return [0, num(1, id.endsWith('C8') ? 1 : 0)];
      default: return [2, []];
    }
  }
}
