// SelfBike · Gen2–Gen4 (Bosch „Classic Line" / BES2) – Leseprotokoll über WebHID.
//
// Reines Lesen. Es werden ausschließlich UDS-ReadDataByIdentifier-Anfragen (0x22)
// gesendet, nie geschrieben. Das Protokoll wurde aus der öffentlichen Diagnose-
// Schnittstelle abgeleitet und gegen einen echten Mitschnitt verifiziert
// (siehe tools/gen24.selftest.mjs).
//
// Kette: USB-HID (64-Byte-Reports) → Handschlag → Legacy-Transport → CAN → ISO-TP → UDS.

'use strict';

// --- CAN-Adressen der Steuergeräte (TX = Anfrage, RX = Antwort) ---------------
export const ECU = {
  DU:  { tx: 0x20, rx: 0x21, label: 'Motor' },
  BMS: { tx: 0x22, rx: 0x23, label: 'Akku' },
  BUI: { tx: 0x3a, rx: 0x3d, label: 'Display' },
};

// --- Handschlag ---------------------------------------------------------------
export const TRANSPORT = { 1: 'LEGACY', 2: 'SLIDING_WINDOW_A', 3: 'SLIDING_WINDOW_B', 4: 'SLIDING_WINDOW_C' };

// 64-Byte-Nutzlast auf der Leitung (verifiziert gegen den Adapter-TX im Mitschnitt):
// [00][00][N][N][N-1]…[01]. N = höchster unterstützter Transport. Für N=1: 00 00 01 01.
export function buildHello(maxTransport = 1) {
  const b = new Uint8Array(64);
  let i = 2;
  b[i++] = maxTransport;
  for (let t = maxTransport; t >= 1; t--) b[i++] = t;
  return b;
}

// Antwort: [0]=0 ok, [1]=1 ok (0xFF = Fehler), [2]=gewählter Transport.
export function parseHello(buf) {
  if (!buf || buf.length < 3) return { ok: false, reason: 'no-response' };
  if (buf[0] !== 0) return { ok: false, reason: 'error-byte' };
  if (buf[1] === 0xff) return { ok: false, reason: 'handshake-failure' };
  if (buf[1] !== 1) return { ok: false, reason: 'unexpected' };
  return { ok: true, transport: buf[2], transportName: TRANSPORT[buf[2]] || `#${buf[2]}` };
}

// --- Legacy-Transport: eine UDS-Anfrage in einen 64-Byte-Block verpacken -------
// Aufbau: [01][00][canTx][08][ISO-TP Single Frame …]
export function buildReadFrame(canTx, did) {
  const b = new Uint8Array(64);
  b[0] = 0x01;         // ein CAN-Frame
  b[1] = 0x00;
  b[2] = canTx & 0xff; // Ziel-CAN-ID
  b[3] = 0x08;         // CAN-DLC
  b[4] = 0x03;         // ISO-TP Single Frame, Länge 3
  b[5] = 0x22;         // UDS ReadDataByIdentifier
  b[6] = (did >> 8) & 0xff;
  b[7] = did & 0xff;
  return b;
}

// Diagnosesitzung starten (UDS 0x10, nicht-schreibend). Aufbau wie im Mitschnitt:
// [01][00][canTx][08][02][10][sessionTyp]. 0x03 = erweiterte Sitzung.
export function buildSessionFrame(canTx, session = 0x03) {
  const b = new Uint8Array(64);
  b[0] = 0x01; b[1] = 0x00; b[2] = canTx & 0xff; b[3] = 0x08;
  b[4] = 0x02; b[5] = 0x10; b[6] = session & 0xff;
  return b;
}

// TesterPresent (UDS 0x3E) – Keep-alive, damit die Sitzung nicht wegfällt (P2* = 5 s).
export function buildTesterPresent(canTx) {
  const b = new Uint8Array(64);
  b[0] = 0x01; b[1] = 0x00; b[2] = canTx & 0xff; b[3] = 0x08;
  b[4] = 0x02; b[5] = 0x3e; b[6] = 0x00;
  return b;
}

// Fehlerspeicher lesen (UDS 0x19 02, reportDTCByStatusMask, Maske 0x08 = bestätigt).
export function buildDtcRead(canTx, mask = 0x08) {
  const b = new Uint8Array(64);
  b[0] = 0x01; b[1] = 0x00; b[2] = canTx & 0xff; b[3] = 0x08;
  b[4] = 0x03; b[5] = 0x19; b[6] = 0x02; b[7] = mask & 0xff;
  return b;
}

