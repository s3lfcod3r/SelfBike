// Fahrmodi: Strecke/Energie pro Modus und die einstellbaren Parameter (UDAM).
// Ändern wie in der Bosch-Flow-App „Individuelle Fahrmodi“: nur Unterstützung, Dynamik und
// Höchstgeschwindigkeit, nur innerhalb der Grenzen, die das Fahrrad für den Modus meldet
// (25er → 25, 45er → 45), absolut gedeckelt auf 45 km/h. Feldbedeutungen aus bosch-bes3-reader
// (siehe data/ATTRIBUTION.md).

import { RPC, pbFields, encodeConfigId, encodeVarint } from './messagebus.js';
import { ASSIST_MODE_STATISTICS, UDAM, MAX_ASSIST_SPEED_RAW, ABS_MAX_ASSIST_SPEED_RAW } from './bike-reader.js';
import { t, fmtNum } from './i18n.js';

const fieldMap = (bytes) => Object.fromEntries(pbFields(bytes).map((f) => [f.field, f.value]));

// UdamParams: 1 Unterstützung %, 2 Drehmoment, 3 Dynamik %, 4 Höchstgeschwindigkeit (0,01 km/h),
// 5 Leistung, 6 Extended Boost, 7 Traktionskontrolle, 8 Kettenspanner (bool)
const UDAM_FIELDS = ['assistLevel', 'maximumMotorTorque', 'accelerationResponse', 'maximumBikeSpeed',
  'maximumMotorPower', 'extendedBoost', 'tractionControl', 'driveTrainTensioner'];
export const EDITABLE = ['assistLevel', 'accelerationResponse', 'maximumBikeSpeed'];

export function decodeUdam(bytes) {
  const f = fieldMap(bytes);
  return Object.fromEntries(UDAM_FIELDS.map((name, i) => [name, typeof f[i + 1] === 'number' ? f[i + 1] : null]));
}
function decodeLimits(bytes) {
  const f = fieldMap(bytes);
  return {
    max: f[1] instanceof Uint8Array ? decodeUdam(f[1]) : null,
    min: f[2] instanceof Uint8Array ? decodeUdam(f[2]) : null,
  };
}
function encodeUdam(params) {
  const out = [];
  UDAM_FIELDS.forEach((name, i) => {
    const v = params[name];
    if (v == null) return;
    out.push(((i + 1) << 3) | 0, ...encodeVarint(name === 'driveTrainTensioner' ? (v ? 1 : 0) : v));
  });
  return out;
}
function encodeSetArg(configId, params) {
  const id = encodeConfigId(configId);
  const p = encodeUdam(params);
  return [0x0a, id.length, ...id, 0x12, p.length, ...p];
}
const boolReply = (bytes) => !!(bytes.length && fieldMap(bytes)[1]);

async function rpc(reader, address, payload) {
  const r = await reader.request(address, RPC, payload);
  return r.status === 0 ? r.payload : null;
}

// Alle Modi lesen: Strecke/Energie, aktuelle Werte, Grenzen, Werkseinstellung
export async function readAssistModes(reader, ids, names = []) {
  // Die Namensliste kann ein führendes „OFF“ enthalten, die Kennungsliste nicht
  const labels = names.length === ids.length + 1 && /^off$/i.test(names[0]?.trim()) ? names.slice(1) : names;
  const modes = [];
  for (const [i, id] of ids.entries()) {
    // '0' = kein Modus; leere oder ungültige Kennungen (z. B. nicht belegte Slots) überspringen statt abbrechen
    if (id === '0' || !/^[A-Za-z0-9_-]{1,32}$/.test(id)) continue;
    const mode = { id, name: labels[i] || `Mode ${i + 1}`, distance: null, energy: null, udam: null, limits: null, defaults: null };
    modes.push(mode);
    const arg = encodeConfigId(id);
    try {
      const s = await rpc(reader, ASSIST_MODE_STATISTICS, arg);
      // Antwort ist eine Hülle: F1 {F1 Strecke m, F2 Energie Wh}
      const inner = s && fieldMap(s)[1];
      const stats = inner instanceof Uint8Array ? fieldMap(inner) : {};
      if (s) { mode.distance = stats[1] ?? 0; mode.energy = stats[2] ?? 0; }
    } catch { /* ohne Statistik */ }
    try { const u = await rpc(reader, UDAM.READ, arg); if (u) mode.udam = decodeUdam(u); } catch { /* — */ }
    try { const l = await rpc(reader, UDAM.LIMITS, arg); if (l) mode.limits = decodeLimits(l); } catch { /* — */ }
    try { const d = await rpc(reader, UDAM.DEFAULTS, arg); if (d) mode.defaults = decodeUdam(d); } catch { /* — */ }
  }
  return modes;
}

