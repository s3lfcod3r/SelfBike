// Demo-Fahrrad ohne USB: gleiche Schnittstelle wie McspUsb (open, close, send, receive),
// antwortet aber aus lib/demo-data.js. BikeReader samt Sicherheits-Guard läuft unverändert davor,
// so lässt sich die ganze App (auch Änderungen mit Rücklesen) ohne Fahrrad ausprobieren.
// Geschriebene Werte leben nur bis zum Trennen.

import DATA from './demo-data.js';
import { HOST, READ, WRITE, RPC, pbFields, encodeVarint } from './messagebus.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fromHex = (h) => (h ? h.split(' ').map((x) => parseInt(x, 16)) : []);
const fieldMap = (bytes) => Object.fromEntries(pbFields(Uint8Array.from(bytes)).map((f) => [f.field, f.value]));
// Protobuf-Helfer: Varint-Feld, Unternachricht
const num = (n, v) => [n << 3, ...encodeVarint(v)];
const msg = (n, bytes) => [(n << 3) | 2, bytes.length, ...bytes];
const zz = (v) => (v >= 0 ? v * 2 : -v * 2 - 1);

// Ein Eintrag im Fehlerspeicher der Bedieneinheit, damit die Fehleranzeige etwas zeigt
const FAULTS = { 8485: [{ code: 0x1b7210, count: 3, at: Date.UTC(2026, 9, 12, 16, 40) / 1000 }] };
const FAULT_ADDRESSES = [4226, 169, 8485, 3092, 2337];

export class DemoUsb {
  device = { productName: 'SelfBike Demo', opened: false };
  #queue = [];
  #values = new Map();
  #modes = new Map();

  constructor(log = () => {}) {
    this.log = log;
  }

  async open() {
    this.device.opened = true;
    for (const [address, v] of Object.entries(DATA)) this.#values.set(Number(address), typeof v === 'string' ? fromHex(v) : v);
    // Fahrmodi aus der Liste der aktiven Modi: Werkseinstellung 100 % / 100 % / 25 km/h
    const ids = pbFields(Uint8Array.from(this.#values.get(6222) ?? []))
      .map((f) => new TextDecoder().decode(fieldMap(f.value)[1] ?? new Uint8Array()));
    ids.forEach((id, i) => this.#modes.set(id, {
      udam: { 1: 100, 3: 100, 4: 2500 }, distance: [9800, 4200, 15100, 5200][i] ?? 1000, energy: [52, 31, 128, 61][i] ?? 10,
    }));
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

  #fault(address, p) {
    const list = FAULTS[address] ?? [];
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
      case 4236: return [0, msg(1, [...num(1, mode.distance), ...num(2, mode.energy)])];
      case 4240: return [0, params(mode.udam)];
      case 4241: return [0, params({ 1: 100, 3: 100, 4: 2500 })];
      case 4242: return [0, [...msg(1, params({ 1: 150, 3: 150, 4: 2500 })), ...msg(2, params({ 1: 50, 3: 50, 4: 1000 }))]];
      case 4243: {
        const set = fieldMap(f[2]);
        mode.udam = Object.fromEntries(Object.entries(set).filter(([, v]) => typeof v === 'number'));
        return [0, num(1, 1)];
      }
      case 4244: mode.udam = { 1: 100, 3: 100, 4: 2500 }; return [0, num(1, 1)];
      default: return [2, []];
    }
  }
}