// --- ISO-TP über den Legacy-Transport ----------------------------------------
// Rahmen-Typ erkennen. Aufbau: [01][00][canRx][DLC][PCI …].
//  SF 0x0L: L Datenbytes direkt · FF 0x1X: 12-Bit-Länge, 6 Startbytes, dann CF
//  CF 0x2N: 7 Folgebytes · FC 0x3x: Flusskontrolle.
// Nutzlast je Rahmen fix: FF und CF tragen auf dem Kiox je 7 Datenbytes (am Rad bestätigt).
// SF nutzt die PCI-Längennibble. Alles danach ist Puffermüll (kein CRC) und wird über
// die deklarierte Gesamtlänge weggeschnitten.
export function frameType(buf) {
  if (!buf || buf.length < 5) return null;
  const canRx = buf[2], pci = buf[4], hi = pci & 0xf0;
  if (hi === 0x00) return { kind: 'SF', canRx, data: buf.slice(5, 5 + (pci & 0x0f)) };
  if (hi === 0x10) {
    const total = ((pci & 0x0f) << 8) | buf[5];
    return { kind: 'FF', canRx, total, data: buf.slice(6, 6 + Math.min(7, total)) };
  }
  if (hi === 0x20) return { kind: 'CF', canRx, seq: pci & 0x0f, data: buf.slice(5, 12) };
  if (hi === 0x30) return { kind: 'FC', canRx };
  return null;
}

// Flow-Control-Frame (Clear To Send, Blockgröße 0x10, STmin 5 ms) – wie im Mitschnitt.
export function buildFlowControl(canTx) {
  const b = new Uint8Array(64);
  b[0] = 0x01; b[1] = 0x00; b[2] = canTx & 0xff; b[3] = 0x08;
  b[4] = 0x30; b[5] = 0x10; b[6] = 0x05;
  return b;
}

function dtcCodes(uds) {
  const codes = [];
  for (let i = 3; i + 3 < uds.length; i += 4) {
    const code = (uds[i] << 16) | (uds[i + 1] << 8) | uds[i + 2];
    if (code === 0) continue;
    codes.push({ code: code.toString(16).padStart(6, '0').toUpperCase(), status: uds[i + 3] });
  }
  return codes;
}

// Fertig zusammengesetzte UDS-Bytes deuten (nach SF oder FF+CF).
export function parseUds(uds, canRx) {
  if (!uds || uds.length < 1) return { ok: false, reason: 'empty', canRx };
  if (uds[0] === 0x7f) return { ok: false, negative: true, nrc: uds[2], canRx };
  if (uds[0] === 0x62) return { ok: true, canRx, did: (uds[1] << 8) | uds[2], data: uds.slice(3) };
  if (uds[0] === 0x59) return { ok: true, dtc: true, canRx, codes: dtcCodes(uds) };
  return { ok: false, reason: 'sid', sid: uds[0], canRx };
}

// Entpackt ein Single-Frame direkt (für Tests). { canRx, uds } | null.
export function parseFrame(buf) {
  const f = frameType(buf);
  if (!f || f.kind !== 'SF') return null;
  return { canRx: f.canRx, uds: f.data };
}

// ReadDataByIdentifier-Antwort. { ok, canRx, did, data } | { ok:false, negative, nrc }.
export function parseResponse(buf) {
  const f = parseFrame(buf);
  if (!f) return { ok: false, reason: 'short' };
  const uds = f.uds;
  if (uds[0] === 0x7f) return { ok: false, negative: true, nrc: uds[2], canRx: f.canRx };
  if (uds[0] !== 0x62) return { ok: false, reason: 'not-read-response', sid: uds[0], canRx: f.canRx };
  return { ok: true, canRx: f.canRx, did: (uds[1] << 8) | uds[2], data: uds.slice(3) };
}

// DTC-Antwort (0x59 02). { ok, codes:[{code,status}] } | { ok:false, negative, nrc }.
export function parseDtc(buf) {
  const f = parseFrame(buf);
  if (!f) return { ok: false, reason: 'short' };
  const uds = f.uds;
  if (uds[0] === 0x7f) return { ok: false, negative: true, nrc: uds[2], canRx: f.canRx };
  if (uds[0] !== 0x59) return { ok: false, reason: 'not-dtc-response', sid: uds[0], canRx: f.canRx };
  // uds: [59][02][statusAvailabilityMask][ DTC(3) + Status(1) ]…
  const codes = [];
  for (let i = 3; i + 3 < uds.length; i += 4) {
    const code = (uds[i] << 16) | (uds[i + 1] << 8) | uds[i + 2];
    if (code === 0) continue;
    codes.push({ code: code.toString(16).padStart(6, '0').toUpperCase(), status: uds[i + 3] });
  }
  return { ok: true, canRx: f.canRx, codes };
}

