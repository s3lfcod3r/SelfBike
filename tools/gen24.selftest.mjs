// Verifiziert lib/gen24.js gegen einen echten Bosch-Mitschnitt (Gen4, 14.11.2026).
// Erwartete Werte = die vom Bosch-Tool entschlüsselten Werte desselben Rads.
import { buildHello, parseHello, buildReadFrame, parseResponse, parseDtc, buildDtcRead, buildTesterPresent,
  frameType, parseUds, buildFlowControl, ITEMS, ECU } from '../lib/gen24.js';

const hex = (s) => Uint8Array.from(s.trim().split(/\s+/).map((h) => parseInt(h, 16)));
const hx = (a) => Array.from(a).map((b) => b.toString(16).padStart(2, '0')).join(' ');
let fails = 0;
const check = (name, cond, got, exp) => {
  if (cond) { console.log(`  ✓ ${name}`); }
  else { console.log(`  ✗ ${name}  (ist: ${got}  soll: ${exp})`); fails++; }
};

// 1) Handschlag
const hello = buildHello(1);
check('PC-Hallo Bytes (Leitung)', hx(hello.slice(0, 4)) === '00 00 01 01', hx(hello.slice(0, 4)), '00 00 01 01');
const hr = parseHello(hex('00 01 01 00 00 00'));
check('Handschlag-Antwort = LEGACY', hr.ok && hr.transportName === 'LEGACY', JSON.stringify(hr), 'LEGACY');

// 2) Leseanfrage bauen (Display, DID 0x0272)
check('Leseframe Bytes', hx(buildReadFrame(0x3a, 0x0272).slice(0, 8)) === '01 00 3a 08 03 22 02 72',
  hx(buildReadFrame(0x3a, 0x0272).slice(0, 8)), '01 00 3a 08 03 22 02 72');

// 3) Echte Antwort-Frames aus dem Mitschnitt + vom Bosch-Tool decodierte Sollwerte
const RX = {
  odometer:      '01 00 21 08 07 62 01 67 00 0F B7 B0 08 7D 64 07',
  soc:           '01 00 23 08 04 62 05 10 49 85 07 E6 20 81 E5 05',
  voltage:       '01 00 23 08 05 62 04 13 99 B0 07 E6 20 81 E5 05',
  packTemp:      '01 00 23 08 05 62 04 33 73 85 07 E6 20 1B 65 07',
  cyclesOnBike:  '01 00 23 08 05 62 03 12 00 04 07 E6 50 FC 91 04',
  cyclesOffBike: '01 00 23 08 05 62 03 13 00 5E 07 E6 20 81 E5 05',
  providedAh:    '01 00 23 08 07 62 03 19 00 00 05 D5 00 04 90 04',
  nominalWh:     '01 00 23 08 05 62 02 A0 02 71 00 00 08 7D 64 07',
};
const EXPECT = {
  odometer: 1030.1, soc: 73, voltage: 39.3, packTemp: 22.58,
  cyclesOnBike: 0.4, cyclesOffBike: 9.4, providedAh: 149.3, nominalWh: 625,
};

let tested = 0;
for (const item of ITEMS) {
  const raw = RX[item.key];
  if (!raw) continue; // Kennungswerte ohne Mitschnitt-Vektor: nicht prüfbar
  tested++;
  const r = parseResponse(hex(raw));
  if (!r.ok) { check(item.key, false, JSON.stringify(r), 'ok'); continue; }
  const didOk = r.did === item.did && r.canRx === ECU[item.ecu].rx;
  const val = item.dec(r.data);
  const near = Math.abs(val - EXPECT[item.key]) < 0.05;
  check(`${item.label} (${item.ecu} 0x${item.did.toString(16).padStart(4, '0')}) = ${val.toFixed(item.digits)}${item.unit}`,
    didOk && near, `${val} / did ${r.did.toString(16)}`, `${EXPECT[item.key]} / ${item.did.toString(16)}`);
}

// 4) Fehlerspeicher (DTC) + Status-DID gegen echte Antwort-Frames
check('DTC-Anfrage Bytes', hx(buildDtcRead(0x3a).slice(0, 8)) === '01 00 3a 08 03 19 02 08',
  hx(buildDtcRead(0x3a).slice(0, 8)), '01 00 3a 08 03 19 02 08');
