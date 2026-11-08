// Bosch-Smart-System-MessageBus: Nachrichten bauen/zerlegen und Werte dekodieren.
//
// Eine Bus-Nachricht steckt in einem MCSP-Block:  30 <len> <body…>
// Anfrage-Body:  quelle(2) ziel(2) typ<<4|seq
// Antwort-Body:  quelle(2) ziel(2) typ<<4|seq [status] nutzdaten…
//   Adressen: untere 15 Bit = Adresse, oberstes Bit = Flag.
//   Ziel-Flag gesetzt → Erfolg ohne Statusbyte; nicht gesetzt → Statusbyte folgt.
//   Quell-Flag gesetzt → unaufgeforderte Push-Nachricht (wird hier ignoriert).
// Nutzdaten sind Protobuf-kodiert.
//
// Welche Adressen mit welchem Typ angesprochen werden dürfen, entscheidet bike-reader.js.

import { t, fmtNum, fmtDate, locale } from './i18n.js';

const BLOCK = 0x30;
export const HOST = 0x0e10; // unsere eigene Bus-Adresse
export const READ = 0;
export const READ_RESPONSE = 1;
export const WRITE = 2; // Antwort: 3
export const RPC = 4; // Antwort: 5

const KNOWN_STATUS = new Set([0, 1, 2, 3, 4, 6, 7, 8, 9, 10]);
export const statusName = (n) => (KNOWN_STATUS.has(n) ? t(`status.${n}`) : `? (${n})`);

export function buildFrame(address, type, seq, payload = []) {
  if (!Number.isInteger(address) || address < 0 || address > 0x7fff) throw new Error('Ungültige Adresse');
  const body = [
    HOST >> 8, HOST & 0xff,
    0x80 | (address >> 8), address & 0xff,
    ((type & 0x0f) << 4) | (seq & 0x0f),
    ...payload,
  ];
  if (body.length > 0xfff) throw new Error('Nachricht zu lang');
  // Länge: 12 Bit, die oberen 4 Bit stecken im Block-Byte (0x30–0x3F)
  return Uint8Array.from([BLOCK | (body.length >> 8), body.length & 0xff, ...body]);
}

export function buildRead(address, seq) {
  return buildFrame(address, READ, seq);
}

// Varint ohne Bit-Operatoren, damit auch Werte > 2^31 (Zeitstempel ×2) stimmen.
export function encodeVarint(n) {
  const out = [];
  let v = n;
  while (v >= 128) {
    out.push((v % 128) | 0x80);
    v = Math.floor(v / 128);
  }
  out.push(v);
  return out;
}

// Protobuf {Feld 1: uint}
export const encodeUint = (n) => [0x08, ...encodeVarint(n)];

// ConfigId {Feld 1: string} – Argument für Abfragen pro Fahrmodus
export function encodeConfigId(id) {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) throw new Error('Ungültige Fahrmodus-Kennung');
  return [0x0a, id.length, ...Array.from(id, (c) => c.charCodeAt(0))];
}

// Gegenstück zu decoders.service: Feld 1 = {Feld 1: Zeitstempel zigzag}, Feld 2 = Kilometerziel in m.
// 0 bedeutet „nicht gesetzt“ und wird wie vom Fahrrad selbst weggelassen.
export function encodeService({ timestamp, odometer }) {
  const out = [];
  if (timestamp > 0) {
    const inner = [0x08, ...encodeVarint(timestamp * 2)];
    out.push(0x0a, inner.length, ...inner);
  }
  if (odometer > 0) out.push(0x10, ...encodeVarint(odometer));
  return out;
}

// Protobuf {Feld 1: string} (kurze ASCII-Texte, z. B. Sprachcode „de“)
export function encodeString(s) {
  if (!/^[\x20-\x7e]{0,32}$/.test(s)) throw new Error('Ungültiger Text');
  return s ? [0x0a, s.length, ...Array.from(s, (c) => c.charCodeAt(0))] : [];
}