export const speedText = (raw) => (raw == null ? '–' : `${fmtNum(raw / 100, 1)} km/h`);
export const modeSummary = (u) => (u
  ? t('mode.summary', { assist: u.assistLevel ?? '–', dyn: u.accelerationResponse ?? '–', speed: speedText(u.maximumBikeSpeed) })
  : '–');

export function canEdit(mode) {
  return !!(mode?.udam && mode.limits?.min && mode.limits?.max);
}

// Grenzen eines Feldes: vom Fahrrad gemeldet, Geschwindigkeit zusätzlich hart auf 25 km/h
export function bounds(mode, key) {
  const min = mode.limits?.min?.[key];
  let max = mode.limits?.max?.[key];
  if (key === 'maximumBikeSpeed') max = Math.min(max ?? MAX_ASSIST_SPEED_RAW, ABS_MAX_ASSIST_SPEED_RAW);
  return { min, max };
}

const sameUdam = (a, b) => EDITABLE.every((k) => a?.[k] === b?.[k]);

// Ein Schritt im Format von bike-writer.applyPlan (mit eigenen Funktionen für RPC)
function modeStep(mode, target, kind) {
  const arg = encodeConfigId(mode.id);
  return {
    key: `mode:${mode.id}`,
    label: t('mode.label', { name: mode.name }),
    before: modeSummary(mode.udam),
    after: modeSummary(target),
    // unverändert seit Backup?
    check: async (reader) => {
      const u = await rpc(reader, UDAM.READ, arg);
      return !!u && sameUdam(decodeUdam(u), mode.udam);
    },
    write: async (reader) => {
      const r = kind === 'reset'
        ? await reader.request(UDAM.RESET, RPC, arg)
        : await reader.request(UDAM.SET, RPC, encodeSetArg(mode.id, { ...mode.udam, ...pick(target) }));
      return { status: r.status, statusName: r.statusName, ok: r.status === 0 && boolReply(r.payload) };
    },
    verify: async (reader) => {
      const u = await rpc(reader, UDAM.READ, arg);
      const now = u ? decodeUdam(u) : null;
      return { ok: !!now && sameUdam(now, target), text: modeSummary(now) };
    },
  };
}
const pick = (u) => Object.fromEntries(EDITABLE.map((k) => [k, u[k]]));

// Änderung eines Modus planen; values = { assistLevel, accelerationResponse, maximumBikeSpeed } (Rohwerte)
export function planModeChange(mode, values) {
  if (!canEdit(mode)) throw new Error(t('err.modeLocked'));
  const target = { ...mode.udam };
  for (const key of EDITABLE) {
    const v = values[key];
    if (v == null) continue;
    const { min, max } = bounds(mode, key);
    if (!Number.isInteger(v) || (min != null && v < min) || (max != null && v > max)) {
      throw new Error(t('err.modeRange', { field: t(`mode.${key}`), min: fmtLimit(key, min), max: fmtLimit(key, max) }));
    }
    target[key] = v;
  }
  const steps = sameUdam(target, mode.udam) ? [] : [modeStep(mode, target, 'set')];
  return { kind: 'mode', title: t('title.mode', { name: mode.name }), steps, warnings: [] };
}

export function planModeReset(mode) {
  if (!mode.udam || !mode.defaults) throw new Error(t('err.modeLocked'));
  const steps = sameUdam(mode.defaults, mode.udam) ? [] : [modeStep(mode, mode.defaults, 'reset')];
  return { kind: 'mode', title: t('title.modeReset', { name: mode.name }), steps, warnings: [] };
}

// Wiederherstellen: Modi aus dem Backup auf die damaligen Werte setzen (innerhalb der Grenzen)
export function planModesRestore(currentModes, backupModes = []) {
  const steps = [];
  for (const b of backupModes) {
    const cur = currentModes.find((m) => m.id === b.id);
    if (!cur?.udam || !b.udam || sameUdam(cur.udam, b.udam)) continue;
    steps.push(...planModeChange(cur, pick(b.udam)).steps);
  }
  return steps;
}

export function fmtLimit(key, raw) {
  if (raw == null) return '–';
  return key === 'maximumBikeSpeed' ? speedText(raw) : `${raw} %`;
}
