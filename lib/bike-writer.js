// Änderungen am Fahrrad: planen (vorher → nachher), dann Schritt für Schritt schreiben
// und jeden Schritt zurücklesen. Sicherungen:
//   – Herstellerfreigabe muss „änderbar“ sagen
//   – vor jedem Schritt: gleiches Fahrrad, Wert unverändert seit dem Backup
//   – nach jedem Schritt: Rücklesung muss passen, sonst Abbruch
//   – niemals automatisch wiederholen

import { READ_PLAN } from './datapoints.js';
import { WRITE, RPC, encodeUint, encodeService, encodeString, encodeClock, encodeEnum, encodeWalkAssist, decoders } from './messagebus.js';
import { HEARTBEAT, DISPLAY_LANGUAGES, MAX_WALK_SPEED_RAW } from './bike-reader.js';
import { t, fmtNum, fmtDate, fmtDateTime, LANGS } from './i18n.js';

const point = (key) => READ_PLAN.find((p) => p.key === key);
const label = (key) => t(`dp.${key}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Einstellbare Lichtmodi 1–4; der Name kommt in der aktuellen Sprache
export const LIGHT_MODES = new Proxy({}, {
  get: (_, k) => (['1', '2', '3', '4'].includes(String(k)) ? t(`lightMode.${String(k)}`) : undefined),
});
const watt = (w) => `${fmtNum(w, 1)} W`;
const km = (m) => `${fmtNum(m / 1000, 1)} km`;
const serviceText = ({ timestamp, odometer }) =>
  [timestamp > 0 && t('svc.at', { date: fmtDate(timestamp) }), odometer > 0 && t('svc.km', { km: km(odometer) })]
    .filter(Boolean).join(' · ') || t('svc.none');

export const byKey = (rows) => Object.fromEntries(rows.map((r) => [r.key, r]));

// Liest einen Leseplan (standardmäßig den ganzen READ_PLAN; beim Verbinden nur CORE_PLAN). Bricht bei USB-Fehlern ab.
export async function readAll(reader, onRow = () => {}, plan = READ_PLAN) {
  const rows = [];
  for (const [i, p] of plan.entries()) {
    const row = await reader.readPoint(p);
    onRow(row, i, plan.length);
    if (row.status === 'error') throw new Error(`${label(p.key)}: ${row.error}`);
    rows.push(row);
  }
  return rows;
}

export async function heartbeat(reader) {
  const r = await reader.request(HEARTBEAT, RPC, [], 6500);
  if (r.status !== 0) throw new Error(`Lebenszeichen abgelehnt (${r.statusName})`);
}

function need(state, key) {
  const r = state[key];
  if (r?.status !== 'ok') throw new Error(t('err.unreadable', { label: label(key) }));
  return r;
}

// ---------- Licht ----------

export function planLight(state, { mode, watts }) {
  if (!Number.isInteger(mode) || !LIGHT_MODES[mode]) throw new Error(t('err.mode'));
  if (!Number.isFinite(watts) || watts < 1 || watts > 18 || Math.abs(watts * 10 - Math.round(watts * 10)) > 1e-6) {
    throw new Error(t('err.watts'));
  }
  if (need(state, 'lightOem').value.configurable !== true) {
    throw new Error(t('err.lightLocked'));
  }
  const available = need(state, 'lightAvailable').value;
  const curMode = need(state, 'lightMode').value;
  const curDeci = Math.round(need(state, 'lightPower').value * 10);
  const deci = Math.round(watts * 10);

  // Reihenfolge wie beim Original: Modus, Leistung, dann freischalten.
  // Ist das Licht noch nicht freigeschaltet, werden Modus und Leistung immer mitgeschrieben.
  const steps = [];
  if (!available || curMode !== mode) {
    steps.push({
      key: 'lightMode', address: point('lightMode').address, payload: encodeUint(mode),
      before: curMode === 0 ? t('lightMode.0') : (LIGHT_MODES[curMode] ?? String(curMode)), after: LIGHT_MODES[mode],
      matches: (r) => r.value === mode,
    });
  }
  if (!available || curDeci !== deci) {
    steps.push({
      key: 'lightPower', address: point('lightPower').address, payload: encodeUint(deci),
      before: watt(curDeci / 10), after: watt(deci / 10),
      matches: (r) => Math.round(r.value * 10) === deci,
    });
  }
  if (!available) {
    steps.push({
      key: 'lightAvailable', address: point('lightAvailable').address, payload: encodeUint(1),
      before: t('word.no'), after: t('word.yes'), matches: (r) => r.value === true,
    });
  }
  return { kind: 'light', title: t('title.light', { mode: LIGHT_MODES[mode], w: watt(deci / 10) }), steps, warnings: [] };
}

// ---------- Service ----------

// target: { timestamp (Sekunden, 0 = kein Datum), odometer (Meter, 0 = kein Kilometerziel) }
export function planService(state, target, { strict = true } = {}) {
  const { timestamp, odometer } = target;
  if (!Number.isSafeInteger(timestamp) || timestamp < 0 || !Number.isSafeInteger(odometer) || odometer < 0 || odometer > 0xffffffff) {
    throw new Error(t('err.serviceTarget'));
  }
  const current = need(state, 'serviceDue').value;
  const warnings = [];
  if (strict) {
    if (timestamp > 0 && timestamp * 1000 < Date.now()) throw new Error(t('err.pastDate'));
    const odo = state.odometer?.status === 'ok' ? state.odometer.value : null;
    if (odometer > 0 && odo !== null && odometer <= odo) throw new Error(t('err.kmBelow'));
  }
  if (timestamp === 0 && odometer === 0) warnings.push(t('warn.serviceDelete'));
  const steps = current.timestamp === timestamp && current.odometer === odometer ? [] : [{
    key: 'serviceDue', address: point('serviceDue').address, payload: encodeService(target),
    before: serviceText(current), after: serviceText(target),
    matches: (r) => r.value.timestamp === timestamp && r.value.odometer === odometer,
  }];
  return { kind: 'service', title: t('title.service', { service: serviceText(target) }), steps, warnings };
}

// ---------- Anzeige und Start (wie in der Flow-App) ----------

const startModeText = (n, names = []) => (n >= 3 && names[n - 3] ? `${t('start.pos', { n: n - 2 })} · ${names[n - 3]}` : decoders.startMode(encodeEnum(n)).text);
const langName = (code) => LANGS[code] ? `${LANGS[code]} (${code})` : code || t('word.empty');

// Auswahl für den Startmodus: zuletzt genutzt, aus, dann ein Eintrag pro Fahrmodus (höchstens 4)
export function startModeOptions(modeNames = []) {
  return [1, 2, ...modeNames.slice(0, 4).map((_, i) => i + 3)].map((n) => ({ value: n, text: startModeText(n, modeNames) }));
}

// target: { startMode, language, displayUnits, timeFormat, walkAssist, setClock } – nur geänderte Werte werden geschrieben
export function planDisplay(state, target, modeNames = []) {
  const steps = [];
  if (target.startMode != null && state.startMode?.status === 'ok' && target.startMode !== state.startMode.value) {
    if (state.startModeOem?.value?.configurable !== true) throw new Error(t('err.startLocked'));
    if (!startModeOptions(modeNames).some((o) => o.value === target.startMode)) throw new Error(t('err.startMode'));
    steps.push({
      key: 'startMode', address: point('startMode').address, payload: encodeUint(target.startMode),
      before: startModeText(state.startMode.value, modeNames), after: startModeText(target.startMode, modeNames),
      matches: (r) => r.value === target.startMode,
    });
  }
  if (target.language && state.displayLanguage?.status === 'ok' && target.language !== state.displayLanguage.value) {
    if (!DISPLAY_LANGUAGES.includes(target.language)) throw new Error(t('err.language'));
    steps.push({
      key: 'displayLanguage', address: point('displayLanguage').address, payload: encodeString(target.language),
      before: langName(state.displayLanguage.value), after: langName(target.language),
      matches: (r) => r.value === target.language,
    });
  }
  for (const [key, decoder] of [['displayUnits', 'units'], ['timeFormat', 'timeFormat']]) {
    const want = target[key];
    if (want == null || state[key]?.status !== 'ok' || want === state[key].value) continue;
    if (want !== 0 && want !== 1) throw new Error(t('err.serviceTarget'));
    steps.push({
      key, address: point(key).address, payload: encodeEnum(want),
      before: state[key].text, after: decoders[decoder](encodeEnum(want)).text,
      matches: (r) => r.value === want,
    });
  }
  // Schiebehilfe: nur an/aus – die Geschwindigkeit wird unverändert zurückgeschrieben
  const walk = state.walkAssist;
  if (target.walkAssist != null && walk?.status === 'ok' && target.walkAssist !== walk.value.enabled) {
    if (state.walkAssistOem?.value?.configurable !== true) throw new Error(t('err.walkLocked'));
    const { maxSpeed } = walk.value;
    if (!(maxSpeed >= 1 && maxSpeed <= MAX_WALK_SPEED_RAW)) throw new Error(t('err.walkSpeed'));
    const want = { enabled: target.walkAssist, maxSpeed };
    steps.push({
      key: 'walkAssist', address: point('walkAssist').address, payload: encodeWalkAssist(want),
      before: walk.text, after: decoders.walkAssist(encodeWalkAssist(want)).text,
      matches: (r) => r.value.enabled === want.enabled && r.value.maxSpeed === maxSpeed,
    });
  }
  if (target.setClock && state.bikeClock?.status === 'ok') {
    // Zeit erst beim Schreiben bestimmen (Backup-Dialog dauert); läuft weiter → nicht gegen Backup prüfen
    steps.push({
      key: 'bikeClock', address: point('bikeClock').address, volatile: true,
      payloadNow: () => encodeClock(Math.round(Date.now() / 1000)),
      before: state.bikeClock.text, after: t('disp.clockNow'),
      matches: (r) => Math.abs(r.value - Date.now() / 1000) < 120,
    });
  }
  return { kind: 'display', title: t('title.display'), steps, warnings: [] };
}

// ---------- Power Ports ----------

// Welche Herstellerfreigabe zu welchem Port gehört (decoders.portOem)
export const PORT_OEM_FLAG = { lowPortActive: 'lowConfigurable', highPortActive: 'highConfigurable' };

// target: { low, high } (true/false, null = nicht ändern). Nur Ports, die der Hersteller als „änderbar“ freigibt –
// gesperrte Ports werden nie geschrieben (am echten Rad getestet: das Rad ignoriert sie ohnehin).
export function planPorts(state, target) {
  const oem = need(state, 'portOem').value;
  const steps = [];
  const warnings = [];
  for (const [key, want] of [['lowPortActive', target.low], ['highPortActive', target.high]]) {
    if (want == null || state[key]?.status !== 'ok' || want === state[key].value) continue;
    if (want !== true && want !== false) throw new Error(t('err.serviceTarget'));
    if (oem[PORT_OEM_FLAG[key]] !== true) throw new Error(t('err.portLocked', { label: label(key) }));
    if (!want) warnings.push(t('warn.portOff', { label: label(key) }));
    steps.push({
      key, address: point(key).address, payload: want ? encodeUint(1) : [],
      before: t(state[key].value ? 'word.on' : 'word.off'), after: t(want ? 'word.on' : 'word.off'),
      matches: (r) => r.value === want,
    });
  }
  return { kind: 'ports', title: t('title.ports'), steps, warnings };
}

// ---------- Wiederherstellen ----------

// currentModes: frisch gelesene Fahrmodi; deren Werte werden auf den Stand im Backup gesetzt
export function planRestore(state, backup, modeNames = []) {
  const b = Object.fromEntries(backup.rows.map((r) => [r.key, r]));
  if (!backup.bikeId || backup.bikeId !== need(state, 'motorBikeId').value) {
    throw new Error(t('err.otherBike'));
  }
  const steps = [];
  const warnings = [];

  const bMode = b.lightMode?.value;
  const bWatts = b.lightPower?.value;
  if (b.lightAvailable?.value === false && state.lightAvailable?.value === true) {
    warnings.push(t('warn.restoreLightOff'));
  }
  if (b.lightAvailable?.value === true && LIGHT_MODES[bMode] && Number.isFinite(bWatts)) {
    steps.push(...planLight(state, { mode: bMode, watts: bWatts }).steps);
  } else if (b.lightMode) {
    warnings.push(t('warn.restoreLight'));
  }
  if (b.serviceDue?.value) {
    steps.push(...planService(state, b.serviceDue.value, { strict: false }).steps);
  }
  // Anzeige-Einstellungen (ältere Backups haben sie noch nicht)
  const shown = {
    startMode: b.startMode?.status === 'ok' ? b.startMode.value : null,
    language: b.displayLanguage?.status === 'ok' && DISPLAY_LANGUAGES.includes(b.displayLanguage.value) ? b.displayLanguage.value : null,
    displayUnits: b.displayUnits?.status === 'ok' ? b.displayUnits.value : null,
    timeFormat: b.timeFormat?.status === 'ok' ? b.timeFormat.value : null,
    walkAssist: b.walkAssist?.status === 'ok' ? b.walkAssist.value.enabled : null,
  };
  try {
    steps.push(...planDisplay(state, shown, modeNames).steps);
  } catch (e) {
    warnings.push(e.message);
  }
  return { kind: 'restore', title: t('title.restore', { date: fmtDateTime(backup.createdAt) }), steps, warnings };
}

// ---------- Ausführen ----------

// Keys, die sich zwischen Vorschau und Ausführung nicht ändern dürfen
// (Fahrmodus-Schritte prüfen sich selbst über step.check)
export function guardedKeys(plan) {
  return ['motorBikeId', 'lightOem', 'walkAssistOem', 'portOem', ...plan.steps.filter((s) => !s.write && !s.volatile).map((s) => s.key)];
}

export async function applyPlan(reader, plan, state, log = () => {}) {
  const attempted = [];
  const done = [];
  try {
    for (const step of plan.steps) {
      // Kontext prüfen: gleiches Fahrrad, Wert unverändert seit dem Backup
      const id = await reader.readPoint(point('motorBikeId'));
      if (id.status !== 'ok' || id.value !== state.motorBikeId.value) throw new Error(t('err.bikeChanged'));
      const name = step.label ?? label(step.key);

      // Schritte mit eigener Logik (Fahrmodi per RPC): prüfen → schreiben → zurücklesen
      if (step.write) {
        if (!(await step.check(reader))) throw new Error(t('err.changedSince', { label: name }));
        attempted.push(step.key);
        log(`SCHREIBE ${step.key}: ${step.before} → ${step.after}`);
        const w = await step.write(reader);
        if (!w.ok) throw Object.assign(new Error(t('err.rejected', { label: name, status: w.statusName })), { rejected: true });
        let v = null;
        for (let i = 0; i < 3; i++) {
          await sleep(350);
          v = await step.verify(reader);
          if (v.ok) break;
        }
        if (!v?.ok) throw new Error(t('err.readback', { label: name, value: v?.text }));
        log(`OK ${step.key}: zurückgelesen „${v.text}“`);
        done.push({ key: step.key, after: v.text });
        continue;
      }

      if (step.key.startsWith('light')) {
        const oem = await reader.readPoint(point('lightOem'));
        if (oem.status !== 'ok' || oem.value.configurable !== true) throw new Error(t('err.oemMissing'));
      }
      if (PORT_OEM_FLAG[step.key]) {
        const oem = await reader.readPoint(point('portOem'));
        if (oem.status !== 'ok' || oem.value[PORT_OEM_FLAG[step.key]] !== true) throw new Error(t('err.portLocked', { label: name }));
      }
      if (step.key === 'walkAssist') {
        const oem = await reader.readPoint(point('walkAssistOem'));
        if (oem.status !== 'ok' || oem.value.configurable !== true) throw new Error(t('err.walkLocked'));
      }
      const now = await reader.readPoint(point(step.key));
      if (now.status !== 'ok' || (!step.volatile && now.rawHex !== state[step.key].rawHex)) {
        throw new Error(t('err.changedSince', { label: name }));
      }

      attempted.push(step.key);
      log(`SCHREIBE ${step.address} ${step.key}: ${step.before} → ${step.after}`);
      const reply = await reader.request(step.address, WRITE, step.payloadNow ? step.payloadNow() : step.payload);
      if (reply.status !== 0) {
        // Klare Ablehnung durch das Fahrrad: dieser Schritt hat nichts verändert
        throw Object.assign(new Error(t('err.rejected', { label: label(step.key), status: reply.statusName })), { rejected: true });
      }

      let back = null;
      for (let i = 0; i < 3; i++) {
        await sleep(350);
        back = await reader.readPoint(point(step.key));
        if (back.status === 'ok' && step.matches(back)) break;
      }
      if (!(back?.status === 'ok' && step.matches(back))) {
        throw new Error(t('err.readback', { label: label(step.key), value: back?.text || back?.error }));
      }
      log(`OK ${step.key}: zurückgelesen „${back.text}“`);
      done.push({ key: step.key, after: back.text });
    }
    return { done };
  } catch (e) {
    e.attempted = attempted;
    e.done = done;
    // Unklar ist der Stand nur, wenn schon etwas geschrieben wurde oder ein Schreibversuch ohne klare Antwort blieb
    e.uncertain = done.length > 0 || (attempted.length > 0 && !e.rejected);
    throw e;
  }
}