// Uhrzeit der Bedieneinheit: {Feld 1: Sekunden seit 1970 (UTC), zigzag}
export const encodeClock = (seconds) => [0x08, ...encodeVarint(seconds * 2)];
// Auswahlwert {Feld 1: n}; 0 lässt das Fahrrad weg
export const encodeEnum = (n) => (n ? encodeUint(n) : []);
// Schiebehilfe {F1 an (aus = weggelassen), F2 Höchstgeschwindigkeit in 0,01 km/h}
export const encodeWalkAssist = ({ enabled, maxSpeed }) => [...(enabled ? [0x08, 1] : []), 0x10, ...encodeVarint(maxSpeed)];

// Prüft unmittelbar vor dem Senden, dass es eine reine Lese-Anfrage ist.
export function isPlainRead(frame) {
  return frame.length === 7 && frame[0] === BLOCK && frame[1] === 5 &&
    frame[2] === (HOST >> 8) && frame[3] === (HOST & 0xff) && (frame[6] >> 4) === READ;
}

const blockLength = (b0, b1) => (((b0 & 0x0f) << 8) | b1) + 2;

export function parseResponse(frame) {
  if (frame.length < 7 || (frame[0] & 0xf0) !== BLOCK || frame.length !== blockLength(frame[0], frame[1])) return null;
  if (frame[2] & 0x80) return null; // Push-Nachricht
  const dest = ((frame[4] & 0x7f) << 8) | frame[5];
  if (dest !== HOST) return null;
  const implicitOk = (frame[4] & 0x80) !== 0;
  if (!implicitOk && frame.length < 8) return null;
  const status = implicitOk ? 0 : frame[7];
  return {
    address: (frame[2] << 8) | frame[3],
    type: frame[6] >> 4,
    seq: frame[6] & 0x0f,
    status,
    statusName: statusName(status),
    payload: frame.slice(implicitOk ? 7 : 8),
  };
}

