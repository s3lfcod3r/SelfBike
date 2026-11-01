// Eigene Einordnung der Fehlercodes – von SelfBike selbst formuliert, keine Bosch-Texte.
// Der Bereich ergibt sich aus den ersten Stellen des sechsstelligen Codes (hex), z. B. 5xxxxx = Antriebseinheit,
// 6xxxxx = Akku, 8xxxxx = ABS. Dazu ein allgemeiner Hinweis, was man selbst prüfen kann.
// Genauere Klartexte gibt es weiterhin nur aus der eigenen Flow-App (issue-catalog.js).

import { t } from './i18n.js';

// Längstes passendes Präfix gewinnt
const PREFIXES = [
  ['10', 'cert'],
  ['11', 'ctrl'], ['12', 'ctrl'], ['13', 'ctrl'], ['14', 'ctrl'], ['15', 'ctrl'],
  ['1B00', 'wireless'], ['1BF', 'hr'], ['1B7', 'shift'], ['1C7', 'shift'],
  ['1C8', 'absLink'], ['1C9', 'seatpost'], ['1F', 'config'],
  ['4', 'display'],
  ['50', 'motorCtrl'], ['51', 'motorSensor'], ['52', 'speed'],
  ['53', 'motorConfig'], ['54', 'motorConfig'], ['55', 'motorConfig'], ['56', 'motorConfig'], ['5F', 'lock'], ['5', 'motor'],
  ['61', 'batConfig'], ['62', 'batCurrent'], ['67', 'batCharge'], ['68', 'batTemp'], ['69', 'batVolt'],
  ['6A', 'batDual'], ['6F', 'lock'], ['6', 'bat'],
  ['82', 'absSensor'], ['83', 'absSensor'], ['85', 'absSensor'], ['8', 'abs'],
  ['9', 'cm'],
  ['F', 'system'],
].sort((a, b) => b[0].length - a[0].length);

export const codeHex = (code) => (code ?? 0).toString(16).toUpperCase().padStart(6, '0');

export function faultCategory(code) {
  const hex = codeHex(code);
  return PREFIXES.find(([p]) => hex.startsWith(p))?.[1] ?? 'unknown';
}

// { area, hint } in der aktuellen Sprache
export function describeFault(code) {
  const c = faultCategory(code);
  return { category: c, area: t(`fcat.${c}`), hint: t(`fhint.${c}`) };
}
