// Pflege: Akku-Check (Faustregeln), Reichweiten-Schätzung, Verschleiß-Tagebuch
// und das Merken einer laufenden Änderung, falls sie unterbrochen wird.
// Alles nur im Browser (localStorage), nichts geht ans Fahrrad.

import { consumption } from './history.js';

const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const store = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* voll/gesperrt */ } };

// ---------- Unterbrochene Änderung ----------

const PENDING_KEY = 'selfbike-pending';
// Leeres „08 00“ und gar nichts bedeuten beim Fahrrad dasselbe (0 wird weggelassen)
const norm = (h) => (h === '08 00' ? '' : h ?? '');

// entry: { bikeId, at, title, backupName, steps: [{ key, label, before, after, beforeHex, afterHex }] }
export const savePending = (entry) => store(PENDING_KEY, entry);
export const loadPending = () => load(PENDING_KEY, null);
export const clearPending = () => { try { localStorage.removeItem(PENDING_KEY); } catch { /* egal */ } };

// Vergleich mit dem frisch gelesenen Stand: arrived | notArrived | other | unknown
export function checkPending(entry, state) {
  if (!entry || !entry.bikeId || entry.bikeId !== state.motorBikeId?.value) return null;
  return entry.steps.map((s) => {
    const now = state[s.key];
    let result = 'unknown';
    if (s.afterHex != null && now?.status === 'ok') {
      const cur = norm(now.rawHex);
      result = cur === norm(s.afterHex) ? 'arrived' : cur === norm(s.beforeHex) ? 'notArrived' : 'other';
    }
    return { ...s, now: now?.status === 'ok' ? now.text : null, result };
  });
}

// ---------- Akku-Check ----------

// Liefert [{ id, state: ok|warn|bad|info, vars }] – Texte: bc.<id>.<state>
export function batteryChecks(val) {
  const out = [];
  const soh = val('batterySoh');
  if (soh != null) out.push({ id: 'soh', state: soh >= 80 ? 'ok' : soh >= 70 ? 'warn' : 'bad', vars: { v: soh } });
  const deep = val('batteryDeepDischarge');
  if (deep != null) out.push({ id: 'deep', state: deep ? 'bad' : 'ok', vars: { n: deep } });
  const thermal = val('batteryThermal');
  if (thermal != null) out.push({ id: 'thermal', state: thermal ? 'warn' : 'ok', vars: { s: thermal } });
  const hot = val('batteryTempMax');
  if (hot != null) out.push({ id: 'hot', state: hot <= 45 ? 'ok' : 'warn', vars: { v: hot } });
  const cold = val('batteryTempMin');
  if (cold != null) out.push({ id: 'cold', state: cold >= -10 ? 'ok' : 'warn', vars: { v: cold } });
  const now = val('batteryTempNow');
  if (now != null) out.push({ id: 'charge', state: now >= 0 && now <= 40 ? 'ok' : 'warn', vars: { v: now } });
  const soc = val('batterySoc');
  if (soc != null) out.push({ id: 'store', state: soc >= 30 && soc <= 60 ? 'ok' : 'info', vars: { v: soc } });
  const cycles = val('batteryCycles');
  if (cycles != null) out.push({ id: 'cycles', state: 'info', vars: { n: cycles } });
  return out;
}

// ---------- Reichweite ----------

const MIN_KM = 10;

// Verbrauch aus der Fahrstatistik des Fahrrads, sonst aus dem Verlauf (letzte 5 Abschnitte)
export function rangeEstimate(val, history = []) {
  const usable = val('batteryRiderWh') ?? val('batteryRemainingWh');
  const soc = val('batterySoc');
  let whkm = null;
  let source = null;
  const rs = val('rideStats');
  if (rs && rs.distance >= MIN_KM * 1000 && rs.motorWh > 0) {
    whkm = (rs.motorWh + (rs.otherWh ?? 0)) / (rs.distance / 1000);
    source = { kind: 'bike', km: rs.distance / 1000 };
  } else {
    const parts = consumption(history).slice(-5);
    if (parts.length) {
      whkm = parts.reduce((n, p) => n + p.whkm, 0) / parts.length;
      source = { kind: 'history' };
    }
  }
  if (!whkm || usable == null) return { whkm, source, usable, now: null, full: null };
  return {
    whkm, source, usable,
    now: usable / whkm,
    full: soc >= 10 ? usable / (soc / 100) / whkm : null,
  };
}

// ---------- Verschleiß-Tagebuch ----------

const WEAR_KEY = 'selfbike-wear';
// Richtwerte in km (E-Bike, eher vorsichtig)
export const WEAR_PARTS = {
  chain: 2000, cassette: 5000, chainring: 8000, padsFront: 1500, padsRear: 1500, discs: 10000, tireFront: 5000, tireRear: 3000,
};

// Eintrag: { id, part (Schlüssel aus WEAR_PARTS oder null), name, limitKm, sinceKm, sinceDate }
export const loadWear = () => load(WEAR_KEY, []);
const saveWear = (list) => store(WEAR_KEY, list);

export function addWear({ part, name, limitKm, sinceKm }) {
  const entry = {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    part: WEAR_PARTS[part] ? part : null, name: String(name || '').trim().slice(0, 60),
    limitKm, sinceKm, sinceDate: new Date().toISOString(),
  };
  saveWear([...loadWear(), entry]);
  return entry;
}
export function replacedWear(id, km) {
  saveWear(loadWear().map((e) => (e.id === id ? { ...e, sinceKm: km, sinceDate: new Date().toISOString() } : e)));
}
export const removeWear = (id) => saveWear(loadWear().filter((e) => e.id !== id));

// Gefahrene km seit Einbau und Anteil am Richtwert
export function wearStatus(entry, odoKm) {
  const used = odoKm == null ? null : Math.max(0, odoKm - entry.sinceKm);
  const share = used == null || !entry.limitKm ? null : used / entry.limitKm;
  return { used, share, state: share == null ? '' : share >= 1 ? 'bad' : share >= 0.8 ? 'none' : 'ok' };
}