// Zerlegt den Byte-Strom aus der Brücke in einzelne 0x30-Blöcke.
export class FrameSplitter {
  #buf = [];
  push(bytes) {
    this.#buf.push(...bytes);
    const frames = [];
    while (this.#buf.length >= 2) {
      // Füllbytes und fremde Blöcke (z. B. Sitzungsaufbau 0x10) überspringen
      if ((this.#buf[0] & 0xf0) !== BLOCK) { this.#buf.shift(); continue; }
      const len = blockLength(this.#buf[0], this.#buf[1]);
      if (this.#buf.length < len) break;
      frames.push(Uint8Array.from(this.#buf.splice(0, len)));
    }
    if (this.#buf.length > 65536) this.#buf = [];
    return frames;
  }
}

// ---------- Protobuf ----------

function readVarint(bytes, pos) {
  let value = 0;
  let factor = 1;
  for (let i = 0; i < 10; i++) {
    if (pos.i >= bytes.length) throw new Error('Protobuf-Zahl unvollständig');
    const b = bytes[pos.i++];
    value += (b & 0x7f) * factor; // Addition statt Bit-Shift: bleibt auch > 2^31 korrekt
    if (!(b & 0x80)) return value;
    factor *= 128;
  }
  throw new Error('Protobuf-Zahl zu lang');
}

// Liefert alle Felder als [{field, wire, value}] (value: Zahl oder Uint8Array).
export function pbFields(bytes) {
  const pos = { i: 0 };
  const out = [];
  while (pos.i < bytes.length) {
    const tag = readVarint(bytes, pos);
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    let value;
    if (wire === 0) value = readVarint(bytes, pos);
    else if (wire === 2 || wire === 1 || wire === 5) {
      const len = wire === 2 ? readVarint(bytes, pos) : wire === 1 ? 8 : 4;
      if (pos.i + len > bytes.length) throw new Error('Protobuf-Feld unvollständig');
      value = bytes.slice(pos.i, pos.i + len);
      pos.i += len;
    } else throw new Error(`Unbekannter Protobuf-Typ ${wire}`);
    out.push({ field, wire, value });
  }
  return out;
}

const field = (bytes, n) => pbFields(bytes).find((f) => f.field === n)?.value;
export const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');

// Kurzform aller Felder, z. B. "F1=2 · F2=1 · F3={F1=5}" – zum Entschlüsseln unbekannter Werte.
export function pbSummary(bytes, depth = 0) {
  if (!bytes.length) return '';
  try {
    return pbFields(bytes).map(({ field: n, wire, value }) => {
      if (wire === 0) return `F${n}=${value}`;
      if (wire !== 2) return `F${n}=[${hex(value)}]`;
      let s = null;
      try { s = new TextDecoder('utf-8', { fatal: true }).decode(value); } catch { /* binär */ }
      if (s && /^[\x20-\x7e]+$/.test(s)) return `F${n}="${s}"`;
      if (depth < 3) {
        const inner = pbSummary(value, depth + 1);
        if (inner) return `F${n}={${inner}}`;
      }
      return `F${n}=[${hex(value)}]`;
    }).join(' · ');
  } catch {
    return depth ? '' : '(kein Protobuf)';
  }
}

// ---------- Decoder: payload → { value, text } ----------

const REGIONS = {
  0: '–', 1: '25 km/h · EU/AU', 2: '20 mph · US/CA/NZ', 3: '24 km/h · JP', 4: '25 km/h · KR', 5: '25 km/h · TW',
  6: '45 km/h · EU S-Pedelec', 7: '28 mph · US', 8: '25 km/h · EU Athlete', 9: '20 mph · US Athlete',
  10: '25 km/h · ZA', 11: '45 km/h · NZ',
};

// Texte entstehen in der aktuell gewählten Sprache (lib/i18n.js); bei Sprachwechsel neu dekodieren.
const lightModeName = (m) => (m >= 0 && m <= 4 ? t(`lightMode.${m}`) : `? (${m})`);

export const decoders = {
  text(p) {
    const s = new TextDecoder('utf-8', { fatal: true }).decode(field(p, 1) ?? new Uint8Array());
    return { value: s, text: s || t('word.empty') };
  },
  uuid(p) {
    const inner = field(p, 1);
    const raw = inner && field(inner, 1);
    if (!(raw instanceof Uint8Array) || raw.length !== 16) throw new Error('Keine UUID');
    const h = hex(raw).replaceAll(' ', '');
    const s = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    return { value: s, text: s };
  },
  uint(p) {
    const v = p.length ? field(p, 1) ?? 0 : 0; // proto3: 0 wird weggelassen
    return { value: v, text: String(v) };
  },
  bool(p) {
    const v = !!(p.length ? field(p, 1) : 0);
    return { value: v, text: t(v ? 'word.yes' : 'word.no') };
  },
  service(p) {
    // Feld 1: Zeitstempel {Feld 1: sint64, zigzag}, Feld 2: Kilometerstand-Grenze (uint32)
    const ts = field(p, 1);
    const zz = ts ? field(ts, 1) ?? 0 : 0;
    const seconds = zz % 2 === 0 ? zz / 2 : -(zz + 1) / 2;
    const odo = field(p, 2) ?? 0;
    const parts = [];
    if (seconds > 0) parts.push(t('svc.at', { date: fmtDate(seconds) }));
    // Kilometerziel in Metern (Gesamt-Kilometerstand, bei dem der Service fällig wird)
    if (odo > 0) parts.push(t('svc.km', { km: `${fmtNum(odo / 1000, 1)} km` }));
    return { value: { timestamp: seconds, odometer: odo }, text: parts.join(' · ') || t('svc.none') };
  },
  raw(p) {
    return { value: hex(p), text: p.length ? hex(p) : t('word.empty') };
  },
  // Zahl mit Einheit; point.factor teilt (z. B. 10 → eine Nachkommastelle),
  // point.signed = zigzag-kodiert (sint32), point.unit 'm' wird als km angezeigt.
  number(p, point = {}) {
    let v = p.length ? field(p, 1) ?? 0 : 0;
    if (point.signed) v = v % 2 === 0 ? v / 2 : -(v + 1) / 2;
    if (point.factor) v /= point.factor;
    if (point.unit === 'm') return { value: v, text: `${fmtNum(v / 1000, 1)} km` };
    const s = v.toLocaleString(locale(), { maximumFractionDigits: point.factor ? 1 : 0 });
    return { value: v, text: `${s}${point.unit ? ' ' + point.unit : ''}` };
  },
  // Herstellerfreigabe Power Ports: F1 LPP beim Start an, F2 LPP änderbar, F3 HPP beim Start an, F4 HPP änderbar
  portOem(p) {
    const f = (n) => !!field(p, n);
    const v = { lowStartup: f(1), lowConfigurable: f(2), highStartup: f(3), highConfigurable: f(4) };
    const onOff = (b) => t(b ? 'word.on' : 'word.off');
    const conf = (b) => t(b ? 'dec.changeable' : 'dec.locked');
    return {
      value: v,
      text: t('dec.portOem', {
        low: onOff(v.lowStartup), lowConf: conf(v.lowConfigurable), high: onOff(v.highStartup), highConf: conf(v.highConfigurable),
      }),
    };
  },
  // repeated string (Feld 1), z. B. Fahrmodus-Namen
  stringList(p) {
    const list = pbFields(p).filter((f) => f.field === 1 && f.wire === 2).map((f) => new TextDecoder().decode(f.value));
    return { value: list, text: list.join(' · ') || t('word.empty') };
  },
  // repeated ConfigId {Feld 1: string} – Kennungen der aktiven Fahrmodi
  configIds(p) {
    const list = pbFields(p).filter((f) => f.field === 1 && f.wire === 2)
      .map((f) => new TextDecoder().decode(field(f.value, 1) ?? new Uint8Array()));
    return { value: list, text: list.join(', ') || t('word.empty') };
  },
  // Fahrstatistik seit Reset: F1 Motor-Energie Wh, F2 andere Verbraucher Wh,
  // F3 Reset-Zeitpunkt {F1 sint64}, F4 Strecke m, F5 Strecke ohne Unterstützung m
  rideStats(p) {
    const f = Object.fromEntries(pbFields(p).map((x) => [x.field, x.value]));
    const zz = f[3] ? field(f[3], 1) ?? 0 : 0;
    const v = {
      motorWh: f[1] ?? 0, otherWh: f[2] ?? 0, distance: f[4] ?? 0, offDistance: f[5] ?? 0,
      resetAt: zz ? (zz % 2 === 0 ? zz / 2 : -(zz + 1) / 2) : 0,
    };
    return { value: v, text: `${fmtNum(v.distance / 1000, 1)} km · ${v.motorWh} Wh` };
  },
  // Region / Geschwindigkeitsklasse (REGIO_SPEED_CONFIGURATION, Werte aus bosch-bes3-reader, siehe data/ATTRIBUTION.md)
  region(p) {
    const v = p.length ? field(p, 1) ?? 0 : 0;
    return { value: v, text: REGIONS[v] ?? `? (${v})` };
  },
  // Tuning-Erkennung des Motors: F1 = erkannt (bool), F2 = Zähler
  tuning(p) {
    const flag = !!(p.length && field(p, 1));
    const counter = (p.length && field(p, 2)) || 0;
    return { value: { flag, counter }, text: flag || counter ? t('tuning.detected', { n: counter }) : t('tuning.none') };
  },
  // SPEED_MANIPULATION_STATUS (SpeedManipulationStatus): F1 status (bool), F2 nonce (uint)
  speedManip(p) {
    const status = !!(p.length && field(p, 1));
    const nonce = (p.length && field(p, 2)) || 0;
    return { value: { status, nonce }, text: status ? t('tuning.manip', { n: nonce }) : t('tuning.manipNone') };
  },
  // eShift: Anzahl Gänge steckt in F1 {F2}
  gearCount(p) {
    const inner = p.length ? field(p, 1) : null;
    const v = inner instanceof Uint8Array ? field(inner, 2) ?? null : null;
    return { value: v, text: v == null ? '–' : String(v) };
  },
  // eShift: erlaubter Trittfrequenz-Bereich F1 {F1 min, F2 max}
  cadenceLimits(p) {
    const inner = p.length ? field(p, 1) : null;
    const f = inner instanceof Uint8Array ? Object.fromEntries(pbFields(inner).map((x) => [x.field, x.value])) : {};
    return { value: { min: f[1] ?? null, max: f[2] ?? null }, text: f[1] != null ? `${f[1]}–${f[2]} U/min` : '–' };
  },
  // Startmodus: 1 = zuletzt genutzt, 2 = aus/Schiebehilfe, ab 3 = Modus-Position 1, 2, …
  startMode(p) {
    const v = p.length ? field(p, 1) ?? 0 : 0;
    const text = v === 1 ? t('start.last') : v === 2 ? t('start.off') : v >= 3 ? t('start.pos', { n: v - 2 }) : '–';
    return { value: v, text };
  },
  // Herstellervorgabe Startmodus: F1 Vorgabe, F2 vom Nutzer änderbar
  startModeOem(p) {
    const mode = p.length ? field(p, 1) ?? 0 : 0;
    const configurable = !!(p.length && field(p, 2));
    return { value: { mode, configurable }, text: `${decoders.startMode(encodeEnum(mode)).text} · ${t(configurable ? 'dec.changeable' : 'dec.locked')}` };
  },
  // Schiebehilfe (WalkAssistConfiguration): F1 an, F2 Höchstgeschwindigkeit in 0,01 km/h
  walkAssist(p) {
    const enabled = !!(p.length && field(p, 1));
    const maxSpeed = p.length ? field(p, 2) ?? 0 : 0;
    return {
      value: { enabled, maxSpeed },
      text: t('dec.walk', { state: t(enabled ? 'word.on' : 'word.off'), speed: `${fmtNum(maxSpeed / 100, 1)} km/h` }),
    };
  },
  // Herstellervorgabe Schiebehilfe: F1 Vorgabe {wie oben}, F2 vom Nutzer änderbar
  walkAssistOem(p) {
    const inner = p.length ? field(p, 1) : null;
    const config = decoders.walkAssist(inner instanceof Uint8Array ? inner : new Uint8Array());
    const configurable = !!(p.length && field(p, 2));
    return { value: { ...config.value, configurable }, text: `${config.text} · ${t(configurable ? 'dec.changeable' : 'dec.locked')}` };
  },
  // Einheiten am Display: 0 metrisch, 1 imperial
  units(p) {
    const v = p.length ? field(p, 1) ?? 0 : 0;
    return { value: v, text: v === 0 ? t('disp.metric') : v === 1 ? t('disp.imperial') : `? (${v})` };
  },
  // Uhrzeitformat: 0 = 24 h, 1 = 12 h
  timeFormat(p) {
    const v = p.length ? field(p, 1) ?? 0 : 0;
    return { value: v, text: v === 0 ? t('disp.h24') : v === 1 ? t('disp.h12') : `? (${v})` };
  },
  // Uhr der Bedieneinheit: Sekunden (UTC), zigzag
  clock(p) {
    const z = p.length ? field(p, 1) ?? 0 : 0;
    const s = z % 2 === 0 ? z / 2 : -(z + 1) / 2;
    return { value: s, text: s > 0 ? new Date(s * 1000).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'medium' }) : '–' };
  },
  lightMode(p) {
    const v = p.length ? field(p, 1) ?? 0 : 0;
    return { value: v, text: `${lightModeName(v)} (${v})` };
  },
  // Lichtleistung in 0,1 W
  deciWatt(p) {
    const v = p.length ? field(p, 1) ?? 0 : 0;
    return { value: v / 10, text: `${fmtNum(v / 10, 1)} W` };
  },
  // Herstellerfreigabe Licht: F1 Standardmodus, F2 Licht vorhanden, F3 vom Nutzer änderbar
  lightOem(p) {
    const mode = field(p, 1) ?? 0;
    const available = !!field(p, 2);
    const configurable = !!field(p, 3);
    return {
      value: { mode, available, configurable },
      text: t('dec.lightOem', {
        mode: lightModeName(mode),
        avail: t(available ? 'dec.lightProvided' : 'dec.lightNotProvided'),
        conf: t(configurable ? 'dec.changeable' : 'dec.locked'),
      }),
    };
  },
};