// --- Zahlenhelfer -------------------------------------------------------------
const u16 = (d) => (d[0] << 8) | d[1];
const u32 = (d) => ((d[0] << 24) | (d[1] << 16) | (d[2] << 8) | d[3]) >>> 0;
const ascii = (d) => Array.from(d).filter((c) => c >= 32 && c < 127).map((c) => String.fromCharCode(c)).join('').trim();

// Temperatur: Rohwert = Kelvin × 100.
const kelvin100 = (d) => u16(d) / 100 - 273.15;

// Versionsbytes → „1.12.1.0".
const ver = (d) => Array.from(d).join('.');
// Text, sonst Hex (manche „Typ"-Kennungen sind ein Enum-Byte, keine Zeichenkette).
const asciiOrHex = (d) => ascii(d) || ('0x' + Array.from(d).map((b) => b.toString(16).padStart(2, '0')).join(''));

// --- Lesbare Werte (DID + Decoder), verifiziert gegen den Mitschnitt ----------
// `dec` bekommt die reinen Wertbytes (nach „62 DID") und gibt eine Zahl/Text zurück.
// `kind: 'text'` = Zeichenkette, sonst Zahl (mit `unit`/`digits`).
// Kennungen sind meist ohne Freischaltung lesbar; Zustandswerte sperrt Bosch oft
// hinter SecurityAccess (Antwort 7F 22 33) – die zeigt die Seite dann als „gesperrt".
export const ITEMS = [
  // Kennung (frei lesbar erwartet)
  { key: 'displayType',  ecu: 'BUI', did: 0x5b7c, kind: 'text', dec: ascii, label: 'Display-Typ' },
  { key: 'displaySw',    ecu: 'BUI', did: 0x0220, kind: 'text', dec: ver,   label: 'Display-Software' },
  { key: 'batteryType',  ecu: 'BMS', did: 0x0121, kind: 'text', dec: asciiOrHex, label: 'Akku-Typ (Variante)' },
  { key: 'batteryPart',  ecu: 'BMS', did: 0x0122, kind: 'text', dec: ascii, label: 'Akku-Teilenummer' },
  { key: 'batterySw',    ecu: 'BMS', did: 0x0103, kind: 'text', dec: ver,   label: 'Akku-Software' },
  { key: 'batteryState', ecu: 'BMS', did: 0x0501, kind: 'text', label: 'Akku-Status',
    dec: (d) => ({ 0xa1: 'Application running', 0x01: 'Bootloader' }[d[0]] || ('0x' + (d[0] || 0).toString(16))) },
  // Zustand / Gesundheit (über Kiox-USB i. d. R. durch SecurityAccess gesperrt)
  { key: 'odometer',     ecu: 'DU',  did: 0x0167, dec: (d) => u32(d) / 1000, unit: 'km',  digits: 1, label: 'Kilometerstand' },
  { key: 'soc',          ecu: 'BMS', did: 0x0510, dec: (d) => d[0],          unit: '%',   digits: 0, label: 'Ladestand' },
  { key: 'voltage',      ecu: 'BMS', did: 0x0413, dec: (d) => u16(d) / 1000, unit: 'V',   digits: 1, label: 'Spannung' },
  { key: 'packTemp',     ecu: 'BMS', did: 0x0433, dec: kelvin100,            unit: '°C',  digits: 1, label: 'Temperatur' },
  { key: 'cyclesOnBike', ecu: 'BMS', did: 0x0312, dec: (d) => u16(d) / 10,   unit: '',    digits: 1, label: 'Ladezyklen (am Rad)' },
  { key: 'cyclesOffBike',ecu: 'BMS', did: 0x0313, dec: (d) => u16(d) / 10,   unit: '',    digits: 1, label: 'Ladezyklen (extern geladen)' },
  { key: 'providedAh',   ecu: 'BMS', did: 0x0319, dec: (d) => u32(d) / 10,   unit: 'Ah',  digits: 1, label: 'Entnommene Ladung gesamt' },
  { key: 'nominalWh',    ecu: 'BMS', did: 0x02a0, dec: (d) => u16(d),        unit: 'Wh',  digits: 0, label: 'Nennkapazität' },
];

// Steuergeräte, deren Fehlerspeicher gelesen wird.
export const DTC_ECUS = ['DU', 'BMS', 'BUI'];

export const util = { u16, u32, ascii, ver, kelvin100 };