check('TesterPresent Bytes', hx(buildTesterPresent(0x22).slice(0, 7)) === '01 00 22 08 02 3e 00',
  hx(buildTesterPresent(0x22).slice(0, 7)), '01 00 22 08 02 3e 00');

const dtcDisplay = parseDtc(hex('01 00 3D 0C 0B 59 02 7B 43 00 13 28 4D 30 07 68'));
check('DTC Display: 2 Codes (430013, 4D3007)',
  dtcDisplay.ok && dtcDisplay.codes.length === 2 && dtcDisplay.codes[0].code === '430013' && dtcDisplay.codes[1].code === '4D3007',
  JSON.stringify(dtcDisplay.codes), '430013, 4D3007');
const dtcMotor = parseDtc(hex('01 00 21 08 03 59 02 7B'));
check('DTC Motor: keine Codes', dtcMotor.ok && dtcMotor.codes.length === 0, JSON.stringify(dtcMotor.codes), '[]');

const ctx = parseResponse(hex('01 00 23 08 04 62 05 01 A1'));
check('Status-DID 0x0501 = 0xA1', ctx.ok && ctx.did === 0x0501 && ctx.data[0] === 0xa1,
  JSON.stringify(ctx), 'did 0501 / A1');

// 5) Multiframe – Längen aus Byte 3 (FF byte3−2, CF byte3−1), Anhang = Puffermüll,
//    deklarierte Länge = Obergrenze inkl. NUL, Terminator abschneiden.
check('First Frame = 6 Nutzbytes (byte3−2)', frameType(hex('01 00 23 08 10 0E 62 01 22 30 32 37 08 7D 64 07')).data.length === 6,
  '' + frameType(hex('01 00 23 08 10 0E 62 01 22 30 32 37 08 7D 64 07')).data.length, '6');
check('Consecutive Frame = 7 Nutzbytes (byte3−1)', frameType(hex('01 00 23 08 21 35 30 30 37 35 34 33 08 7D 64 07')).data.length === 7,
  '' + frameType(hex('01 00 23 08 21 35 30 30 37 35 34 33 08 7D 64 07')).data.length, '7');
check('Flow Control Bytes', hx(buildFlowControl(0x22).slice(0, 7)) === '01 00 22 08 30 10 05',
  hx(buildFlowControl(0x22).slice(0, 7)), '01 00 22 08 30 10 05');

// Reassembly wie in der Seite: FF-Start + CFs (auf Gesamtlänge begrenzt), NUL abschneiden.
function reassemble(ffHex, cfHexes) {
  const ff = frameType(hex(ffHex));
  const parts = Array.from(ff.data);
  for (const c of cfHexes) for (const b of frameType(hex(c)).data) if (parts.length < ff.total) parts.push(b);
  let out = parts.slice(0, ff.total);
  while (out.length && out[out.length - 1] === 0) out.pop();
  const r = parseUds(Uint8Array.from(out), ff.canRx);
  return r.ok ? Array.from(r.data).map((b) => String.fromCharCode(b)).join('') : '(fehler)';
}
// Zwei echte Läufe – unterschiedlicher Anhang (20 bzw. 08), beide müssen gleich sein.
const runOld = reassemble('01 00 23 08 10 0E 62 01 22 30 32 37 20 81 E5 05',
  ['01 00 23 08 21 35 30 30 37 35 34 33 20 1B 65 07', '01 00 23 08 22 00 30 30 37 35 34 33 20']);
const runNew = reassemble('01 00 23 08 10 0E 62 01 22 30 32 37 08 7D 64 07',
  ['01 00 23 08 21 35 30 30 37 35 34 33 08 7D 64 07', '01 00 23 08 22 00 30 30 37 35 34 33 20 1B 65 07']);
check('Lauf 1 (Anhang 20) → "0275007543"', runOld === '0275007543', runOld, '0275007543');
check('Lauf 2 (Anhang 08) → "0275007543"', runNew === '0275007543', runNew, '0275007543');

console.log(fails === 0
  ? `\n✓ Gen2–Gen4-Selbsttest bestanden: ${tested} Werte + DTC/Status + Multiframe gegen echte Bytes verifiziert.`
  : `\n✗ ${fails} Fehler.`);
process.exit(fails ? 1 : 0);
