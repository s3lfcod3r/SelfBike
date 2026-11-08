// SelfBike – Startseite (index.html). Eigene Datei statt Inline-Skript, damit die CSP kein 'unsafe-inline' braucht.
import { McspUsb } from './lib/mcsp-usb.js';
import { BikeReader, DISPLAY_LANGUAGES } from './lib/bike-reader.js';
import { READ_PLAN } from './lib/datapoints.js';
import { hex, pbSummary, RPC } from './lib/messagebus.js';
import { CLEAR_TARGETS, CMD, enableClear, disableClear, clearPayload, deleteIssuePayload, isClearable } from './lib/fault-actions.js';
import {
  readAll, byKey, heartbeat, planLight, planService, planDisplay, planPorts, planSoc, planRestore, startModeOptions, applyPlan, guardedKeys, LIGHT_MODES,
} from './lib/bike-writer.js';
import { DemoUsb } from './lib/demo-usb.js';
import { savePending, loadPending, clearPending, checkPending, batteryChecks, rangeEstimate } from './lib/care.js';
import { createBackup, backupFileName, pickBackupFile, writeBackupFile, parseBackup, recordOutcome } from './lib/backup.js';
import { readFaults, readFaultSource, FAULT_SOURCES, decodeFaultReply } from './lib/diagnostics.js';
import { loadCatalog, lookupIssue } from './lib/issue-catalog.js';
import { describeFault, codeHex, bySeverity } from './lib/fault-categories.js';
import { withProductName } from './lib/product-names.js';
import { VERSION, CHANGELOG_URL } from './lib/version.js';
import { loadOwnTexts } from './lib/own-fault-texts.js';
import { buildReportHtml } from './lib/report.js';
import { addSnapshot, snapshotFromRows, historyFor } from './lib/history.js';
import { LANGS, t, setLang, detectLang, applyStatic, fmtNum, fmtDate, fmtDateTime, lang } from './lib/i18n.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const km = (m, digits = 0) => `${fmtNum(m / 1000, digits)} km`;

let usb = null;
let reader = null;
let rows = [];
let S = {};
let faults = [];
let busy = false;
let blocked = false;   // nach unklarem Schreibversuch
let demo = false;
let tab = 'home';
let pending = null;    // { plan, state }
let hbTimer = null;
let hbFailures = 0;
const logLines = [];

const ok = (key) => S[key]?.status === 'ok';
// Feld vorhanden, aber vom Rad abgelehnt (Status 6/2 beim Lesen) – unterscheidet „verweigert“ von „kein Empfänger“
const denied = (key) => S[key]?.status === 'rejected';
const val = (key) => (ok(key) ? S[key].value : null);
const txt = (key, fallback = '–') => (ok(key) && S[key].value !== '' && S[key].text ? S[key].text : fallback);
const dpLabel = (key) => (t(`dp.${key}`) !== `dp.${key}` ? t(`dp.${key}`) : READ_PLAN.find((p) => p.key === key)?.label ?? key);
const log = (m) => { logLines.push(`${new Date().toLocaleTimeString()}  ${m}`); };

// Diagnose-Export: Adressen mit persönlichen Daten werden beim Export ausgelassen
const PRIVATE_ADDR = new Set(READ_PLAN.filter((p) => p.private).map((p) => p.address));
const ADDR_LABEL = new Map(READ_PLAN.map((p) => [p.address, p.label]));
const diag = { map: new Map(), busy: false, stop: false };
// Die bekannten Adressen liegen in Blöcken je Bauteil – ein Knopf pro Block, damit man gezielt scannen kann
const DIAG_BANDS = [
  { key: 'battery', from: 0, to: 300 },
  { key: 'battery2', from: 600, to: 760 },
  { key: 'abs', from: 2300, to: 2400 },
  { key: 'connect', from: 2800, to: 2900 },
  { key: 'display', from: 3300, to: 3480 },
  { key: 'drive', from: 6100, to: 6400 },
  { key: 'control', from: 8200, to: 8600 },
];

// ---------- Meldungen ----------

let toastTimer = null;
function toast(text, kind = '') {
  clearTimeout(toastTimer);
  $('toast').textContent = text;
  $('toast').className = `toast show ${kind}`;
  // Erfolg/Info verschwindet von selbst, Warnungen bleiben länger
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), kind === 'err' ? 9000 : kind === 'warn' ? 6000 : 3500);
}
$('toast').onclick = () => $('toast').classList.remove('show');

// ---------- Kopf, Tabs ----------

const TITLES = { home: 'ui.home', settings: 'ui.settings' };
function showTab(name) {
  tab = name;
  for (const k of Object.keys(TITLES)) $(`tab-${k}`).classList.toggle('hidden', k !== name);
  for (const b of document.querySelectorAll('nav.tabbar button')) b.classList.toggle('on', b.dataset.tab === name);
  renderHead();
  scrollTo(0, 0);
}
for (const b of document.querySelectorAll('nav.tabbar button')) b.onclick = () => showTab(b.dataset.tab);

function renderHead() {
  $('pageTitle').textContent = tab === 'home' && rows.length
    ? ([txt('oemBrand', ''), txt('oemModel', '')].join(' ').trim() || t('ui.home')) : t(TITLES[tab]);
  $('pageSub').textContent = tab === 'home' && rows.length ? t('ui.homeSub') : '';
  $('conn').className = `conn ${busy ? 'busy' : usb ? 'on' : ''}`;
  $('connText').textContent = t(busy ? 'conn.busy' : usb ? 'conn.on' : 'conn.off');
  $('demoBadge').classList.toggle('hidden', !demo);
}

// ---------- Übersicht ----------

function health(soh) {
  if (soh == null) return ['', ''];
  if (soh >= 90) return [t('health.vgood'), 'good'];
  if (soh >= 80) return [t('health.good'), 'good'];
  if (soh >= 70) return [t('health.ok'), 'warn'];
  return [t('health.weak'), 'bad'];
}
function serviceText() {
  const s = val('serviceDue');
  const odo = val('odometer');
  if (!s) return { n: '–', c: t('tile.unreadable') };
  if (!s.timestamp && !s.odometer) return { n: t('tile.none'), c: t('tile.svcNone') };
  if (s.odometer) {
    const left = (s.odometer - (odo ?? 0)) / 1000;
    return { n: left > 0 ? fmtNum(left, 0) : t('tile.due'), unit: left > 0 ? 'km' : '', warn: left < 100,
      c: s.timestamp ? t('tile.svcDate', { date: fmtDate(s.timestamp) }) : '' };
  }
  const days = Math.ceil((s.timestamp * 1000 - Date.now()) / 86400000);
  return { n: days > 0 ? String(days) : t('tile.due'), unit: days > 0 ? t('tile.days') : '', warn: days < 30, c: t('tile.svcDate', { date: fmtDate(s.timestamp) }) };
}
// Fahrrad-Check: Region, Unterstützung bis, Tuning-Erkennung.
// Bosch meldet „Unterstützung bis“ etwas über der gesetzlichen Grenze (Abregelbereich, z. B. 27,4 bei 25);
// auffällig erst, wenn die Unterstützung mehr als 10 % über der eigenen Klassengrenze liegt oder eine
// Manipulation erkannt wurde. Ein legales S-Pedelec (gesetzlich 45) ist für sich allein nicht auffällig.
function checkTile() {
  const tuning = val('tuning');
  if (!tuning && !ok('region')) return '';
  const suspicious = !!tuning && (tuning.flag || tuning.counter > 0);
  const speed = val('maxAssistSpeed');
  const legal = val('maxLegalSpeed') ?? 25;
  const warn = suspicious || (speed != null && speed > legal * 1.1 + 0.2);
  return `<div class="tile"><div class="k">${esc(t('tile.check'))}</div>
    <div class="n ${warn ? 'warn' : 'good'}" style="font-size:24px">${esc(t(warn ? 'check.warn' : 'check.ok'))}</div>
    ${ok('region') ? `<div class="c">${esc(`${t('check.region')}: ${txt('region')}`)}</div>` : ''}
    ${speed != null ? `<div class="c">${esc(t('check.speed', { v: txt('maxAssistSpeed') }))}${ok('maxLegalSpeed') ? ` · ${esc(t('check.legal', { v: txt('maxLegalSpeed') }))}` : ''}</div>` : ''}
    ${tuning ? `<div class="c ${suspicious ? 'bad' : 'good'}">${esc(txt('tuning'))}</div>` : ''}</div>`;
}
const faultCount = () => faults.reduce((n, f) => n + (f.status === 'ok' ? f.faults.length : 0), 0);

function renderHome() {
  const connected = rows.length > 0;
  $('connectCard').classList.toggle('hidden', connected);
  $('home').classList.toggle('hidden', !connected);
  if (!connected) return;
  const soc = val('batterySoc');
  const [hText, hKind] = health(val('batterySoh'));
  const svc = serviceText();
  const fc = faultCount();
  const light = ok('lightMode') ? (val('lightMode') === 0 ? t('lightMode.0') : LIGHT_MODES[val('lightMode')] ?? txt('lightMode')) : '–';
  $('tiles').innerHTML = `
    <button class="tile" data-open="battery" style="text-align:left;cursor:pointer;color:inherit">
      <div class="k">${esc(t('tile.battery'))} · ${esc(t('bat.soc'))}</div>
      <div class="n">${soc != null ? esc(fmtNum(soc, 0)) : '–'}<small>%</small></div>
      <div class="meter"><i style="width:${Math.max(0, Math.min(100, soc ?? 0))}%;${soc != null && soc < 20 ? 'background:var(--self-yellow)' : ''}"></i></div>
      <div class="c">${hText ? `<span class="${hKind}">${esc(t('tile.health', { health: hText }))}</span> · ` : ''}${esc(txt('batteryRiderWh', '') ? t('tile.remaining', { wh: txt('batteryRiderWh') }) : '')}</div>
    </button>
    ${checkTile()}
    <div class="tile"><div class="k">${esc(t('ui.km'))}</div>
      <div class="n">${ok('odometer') ? esc(fmtNum(val('odometer') / 1000, 0)) : '–'}<small>km</small></div></div>
    <button class="tile" data-open="faults" style="text-align:left;cursor:pointer;color:inherit"><div class="k">${esc(t('ui.faults'))}</div>
      <div class="n ${fc ? 'warn' : 'good'}" style="font-size:24px">${fc ? esc(fc) : esc(t('ui.faultsNone'))}</div></button>
    <button class="tile" data-open="service" style="text-align:left;cursor:pointer;color:inherit"><div class="k">${esc(t('tile.service'))}</div>
      <div class="n ${svc.warn ? 'warn' : ''}" style="font-size:24px">${esc(svc.n)}${svc.unit ? `<small>${esc(svc.unit)}</small>` : ''}</div>
      ${svc.c ? `<div class="c">${esc(svc.c)}</div>` : ''}</button>
    <button class="tile" data-open="light" style="text-align:left;cursor:pointer;color:inherit"><div class="k">${esc(t('light.title'))}</div>
      <div style="font-size:16px;font-weight:600;margin-top:4px">${esc(light)}</div>
      <div class="c">${esc(ok('lightPower') ? `${fmtNum(val('lightPower'), 1)} W` : '')}</div></button>`;
  renderPending();
}

// Fahrstatistik – Inhalt der Unterseite „Statistik“ unter „Dein Rad“ (allgemeine Daten, keine Fahrmodi)
function statsHtml() {
  const rs = val('rideStats');
  const hours = val('powerOnHours');
  const motorHours = val('motorHours');
  const stats = [];
  if (rs) {
    stats.push([t('ride.dist'), km(rs.distance, 1), rs.resetAt ? t('ride.reset', { date: fmtDate(rs.resetAt) }) : '']);
    if (rs.distance > 0) stats.push([t('ride.off'), `${km(rs.offDistance, 1)} · ${fmtNum((rs.offDistance / rs.distance) * 100)} %`, '']);
    stats.push([t('ride.motorWh'), `${fmtNum(rs.motorWh)} Wh`, rs.distance > 0 ? t('ride.whkm', { v: fmtNum(rs.motorWh / (rs.distance / 1000), 1) }) : '']);
    if (rs.otherWh) stats.push([t('ride.otherWh'), `${fmtNum(rs.otherWh)} Wh`, '']);
  }
  if (hours != null) stats.push([t('ride.hours'), `${fmtNum(hours)} h`, motorHours != null ? t('ride.hoursMotor', { h: fmtNum(motorHours) }) : '']);
  if (ok('cadence')) stats.push([t('ride.cadence'), txt('cadence'), t('ride.cadenceHint')]);

  return stats.length ? `<div class="group noico">${stats.map(([k, v, hint]) =>
    `<div class="row static"><span class="t">${esc(k)}${hint ? `<small>${esc(hint)}</small>` : ''}</span><span class="kvv" style="color:var(--self-text);font-weight:600">${esc(v)}</span></div>`).join('')}</div>`
    : `<p class="explain">${esc(t('ride.noStats'))}</p>`;
}

// Unterbrochene Änderung (Kabel/Browser weg): zeigen, welcher Schritt im Rad angekommen ist
function renderPending() {
  const p = loadPending();
  const steps = p && checkPending(p, S);
  $('pendingHint').classList.toggle('hidden', !steps);
  if (!steps) return;
  const kind = { arrived: 'good', notArrived: '', other: 'bad', unknown: 'warn' };
  $('pendingHint').innerHTML = `<b>${esc(t('pend.title'))}</b><br>${esc(t('pend.text', { date: fmtDateTime(p.at), title: p.title }))}
    ${steps.map((s) => `<div style="margin-top:6px">${esc(s.label)}: <span class="${kind[s.result]}">${esc(t(`pend.${s.result}`))}</span>
      <span style="color:var(--self-text-2)">(${esc(s.now ?? '–')})</span></div>`).join('')}
    <div style="margin-top:6px;color:var(--self-text-2)">${esc(t('pend.backup', { name: p.backupName }))}</div>
    <button class="btn-text" id="pendingOk" style="margin:8px 0 0">${esc(t('pend.ok'))}</button>`;
  $('pendingOk').onclick = () => { clearPending(); renderPending(); };
}
$('tiles').addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); if (b) openPage(b.dataset.open); });

// ---------- Listen ----------

const ICONS = {
  light: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.9V16h5v-.2c0-.8.4-1.5 1-1.9A6 6 0 0 0 12 3z"/>',
  service: '<path d="M14.7 6.3a4 4 0 0 0-5 5L4 17l3 3 5.7-5.7a4 4 0 0 0 5-5l-2.4 2.4-2.6-.6-.6-2.6z"/>',
  display: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M10 17h4"/>',
  ports: '<path d="M9 3v5M15 3v5M7 8h10v4a5 5 0 0 1-10 0zM12 17v4"/>',
  battery: '<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 11v2M6 10v4M9 10v4"/>',
  soc: '<rect x="3" y="8" width="14" height="8" rx="2"/><path d="M20 11v2"/><path d="M6 12h8"/>',
  faults: '<path d="M12 3 2 20h20zM12 10v4M12 17v.5"/>',
  stats: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
  batterycheck: '<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 11v2M7 12l2 2 4-4"/>',
  range: '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>',
  details: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>',
  components: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6v6H9zM9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/>',
  backup: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  pdf: '<path d="M7 3h7l5 5v13H7zM14 3v5h5"/>',
  lang: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  legal: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  classic: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
  kofi: '<path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 9h1.5a2.5 2.5 0 0 1 0 5H17"/>',
  refresh: '<path d="M20 11A8 8 0 0 0 5.6 6.6L4 8M4 4v4h4M4 13a8 8 0 0 0 14.4 4.4L20 16M20 20v-4h-4"/>',
  export: '<path d="M12 3v12M8 11l4 4 4-4M5 21h14"/>',
};
const icon = (name, color = '') => `<span class="ico"${color ? ` style="background:${color}"` : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg></span>`;
const navRow = (key, label, value = '', color = '') =>
  `<button class="row" data-open="${key}">${icon(key, color)}<span class="t">${esc(label)}</span><span class="v">${esc(value)}</span><span class="chev">›</span></button>`;

function renderSettings() {
  $('settingsList').innerHTML = [
    navRow('light', t('light.title'), ok('lightMode') ? (val('lightMode') === 0 ? t('lightMode.0') : LIGHT_MODES[val('lightMode')] ?? '') : '', '#e0a020'),
    navRow('service', t('svc.title'), rows.length ? serviceText().n + (serviceText().unit ? ` ${serviceText().unit}` : '') : '', '#8b5cf6'),
    navRow('display', t('disp.title'), '', '#64748b'),
    ok('portOem') ? navRow('ports', t('ports.title'), 'Beta', '#e0a020') : '',
    (ok('socMin') || ok('socMax') || denied('socMin') || denied('socMax')) ? navRow('soc', t('soc.title'), 'Beta', '#22a35a') : '',
  ].join('');
}
$('settingsList').addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); if (b) openPage(b.dataset.open); });

// Unter den Kacheln der Startseite (früher eigener Tab „Mehr“)
function renderMore() {
  $('moreList').innerHTML = `
    ${rows.length ? `<p class="gh">${esc(t('tile.battery'))}</p><div class="group">
      ${navRow('battery', t('more.battery'), '', '#22a35a')}
      ${navRow('range', t('rg.title'), '', '#22a35a')}
    </div>
    <p class="gh">${esc(t('nav.ride'))}</p><div class="group">
      ${navRow('stats', t('ride.statsTitle'), '', '#3b82f6')}
    </div>
    <p class="gh">${esc(t('ui.groupBike'))}</p><div class="group">
      ${navRow('faults', t('ui.faults'), faultCount() ? String(faultCount()) : t('ui.faultsNone'), '#e5534b')}
      ${navRow('components', t('comp.title'), '', '#64748b')}
      ${navRow('details', t('more.title'), '', '#64748b')}
    </div>
    <p class="gh">${esc(t('ui.groupSafe'))}</p><div class="group">
      <button class="row" data-act="backup">${icon('backup', '#0ea5e9')}<span class="t">${esc(t('backup.btn'))}</span></button>
      <button class="row" data-act="pdf">${icon('pdf', '#0ea5e9')}<span class="t">${esc(t('tools.pdf'))}</span></button>
      <button class="row" data-act="diagnose">${icon('export', '#0ea5e9')}<span class="t">${esc(t('diag.title'))}</span></button>
      <label class="row">${icon('refresh', '#0ea5e9')}<span class="t">${esc(t('restore.title'))}</span><span class="chev">›</span>
        <input type="file" id="restoreFile" accept=".json,application/json" class="hidden"></label>
      <button class="row" data-act="refresh">${icon('refresh', '#0ea5e9')}<span class="t">${esc(t('ui.refresh'))}</span></button>
    </div>` : ''}
    ${usb ? `<div class="group" style="margin-top:22px"><button class="row danger" data-act="disconnect">${esc(t('ui.disconnect'))}</button></div>` : ''}`;
}
$('moreList').addEventListener('click', async (e) => {
  const open = e.target.closest('[data-open]');
  if (open) return openPage(open.dataset.open);
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'legal') showDisclaimer();
  else if (act === 'pdf') openPage('pdf');
  else if (act === 'diagnose') openPage('diagnose');
  else if (act === 'backup') manualBackup();
  else if (act === 'refresh') { try { await refresh(); } catch (err) { await disconnect(); toast(t('msg.readError', { error: err.message }), 'err'); } }
  else if (act === 'disconnect') { await disconnect(); toast(t('msg.disconnected')); }
});
// Wiederherstellen: nur Backups vom selben Rad; danach wie jede Änderung bestätigen
$('moreList').addEventListener('change', async (e) => {
  if (e.target.id !== 'restoreFile') return;
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let b;
  try { b = parseBackup(await file.text()); } catch (err) { return toast(t('restore.unreadable', { error: err.message }), 'warn'); }
  if (!b.bikeId || b.bikeId !== val('motorBikeId')) return toast(t('restore.other'), 'err');
  propose(() => planRestore(S, b, val('modeNames') ?? []));
});

function renderAll() {
  renderHead();
  renderHome();
  renderSettings();
  renderMore();
}

// ---------- Blätter (Unterseiten) ----------

// Stapel: Fahrmodi → einzelner Modus; „Zurück“ geht eine Ebene hoch
const stack = [];
function openPage(name, arg) {
  if (!rows.length && name !== 'legal') return toast(t('ui.notConnected'), 'warn');
  stack.push({ name, arg });
  drawPage();
  $('sheet').classList.add('open');
}
function drawPage() {
  const { name, arg } = stack[stack.length - 1];
  const page = PAGES[name](arg);
  $('sheetTitle').textContent = page.title;
  $('sheetBack').textContent = stack.length > 1 ? `‹ ${t('ui.back')}` : t('ui.close');
  $('sheetBody').innerHTML = page.html;
  $('sheetBody').scrollTop = 0;
  page.bind?.();
}
function closePage() { stack.length = 0; $('sheet').classList.remove('open'); }
$('sheetBack').onclick = () => { stack.pop(); if (stack.length) drawPage(); else closePage(); };
$('sheet').addEventListener('click', (e) => { if (e.target === $('sheet')) closePage(); });

// Liste aus [Bezeichnung, Wert, Erklärung, Farbklasse]; leere Einträge (false/null) werden übersprungen
const infoGroup = (items) => `<div class="group noico">${items.filter(Boolean).map(([k, v, hint, cls = '']) => `<div class="row static"><span class="t">
  <small>${esc(k)}</small><span class="${cls}" style="font-weight:600;display:block">${esc(v)}</span>${hint ? `<small>${esc(hint)}</small>` : ''}</span></div>`).join('')}</div>`;
const locked = (cond) => (cond ? `<div class="alert">${esc(t('ui.locked'))}</div>` : '');
const saveBtn = (id = 'save', disabled = false) => `<button class="btn-big" id="${id}"${disabled ? ' disabled' : ''}>${esc(t('ui.save'))}</button>`;

// Plan bauen → bei „nichts zu tun“ Meldung, sonst Bestätigung zeigen
function propose(fn) {
  let plan;
  try { plan = fn(); } catch (e) { return toast(e.message, 'warn'); }
  if (!plan.steps.length) return toast(t('msg.noChange'), 'ok');
  if (blocked) return toast(t('msg.abort', { error: '' }), 'err');
  // Verbindung zwischendurch verloren (Rad aus, Kabel, Lebenszeichen): angezeigte Werte sind alt, nichts vorschlagen
  if (!reader) return toast(t('msg.hbLost'), 'warn');
  pending = { plan, state: S };
  $('confirmPlan').textContent = plan.title;
  $('confirmList').innerHTML = plan.steps.map((s) => `<div class="row static"><span class="t">${esc(s.label ?? dpLabel(s.key))}
    <span class="chg"><span class="b">${esc(s.before)}</span><span class="a">${esc(s.after)}</span></span></span></div>`).join('');
  $('confirmWarn').innerHTML = plan.warnings.map((w) => `<div class="alert">${esc(w)}</div>`).join('');
  $('confirmText').textContent = t(demo ? 'ui.confirmDemo' : 'ui.confirmText');
  $('confirmSheet').classList.add('open');
}
$('confirmCancel').onclick = () => { pending = null; $('confirmSheet').classList.remove('open'); toast(t('msg.cancelled')); };

// Fehlerspeicher löschen (Beta): verifizierter Befehl (DELETE_ALL_ISSUES), Sequenz je ECU, nur Geräte mit Einträgen.
function saveFaultSnapshot() {
  // clearable=false (ABS, ConnectModule) kommt mit in den Export, markiert als „nicht löschbar" – nicht weglassen.
  const snap = { tool: 'SelfBike', createdAt: new Date().toISOString(),
    faults: faults.map((e) => ({ component: e.component, address: e.address, status: e.status, clearable: isClearable(e.address), faults: e.faults })) };
  const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `selfbike-fehlerspeicher-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
// Ausgewählte Fehler löschen. Ablauf je ECU zwingend:
//   BLOCK_REPORTING (0) → DELETE_ISSUE je Code → IM BLOCKIERTEN Zustand zurücklesen → UNBLOCK_REPORTING (1).
// Das Rücklesen muss vor UNBLOCK passieren: aktive Fehler melden sich sonst sofort wieder und ein
// funktionierender Clear sähe wie ein Fehlschlag aus. Danach Finalblick (entblockt) → wieder aktive Codes.
async function deleteSelectedFaults(items) {
  if (!reader || !items.length) return;
  saveFaultSnapshot(); // Historie zuerst sichern
  const order = CLEAR_TARGETS.map((x) => x.address);
  const byEcu = new Map();
  for (const it of items) { if (!byEcu.has(it.addr)) byEcu.set(it.addr, []); byEcu.get(it.addr).push(it.code); }
  const addrs = [...byEcu.keys()].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  enableClear(addrs);
  const blockedPresent = {}; // addr → Set(Codes, die im blockierten Zustand noch da sind)
  const blocked = new Set(); // welche ECU gerade blockiert ist (für sicheres Entblocken in finally)
  let gate = false; let encErr = false; // NO_ACCESS(op 5)/DENIED(transp 6) · INVALID_VALUE(7)/MALFORMED(8)
  try {
    for (const addr of addrs) {
      const src = FAULT_SOURCES.find((s) => s.address === addr) || { component: '', address: addr };
      await reader.request(addr, RPC, clearPayload(CMD.BLOCK_REPORTING));
      blocked.add(addr);
      for (const code of byEcu.get(addr)) {
        try {
          const r = await reader.request(addr, RPC, deleteIssuePayload(code));
          if (r.status === 6) gate = true;                 // Transport DENIED
          if (r.status === 7 || r.status === 8) encErr = true; // Transport INVALID_VALUE/MALFORMED
          const rv = r.payload ? decodeFaultReply(Array.from(r.payload)).returnValue : 0;
          if (rv === 5) gate = true;                        // Operation NO_ACCESS = Gate
        } catch (e) { log(`Clear ${addr} ${code}: ${e.message}`); }
      }
      const after = await readFaultSource(reader, src); // Wahrheit: im blockierten Zustand
      blockedPresent[addr] = new Set((after.faults || []).map((f) => f.code));
      await reader.request(addr, RPC, clearPayload(CMD.UNBLOCK_REPORTING));
      blocked.delete(addr);
    }
    faults = await readFaults(reader); // Finalblick (entblockt)
    renderAll();
    if (stack.length && stack[stack.length - 1].name === 'faults') drawPage();
    const finalByAddr = Object.fromEntries(faults.map((f) => [f.address, new Set((f.faults || []).map((x) => x.code))]));
    let deleted = 0; let reappeared = 0;
    for (const it of items) {
      if (!blockedPresent[it.addr]?.has(it.code)) { deleted++; if (finalByAddr[it.addr]?.has(it.code)) reappeared++; }
    }
    if (encErr) toast(t('clr.encErr'), 'err');
    else if (!deleted && gate) toast(t('clr.denied'), 'err');
    else if (!deleted) toast(t('clr.none'), 'warn');
    else toast(reappeared ? t('clr.doneActive', { n: deleted, a: reappeared }) : t('clr.selDone', { n: deleted }), 'ok');
  } catch (e) {
    toast(t('msg.readError', { error: e.message }), 'err');
  } finally {
    // Jede noch blockierte ECU MUSS entblockt werden (Timeout/Abbruch), sonst zeichnet das Rad keine
    // neuen Fehler mehr auf. Vor disableClear(), solange der Guard den Befehl noch durchlässt.
    for (const addr of blocked) {
      try { await reader.request(addr, RPC, clearPayload(CMD.UNBLOCK_REPORTING)); }
      catch (e) { log(`UNBLOCK ${addr} fehlgeschlagen: ${e.message}`); }
    }
    disableClear();
  }
}

// Akku-Pipeline-Selbsttest (ohne Sperre, alle Ziele bleiben frei): DELETE_ALL gegen den LEEREN Akku-Speicher
// muss SUCCESS liefern (ENTRY_COUNT 0). Bestätigt die Befehls-Pipeline dort und schließt eine versteckte
// Vorbedingung aus. NO_ACCESS = der Akku gatet anders. Nur anbieten, wenn der Akku keine Einträge hat (no-op).
async function akkuSelfTest() {
  if (!reader) return;
  const addr = 169;
  saveFaultSnapshot();
  enableClear([addr]);
  let blocked = false;
  try {
    await reader.request(addr, RPC, clearPayload(CMD.BLOCK_REPORTING)); blocked = true;
    const r = await reader.request(addr, RPC, clearPayload(CMD.DELETE_ALL_ISSUES));
    const d = r.payload ? decodeFaultReply(Array.from(r.payload)) : {};
    await reader.request(addr, RPC, clearPayload(CMD.UNBLOCK_REPORTING)); blocked = false;
    faults = await readFaults(reader); renderAll();
    if (stack.length && stack[stack.length - 1].name === 'faults') drawPage();
    if (r.status === 0 && d.returnValue === 0) toast(t('clr.selfTestOk', { n: d.entryCount ?? 0 }), 'ok');
    else if (d.returnValue === 5 || r.status === 6) toast(t('clr.selfTestGate'), 'warn');
    else toast(t('clr.selfTestFail', { s: `${r.statusName || r.status} / rv ${d.returnValue ?? '?'}` }), 'err');
  } catch (e) {
    toast(t('msg.readError', { error: e.message }), 'err');
  } finally {
    if (blocked) { try { await reader.request(addr, RPC, clearPayload(CMD.UNBLOCK_REPORTING)); } catch (e) { log(`UNBLOCK 169: ${e.message}`); } }
    disableClear();
  }
}

const PAGES = {
  light() {
    const can = val('lightOem')?.configurable === true;
    const cur = val('lightMode');
    const w = ok('lightPower') ? val('lightPower') : 1;
    // Bestätigung nur, wenn die Leistung wirklich geschrieben wird (geändert oder Licht noch nicht freigeschaltet)
    const powerFixed = ok('lightPower') && val('lightAvailable') === true;
    const powerChanged = () => !powerFixed || Math.round(Number($('lw').value) * 10) !== Math.round(w * 10);
    return {
      title: t('light.title'),
      html: `<p class="explain">${esc(t('ui.lightExplain'))}</p>
        <div class="group noico" style="margin-top:12px" id="lmList">${[1, 2, 3, 4].map((n) =>
          `<button class="row${cur === n ? ' sel' : ''}" data-mode="${n}"${can ? '' : ' disabled'}><span class="t">${esc(LIGHT_MODES[n])}</span><span class="check">✓</span></button>`).join('')}</div>
        <p class="gh">${esc(t('ui.lightPower'))}</p>
        <div class="group noico">
          <div class="row static"><span class="t">${esc(t('ui.watts'))}</span>
            <span class="stepper"><button data-step="-0.5" aria-label="−">−</button><input id="lw" type="number" min="1" max="18" step="0.1" value="${esc(w)}"${can ? '' : ' disabled'}><span>W</span><button data-step="0.5" aria-label="+">+</button></span></div>
          <label class="row${powerFixed ? ' hidden' : ''}" id="lampsRow"><span class="t" style="font-size:15px">${esc(t('ui.lampsOk'))}</span><input type="checkbox" class="sw" id="lampsOk"${can ? '' : ' disabled'}></label>
        </div>
        <p class="foot">${esc(t('ui.lightPowerHint'))}</p>
        ${locked(!can)}${saveBtn('save', !can)}`,
      bind() {
        let mode = cur >= 1 && cur <= 4 ? cur : 3;
        $('lmList').onclick = (e) => {
          const b = e.target.closest('[data-mode]'); if (!b) return;
          mode = Number(b.dataset.mode);
          for (const r of $('lmList').children) r.classList.toggle('sel', r === b);
        };
        for (const b of $('sheetBody').querySelectorAll('[data-step]')) b.onclick = () => {
          const v = Math.round((Number($('lw').value) + Number(b.dataset.step)) * 10) / 10;
          $('lw').value = Math.max(1, Math.min(18, v));
          $('lampsRow').classList.toggle('hidden', !powerChanged());
        };
        $('lw').oninput = () => $('lampsRow').classList.toggle('hidden', !powerChanged());
        $('save').onclick = () => {
          if (powerChanged() && !$('lampsOk').checked) return toast(t('msg.lampsFirst'), 'warn');
          propose(() => planLight(S, { mode, watts: Number($('lw').value) }));
        };
      },
    };
  },

  service() {
    return {
      title: t('svc.title'),
      html: `<p class="explain">${esc(t('ui.svcExplain'))}</p>
        <div class="group noico" style="margin-top:12px"><div class="row static"><span class="t">${esc(t('ui.svcNow'))}</span><span class="v">${esc(txt('serviceDue'))}</span></div></div>
        <p class="gh">${esc(t('ui.svcNew'))}</p>
        <div class="group noico">
          <label class="row"><span class="t">${esc(t('ui.svcByKm'))}</span><input type="checkbox" class="sw" id="byKm" checked></label>
          <div class="row static" id="kmRow"><span class="t">${esc(t('ui.svcInKm'))}<small id="kmTarget"></small></span><input class="numin" id="kmIn" type="number" min="1" max="100000" step="100" value="1500"></div>
          <label class="row"><span class="t">${esc(t('ui.svcByDate'))}</span><input type="checkbox" class="sw" id="byDate"></label>
          <div class="row static hidden" id="dateRow"><span class="t">${esc(t('ui.svcDate'))}</span><input class="numin" id="dateIn" type="date"></div>
        </div>
        ${saveBtn()}
        <button class="btn-text red" id="del">${esc(t('ui.svcDelete'))}</button>`,
      bind() {
        const upd = () => {
          $('kmRow').classList.toggle('hidden', !$('byKm').checked);
          $('dateRow').classList.toggle('hidden', !$('byDate').checked);
          const add = Number($('kmIn').value);
          $('kmTarget').textContent = ok('odometer') && add > 0 ? t('svc.target', { km: km(val('odometer') + add * 1000) }) : '';
        };
        $('byKm').onchange = upd; $('byDate').onchange = upd; $('kmIn').oninput = upd; upd();
        $('save').onclick = () => {
          let odometer = 0; let timestamp = 0;
          if ($('byKm').checked) {
            const add = Number($('kmIn').value);
            if (!Number.isInteger(add) || add < 1) return toast(t('msg.kmInt'), 'warn');
            if (!ok('odometer')) return toast(t('msg.odoUnreadable'), 'warn');
            odometer = val('odometer') + add * 1000;
          }
          if ($('byDate').checked) {
            const [y, mo, d] = $('dateIn').value.split('-').map(Number);
            if (!y) return toast(t('msg.chooseDate'), 'warn');
            timestamp = Date.UTC(y, mo - 1, d) / 1000;
          }
          if (!odometer && !timestamp) return toast(t('msg.chooseKmOrDate'), 'warn');
          propose(() => planService(S, { timestamp, odometer }));
        };
        $('del').onclick = () => propose(() => planService(S, { timestamp: 0, odometer: 0 }));
      },
    };
  },

  display() {
    const opts = (list, cur) => {
      const all = cur != null && !list.some((o) => String(o.value) === String(cur)) ? [{ value: cur, text: String(cur) }, ...list] : list;
      return all.map((o) => `<option value="${esc(o.value)}"${String(o.value) === String(cur) ? ' selected' : ''}>${esc(o.text)}</option>`).join('');
    };
    const startLocked = val('startModeOem')?.configurable !== true;
    const walkLocked = !ok('walkAssist') || val('walkAssistOem')?.configurable !== true;
    return {
      title: t('disp.title'),
      html: `<p class="explain">${esc(t('ui.dispExplain'))}</p>
        <div class="group noico" style="margin-top:12px">
          <label class="row"><span class="t">${esc(t('disp.start'))}</span><select id="dStart"${startLocked ? ' disabled' : ''}>${opts(startModeOptions(val('modeNames') ?? []), val('startMode'))}</select></label>
          <label class="row"><span class="t">${esc(t('disp.lang'))}</span><select id="dLang">${opts(DISPLAY_LANGUAGES.map((c) => ({ value: c, text: LANGS[c] })), val('displayLanguage'))}</select></label>
          <label class="row"><span class="t">${esc(t('disp.units'))}</span><select id="dUnits">${opts([{ value: 0, text: t('disp.metric') }, { value: 1, text: t('disp.imperial') }], val('displayUnits'))}</select></label>
          <label class="row"><span class="t">${esc(t('disp.timeFormat'))}</span><select id="dTime">${opts([{ value: 0, text: t('disp.h24') }, { value: 1, text: t('disp.h12') }], val('timeFormat'))}</select></label>
        </div>
        <div class="group noico" style="margin-top:14px">
          <label class="row"><span class="t">${esc(t('disp.walk'))}<small>${esc(t('ui.walkHint'))}</small></span><input type="checkbox" class="sw" id="dWalk"${val('walkAssist')?.enabled ? ' checked' : ''}${walkLocked ? ' disabled' : ''}></label>
          <label class="row"><span class="t">${esc(t('ui.clock'))}<small>${esc(`${t('disp.clock')}: ${txt('bikeClock')}`)}</small></span><input type="checkbox" class="sw" id="dClock"${ok('bikeClock') ? '' : ' disabled'}></label>
        </div>
        ${saveBtn()}`,
      bind() {
        $('save').onclick = () => propose(() => planDisplay(S, {
          startMode: Number($('dStart').value), language: $('dLang').value,
          displayUnits: Number($('dUnits').value), timeFormat: Number($('dTime').value), setClock: $('dClock').checked,
          walkAssist: ok('walkAssist') ? $('dWalk').checked : null,
        }, val('modeNames') ?? []));
      },
    };
  },

  // Power Ports an/aus – nur wenn der Hersteller den Port als „änderbar“ freigibt, sonst nur Anzeige
  ports() {
    const oem = val('portOem') ?? {};
    const row = (id, key, configurable) => `<label class="row"><span class="t">${esc(t(`dp.${key}`))}
      <small class="${configurable ? 'good' : ''}">${esc(t(configurable ? 'ports.changeable' : 'ports.locked'))}</small></span>
      <input type="checkbox" class="sw" id="${id}"${val(key) ? ' checked' : ''}${ok(key) && configurable ? '' : ' disabled'}></label>`;
    const any = oem.lowConfigurable || oem.highConfigurable;
    return {
      title: t('ports.title'),
      html: `<p class="explain">${esc(t('ports.explain'))}</p>
        <div class="alert" style="margin-top:12px">${esc(t('ports.beta'))}</div>
        <div class="group noico" style="margin-top:12px">
          ${row('pLow', 'lowPortActive', oem.lowConfigurable)}
          ${row('pHigh', 'highPortActive', oem.highConfigurable)}
        </div>
        <p class="foot">${esc(t('ports.hint'))}</p>
        ${locked(!any)}${saveBtn('save', !any)}`,
      bind() {
        if (any) $('save').onclick = () => propose(() => planPorts(S, {
          low: ok('lowPortActive') && oem.lowConfigurable ? $('pLow').checked : null,
          high: ok('highPortActive') && oem.highConfigurable ? $('pHigh').checked : null,
        }));
      },
    };
  },

  // Akku-Ladefenster (SoC-Grenzen) – Beta. Verschiebt nur, wo die Software „leer"/„voll" ansetzt.
  // Vor dem Speichern müssen die Hinweise ausdrücklich bestätigt werden.
  soc() {
    const canRead = ok('socMin') && ok('socMax');
    // Rad verweigert das Lesen (Status 6/2), aber das Feld gibt es laut Protokoll → Schreibversuch erlauben, Ergebnis unbestätigt
    const readDenied = !canRead && (denied('socMin') || denied('socMax'));
    const usable = canRead || readDenied;
    const curMin = ok('socMin') ? val('socMin') : 5;
    const curMax = ok('socMax') ? val('socMax') : 100;
    return {
      title: t('soc.title'),
      html: `<p class="explain">${esc(t('soc.explain'))}</p>
        <div class="alert" style="margin-top:12px">${esc(t('soc.beta'))}</div>
        ${readDenied ? `<div class="alert">${esc(t('soc.readDenied'))}</div>` : ''}
        ${ok('batterySoc') ? `<p class="foot" style="margin-top:12px">${esc(t('soc.nowCharge', { soc: fmtNum(val('batterySoc'), 0) }))}</p>` : ''}
        <div class="group noico" style="margin-top:12px">
          <div class="row static"><span class="t">${esc(t('soc.max'))}<small>${esc(t('soc.maxHint'))}</small></span>
            <input class="numin" id="socMax" type="number" min="0" max="100" step="1" value="${esc(curMax)}"${usable ? '' : ' disabled'}></div>
          <div class="row static"><span class="t">${esc(t('soc.min'))}<small>${esc(t('soc.minHint'))}</small></span>
            <input class="numin" id="socMin" type="number" min="0" max="100" step="1" value="${esc(curMin)}"${usable ? '' : ' disabled'}></div>
        </div>
        <p class="gh">${esc(t('soc.tipsTitle'))}</p>
        <div class="group noico"><div class="row static"><span class="t" style="font-weight:400">${t('soc.tips')}</span></div></div>
        ${usable ? `<label class="row" id="socAckRow"><span class="t" style="font-size:15px">${esc(t('soc.ack'))}</span><input type="checkbox" class="sw" id="socAck"></label>`
          : `<div class="alert">${esc(t('soc.unavailable'))}</div>`}
        <p class="foot">${esc(t('soc.hint'))}</p>
        ${saveBtn('save', !usable)}`,
      bind() {
        if (!usable) return;
        $('save').onclick = () => {
          if (!$('socAck').checked) return toast(t('soc.ackFirst'), 'warn');
          propose(() => planSoc(S, { min: Number($('socMin').value), max: Number($('socMax').value) }));
        };
      },
    };
  },

  // Akku: oben der Akku-Check mit Bewertung, darunter die übrigen Werte (Gesundheit, Zyklen,
  // Tiefentladung und Überhitzung stehen schon im Check)
  battery() {
    return {
      title: t('more.battery'),
      html: `${PAGES.batterycheck().html}<p class="gh">${esc(t('more.battery'))}</p>${infoGroup([
        [t('bat.soc'), txt('batterySoc'), t('bat.socHint')],
        [t('bat.remaining'), txt('batteryRiderWh'), t('bat.remainingHint')],
        ok('batteryCapacityAh') && [t('more.capacity'), txt('batteryCapacityAh'), ok('batteryDeliveredAh') ? t('more.delivered', { ah: txt('batteryDeliveredAh'), wh: txt('batteryEnergy') }) : ''],
        ok('batteryVoltage') && [t('more.voltage'), txt('batteryVoltage'), ok('batteryMaxCurrent') ? t('more.maxCurrent', { a: txt('batteryMaxCurrent') }) : ''],
        ok('batteryTempNow') && [t('more.tempNow'), `${txt('batteryTempNow')} · ${txt('batteryFetTemp')}`, t('more.tempNowHint')],
        ok('batterySelfDischarge') && [t('more.selfDischarge'), txt('batterySelfDischarge'), ''],
        [t('bat.model'), withProductName(txt('batteryProduct')), ''],
      ])}`,
    };
  },

  // Akku-Check: Faustregeln aus den Akkuwerten (lib/care.js) – Teil der Akku-Seite
  batterycheck() {
    const deg = (x) => `${fmtNum(x, 1)} °C`;
    const shown = {
      soh: (c) => `${c.vars.v} %`, deep: (c) => String(c.vars.n), thermal: () => txt('batteryThermal'),
      hot: (c) => deg(c.vars.v), cold: (c) => deg(c.vars.v), charge: (c) => deg(c.vars.v), store: (c) => `${c.vars.v} %`,
      cycles: (c) => (c.vars.size ? t('bc.usage.value', { n: fmtNum(c.vars.n, 1) }) : txt('batteryCycles')),
    };
    // Ladezyklen: Einstufung statt „gut/Tipp“ und die Rechnung als Hinweis (siehe fullCycles in care.js)
    const state = (c) => (c.vars.lvl ? t(`bc.cycles.lvl.${c.vars.lvl}`) : t(`bc.state.${c.state}`));
    const hint = (c) => (c.id === 'cycles' && c.vars.size
      ? [t('bc.cycles.calc', { used: fmtNum(c.vars.used, 0), size: fmtNum(c.vars.size, 0), n: fmtNum(c.vars.n, 1) }),
        c.vars.raw != null ? t('bc.cycles.raw', { n: fmtNum(c.vars.raw, 1) }) : ''].filter(Boolean).join(' ')
      : t(`bc.${c.id}.${c.state}`, { v: shown[c.id](c), n: c.vars.n }));
    const cls = { ok: 'good', warn: 'warn', bad: 'bad', info: '' };
    const checks = batteryChecks(val);
    const issues = checks.filter((c) => c.state === 'warn' || c.state === 'bad').length;
    return {
      title: t('bc.title'),
      html: checks.length ? `<p class="explain ${issues ? 'warn' : 'good'}" style="font-weight:600">${esc(t(issues ? 'bc.someWarn' : 'bc.allOk', { n: issues }))}</p>
        <div style="margin-top:10px">${infoGroup(checks.map((c) => [t(c.id === 'cycles' && c.vars.size ? 'bc.usage' : `bc.${c.id}`),`${shown[c.id](c)} · ${state(c)}`, hint(c), cls[c.state]]))}</div>
        <p class="foot">${esc(t('bc.note'))}</p>` : `<p class="explain">${esc(t('tile.unreadable'))}</p>`,
    };
  },

  // Reichweite: Verbrauch aus der Fahrstatistik des Rads bzw. dem Verlauf
  range() {
    const r = rangeEstimate(val, historyFor(val('motorBikeId')));
    return {
      title: t('rg.title'),
      html: r.now == null ? `<p class="explain">${esc(t('rg.none'))}</p>` : `<div class="tiles" style="margin-top:0">
          <div class="tile"><div class="k">${esc(t('rg.now'))}</div><div class="n">${esc(fmtNum(r.now, 0))}<small>km</small></div></div>
          <div class="tile"><div class="k">${esc(t('rg.full'))}</div><div class="n">${r.full ? esc(fmtNum(r.full, 0)) : '–'}<small>km</small></div></div></div>
        <p class="explain" style="margin-top:12px">${esc(t('rg.basis', { v: fmtNum(r.whkm, 1), wh: `${fmtNum(r.usable, 0)} Wh`,
          src: r.source.kind === 'bike' ? t('rg.srcBike', { km: km(r.source.km * 1000, 0) }) : t('rg.srcHist') }))}</p>
        <p class="foot">${esc(t('rg.hint'))}</p>`,
    };
  },

  // Mehr Details: Bauteil-Alter, eShift, ABS, Sonstiges
  details() {
    const ageText = (key) => {
      const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(txt(key, ''));
      if (!m) return null;
      const months = Math.max(0, Math.round((Date.now() - new Date(+m[3], +m[2] - 1, +m[1])) / (30.44 * 86400000)));
      return [txt(key), months < 24 ? t('more.months', { n: months }) : t('more.years', { n: fmtNum(months / 12, 1) })];
    };
    const ages = [['comp.motor', 'motorMade'], ['comp.battery', 'batteryMade'], ['comp.controller', 'controllerMade'], ['fault.ABS', 'absMade']]
      .map(([label, key]) => { const a = ageText(key); return a ? [t(label), a[0], a[1]] : null; });
    const wheelSame = ok('wheelOem') && ok('wheelUser') && val('wheelOem') === val('wheelUser');
    const section = (title, items) => (items.some(Boolean) ? `<p class="gh">${esc(title)}</p>${infoGroup(items)}` : '');
    return {
      title: t('more.title'),
      html: [
        section(t('more.ages'), ages),
        ages.some(Boolean) ? `<p class="foot">${esc(t('more.warrantyHint'))}</p>` : '',
        ok('gearCount') ? section(t('more.eshift'), [
          [t('more.gears'), txt('gearCount'), ok('gearNow') ? t('more.gearNow', { g: txt('gearNow') }) : ''],
          ok('gearCadence') && [t('more.cadence'), txt('gearCadence'), ok('gearCadenceLimits') ? t('more.cadenceRange', { r: txt('gearCadenceLimits') }) : ''],
        ]) : '',
        ok('absName') ? section(t('fault.ABS'), [
          [t('more.absProduct'), txt('absName'), t('abs.mode', { m: txt('absMode') })],
          ok('absModes') && [t('more.absModes'), txt('absModes'), ''],
          ok('absDisc') && [t('more.absDisc'), txt('absDisc'), ''],
          ok('absUpdates') && [t('more.absUpdates'), txt('absUpdates'), `Software ${txt('absSoftware')}`],
        ]) : '',
        section(t('more.other'), [
          ok('rangeExtender') && [t('more.powerMore'), t(val('rangeExtender') ? 'word.yes' : 'word.no'), t('more.powerMoreHint')],
          ok('wheelOem') && [t('more.wheel'), `${txt('wheelUser')} · ${t(wheelSame ? 'more.factory' : 'more.changed')}`, t('more.wheelHint', { w: txt('wheelOem') }), wheelSame ? '' : 'warn'],
          ok('startMode') && [t('more.startMode'), txt('startMode'), ''],
          ok('bikeCategory') && [dpLabel('bikeCategory'), txt('bikeCategory'), ''],
          ok('maxGearRatio') && [dpLabel('maxGearRatio'), txt('maxGearRatio'), ''],
          ok('motorCutOff') && [dpLabel('motorCutOff'), txt('motorCutOff'), ''],
          ok('speedTolerance') && [dpLabel('speedTolerance'), txt('speedTolerance'), ''],
          ok('walkAssist') && [t('disp.walk'), txt('walkAssist'), ''],
          ok('oemBikeNumber') && txt('oemBikeNumber', '') && [t('more.bikeNumber'), txt('oemBikeNumber').trim(), t('more.bikeNumberHint')],
        ]),
      ].join(''),
    };
  },

  faults() {
    const body = faults.map((f) => {
      let inner;
      if (f.status === 'none') inner = `<div class="fault"><span>${esc(t('fault.notInstalled'))}</span></div>`;
      else if (f.status !== 'ok') inner = `<div class="fault"><span>${esc(t('fault.unreadable'))}</span></div>`;
      else if (!f.faults.length) inner = `<div class="fault"><span class="good">${esc(t('fault.none'))}</span></div>`;
      else inner = bySeverity(f.faults, (e) => lookupIssue(e.code ?? 0, lang())?.s || describeFault(e.code).sev).map((e) => {
        const info = lookupIssue(e.code ?? 0, lang());
        const code = codeHex(e.code);
        // Ohne Klartext vom Server: eigener Text aus data/fault-texts.csv, sonst Einordnung (Bereich + allgemeiner Hinweis)
        const cat = describeFault(e.code);
        const sev = info?.s || cat.sev;
        const sevTag = sev ? `<i class="sevtag sev-${esc(sev)}">${esc(t(`sev.${sev}`))}</i>` : '';
        const inner2 = `<b>${sevTag}${esc(info?.t || cat.title)}</b>
          <span>${esc(`${t('fault.code', { code })} · ${e.count ?? '?'}× · ${e.timestamp > 0 ? t('fault.last', { date: fmtDateTime(e.timestamp * 1000) }) : t('fault.noTime')}`)}</span>
          ${info?.d ? `<span style="margin-top:4px">${esc(info.d)}</span>` : ''}
          ${info?.m ? `<span style="margin-top:4px"><b style="display:inline">${esc(t('issues.measures'))}:</b> ${esc(info.m)}</span>`
            : `<span style="margin-top:4px">${cat.own ? '' : `<b style="display:inline">${esc(t('fcat.hint'))}:</b> `}${esc(cat.hint)}</span>`}`;
        // Häkchen nur, wenn das Steuergerät den Löschbefehl unterstützt (verifiziert). Sonst Anzeige + Hinweis.
        return reader && isClearable(f.address)
          ? `<label class="fault" style="display:flex;gap:10px;align-items:flex-start"><input type="checkbox" class="fsel" data-addr="${f.address}" data-code="${e.code}" style="width:auto;margin-top:3px"><span style="display:flex;flex-direction:column;flex:1">${inner2}</span></label>`
          : `<div class="fault">${inner2}${reader ? `<span style="color:var(--self-text-dim,#8a9cab);font-size:.85rem;margin-top:4px">${esc(t('clr.notSupported'))}</span>` : ''}</div>`;
      }).join('');
      // Bedieneinheit (RemoteControl 8485): Löschen trifft auch die Visualisierungsereignisse → LED-Hinweis.
      const ledWarn = reader && f.address === 8485 && f.status === 'ok' && f.faults.length ? `<p class="foot" style="color:var(--self-warn,#9a6700)">${esc(t('clr.ledWarn'))}</p>` : '';
      return `<p class="gh">${esc(t(`fault.${f.component}`))}</p>${ledWarn}<div class="group">${inner}</div>`;
    }).join('') + (faultCount() ? `<p class="foot">${esc(t('fcat.note'))}</p>` : '');
    const canClear = !!reader && faults.some((f) => isClearable(f.address) && f.status === 'ok' && f.faults.length);
    const akkuEmpty = !!reader && faults.some((f) => f.address === 169 && f.status === 'ok' && !f.faults.length);
    return {
      title: t('ui.faults'),
      html: `<p class="explain">${esc(t('ui.faultsExplain'))}</p>${body}` + (canClear ? `
        <p class="gh">${esc(t('clr.title'))}</p>
        <div class="group noico">
          <label class="row"><span class="t" style="font-size:15px">${esc(t('clr.selAll'))}</span><input type="checkbox" class="sw" id="selAll"></label>
        </div>
        <button class="btn-big" id="clrBtn" disabled style="background:#c62828;color:#fff">${esc(t('clr.btnNone'))}</button>
        <p class="foot">${esc(t('clr.hint'))}</p>` : '')
        + (akkuEmpty ? `<button class="btn-text" id="akkuTest" style="margin-top:10px">${esc(t('clr.selfTest'))}</button>` : ''),
      bind() {
        if ($('akkuTest')) $('akkuTest').onclick = () => akkuSelfTest();
        if (!canClear) return;
        const sels = () => [...$('sheetBody').querySelectorAll('.fsel')];
        const checked = () => sels().filter((c) => c.checked);
        let armed = false; // zweiter Klick bestätigt
        const upd = () => {
          const n = checked().length;
          const btn = $('clrBtn');
          if (!btn) return;
          btn.disabled = n === 0;
          btn.textContent = armed && n ? t('clr.confirm', { n }) : (n ? t('clr.btnN', { n }) : t('clr.btnNone'));
          if ($('selAll')) $('selAll').checked = sels().length > 0 && n === sels().length;
        };
        for (const c of sels()) c.onchange = () => { armed = false; upd(); };
        $('selAll').onchange = () => { for (const c of sels()) c.checked = $('selAll').checked; armed = false; upd(); };
        $('clrBtn').onclick = async () => {
          const items = checked().map((c) => ({ addr: Number(c.dataset.addr), code: Number(c.dataset.code) }));
          if (!items.length) return;
          if (!armed) { armed = true; upd(); setTimeout(() => { armed = false; upd(); }, 4000); return; }
          $('clrBtn').disabled = true;
          await deleteSelectedFaults(items);
        };
        upd();
      },
    };
  },

  components() {
    const model = txt('oemModel', '');
    const ver = (sw, hw, serial) => `${t('versions', { sw: txt(sw), hw: txt(hw) })} · ${t('comp.serial', { s: txt(serial) })}`;
    const tuning = val('tuning');
    const idOk = ok('motorBikeId') && val('motorBikeId') === val('controllerBikeId');
    const items = [
      [t('comp.bike'), `${txt('oemBrand')}${model ? ` ${model}` : ''}`, model ? '' : t('comp.modelMissing')],
      [t('comp.motor'), `${txt('motorName')} · ${txt('motorModel')}`, ver('motorFirmware', 'motorHardware', 'motorSerial')],
      [t('comp.battery'), withProductName(txt('batteryProduct')), ver('batterySoftware', 'batteryHardware', 'batterySerial')],
      ...(ok('battery2Product') ? [[t('comp.battery2'), withProductName(txt('battery2Product')), `${t('versions', { sw: txt('battery2Software'), hw: txt('battery2Hardware') })}${ok('battery2Soc') ? ` · ${t('comp.soc', { v: txt('battery2Soc') })}` : ''}`]] : []),
      [t('comp.controller'), withProductName(txt('controllerProduct')), ver('controllerSoftware', 'controllerHardware', 'controllerSerial')],
      ...(ok('headProduct') ? [[t('comp.display'), withProductName(txt('headProduct')), t('versions', { sw: txt('headSoftware'), hw: txt('headHardware') })]] : []),
      ...(ok('connectProduct') ? [[t('comp.connect'), withProductName(txt('connectProduct')), t('versions', { sw: txt('connectSoftware'), hw: txt('connectHardware') })]] : []),
      ...(ok('absName') ? [[t('fault.ABS'), txt('absName'), `${t('abs.mode', { m: txt('absMode') })} · Software ${txt('absSoftware')}`]] : []),
      ...(ok('gearCount') ? [[t('comp.shift'), t('comp.shiftVal'), `${t('comp.gears', { n: txt('gearCount') })}${ok('gearNow') ? ` · ${t('more.gearNow', { g: txt('gearNow') })}` : ''}`]] : []),
      [t('check.region'), txt('region'), ok('maxAssistSpeed') ? `${t('check.speed', { v: txt('maxAssistSpeed') })}${ok('maxLegalSpeed') ? ` · ${t('check.legal', { v: txt('maxLegalSpeed') })}` : ''}` : ''],
      [dpLabel('tuning'), txt('tuning'), t('check.tuningHint'), tuning ? (tuning.flag || tuning.counter ? 'bad' : 'good') : ''],
      ...(ok('speedManip') ? [[dpLabel('speedManip'), txt('speedManip'), '', val('speedManip')?.status ? 'bad' : 'good']] : []),
      [t('comp.bikeId'), t(idOk ? 'comp.idOk' : 'comp.idConflict'), '', idOk ? 'good' : 'bad'],
      [t('comp.lock'), t(val('lockEnabled') ? 'comp.lockOn' : 'comp.lockOff'), ''],
    ];
    return { title: t('comp.title'), html: infoGroup(items) };
  },
  // PDF-Bericht: hell (zum Ausdrucken) oder dunkel (Self-Stil)
  pdf() {
    const choice = (theme, bg, fg) => `<button class="row" data-theme="${theme}">
      <span class="ico" style="background:${bg};color:${fg};border:1px solid var(--self-line-strong)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS.pdf}</svg></span>
      <span class="t">${esc(t(`ui.pdf.${theme}`))}<small>${esc(t(`ui.pdf.${theme}Hint`))}</small></span><span class="chev">›</span></button>`;
    return {
      title: t('tools.pdf'),
      html: `<p class="explain">${esc(t('ui.pdf.ask'))}</p>
        <div class="group" style="margin-top:12px">${choice('light', '#ffffff', '#1f7763')}${choice('dark', '#0d1117', '#43d3ad')}</div>
        <p class="foot"><b>${esc(t('free.title'))}</b> ${esc(t('free.text'))} <a href="mailto:info@selfcoder.de">info@selfcoder.de</a></p>`,
      bind() {
        $('sheetBody').onclick = (e) => {
          const b = e.target.closest('[data-theme]');
          if (!b) return;
          const html = buildReportHtml(rows, { maskIds: false, name: [txt('oemBrand', ''), txt('oemModel', '')].join(' ').trim(), faults, theme: b.dataset.theme });
          const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
          if (!window.open(url, '_blank')) toast(t('msg.popup'), 'warn');
          setTimeout(() => URL.revokeObjectURL(url), 60000);
          closePage();
        };
      },
    };
  },
  stats() { return { title: t('ride.statsTitle'), html: statsHtml() }; },
  diagnose() {
    const n = diag.map.size;
    const btn = (id, label, cls = '') => `<button class="row${cls ? ' ' + cls : ''}" id="${id}"><span class="t">${esc(label)}</span></button>`;
    return {
      title: t('diag.title'),
      html: `<p class="explain">${esc(t('diag.explain'))}</p>
        <p class="gh">${esc(t('diag.step1'))}</p>
        <div class="group noico">
          <button class="btn-big" id="diagRun"${diag.busy ? ' disabled' : ''}>${esc(t('diag.run'))}</button>
        </div>
        <p class="foot">${esc(t('diag.runHint'))}</p>
        <p class="gh">${esc(t('diag.partsTitle'))}</p>
        <p class="explain" style="margin-top:0">${esc(t('diag.partsHint'))}</p>
        <div class="group noico" id="diagBands">
          ${DIAG_BANDS.map((b) => `<button class="row" data-band="${b.key}"><span class="t">${esc(t('diag.band.' + b.key))}<small>${esc(t('diag.bandRange', { from: b.from, to: b.to }))}</small></span></button>`).join('')}
        </div>
        <p class="gh">${esc(t('diag.fullTitle'))}</p>
        <div class="group noico">
          ${btn('diagFull', t('diag.full'))}
        </div>
        <p class="foot">${esc(t('diag.fullHint'))}</p>
        <p class="gh">${esc(t('diag.manualTitle'))}</p>
        <div class="group noico">
          <div class="row static"><span class="t">${esc(t('diag.range'))}</span>
            <span class="stepper"><input id="diagFrom" type="number" min="0" max="32767" value="0" style="width:74px"><span>–</span><input id="diagTo" type="number" min="0" max="32767" value="300" style="width:74px"></span></div>
          ${btn('diagScan', t('diag.scan'))}
        </div>
        <div class="group noico"><button class="row hidden" id="diagStop"><span class="t">${esc(t('diag.stop'))}</span></button></div>
        <p id="diagStatus" class="foot">${n ? esc(t('diag.have', { n })) : ''}</p>
        <div class="group noico" id="diagActions"${n ? '' : ' style="display:none"'}>
          ${btn('diagSave', t('diag.save'))}
          ${btn('diagCopy', t('diag.copy'))}
          ${btn('diagClear', t('diag.clear'), 'danger')}
        </div>
        <p class="foot">${esc(t('diag.send'))} <a href="mailto:info@selfcoder.de">info@selfcoder.de</a></p>`,
      bind() {
        $('diagRun').onclick = diagRunKnown;
        $('diagScan').onclick = diagRunScan;
        $('diagFull').onclick = diagRunFull;
        for (const b of document.querySelectorAll('#diagBands button')) {
          b.onclick = () => { const band = DIAG_BANDS.find((x) => x.key === b.dataset.band); if (band) diagScanRange(band.from, band.to); };
        }
        $('diagStop').onclick = () => { diag.stop = true; };
        const save = $('diagSave'); if (save) save.onclick = () => downloadTextFile(`selfbike-diagnose-${VERSION}.txt`, diagText());
        const copy = $('diagCopy'); if (copy) copy.onclick = async () => { try { await navigator.clipboard.writeText(diagText()); toast(t('diag.copied'), 'ok'); } catch { toast(t('diag.copyFail'), 'warn'); } };
        const clear = $('diagClear'); if (clear) clear.onclick = () => { diag.map.clear(); redrawDiag(); };
      },
    };
  },
};

// ---------- Ändern: Backup → prüfen → schreiben → zurücklesen ----------

const RING = 2 * Math.PI * 58;
function ring(f, kind = '') {
  const v = Math.max(0, Math.min(1, f));
  $('ringArc').style.strokeDashoffset = `${RING * (1 - v)}`;
  $('ringArc').style.stroke = kind === 'err' ? 'var(--self-red)' : kind === 'warn' ? 'var(--self-yellow)' : 'var(--self-teal-bright)';
  $('ringPct').textContent = `${Math.round(v * 100)}%`;
}
function progStatus(text, kind = '') { $('progStatus').textContent = text; $('progStatus').className = `status ${kind}`; }
function progDone(kind) {
  if (kind === 'ok') ring(1);
  else $('ringArc').style.stroke = kind === 'err' ? 'var(--self-red)' : 'var(--self-yellow)';
  $('progKofi').classList.toggle('hidden', kind !== 'ok');
  $('progDone').classList.remove('hidden');
}
$('progDone').onclick = () => { $('progSheet').classList.remove('open'); closePage(); };

// onStatus: Fortschritt für die Anzeige (Speicherort wählen, dann „lese n/gesamt“)
async function saveBackup(change, onStatus = () => {}) {
  if (!demo) onStatus(t('msg.backupWhere'));
  const handle = demo ? null : await pickBackupFile(backupFileName({ createdAt: new Date().toISOString() }));
  // Während der Dateiauswahl kann die Verbindung abbrechen
  if (!reader) throw new Error(t('msg.hbLost'));
  const fresh = await readAll(reader, (row, i, total) => onStatus(`${t('msg.backupReading')} ${i + 1}/${total}`));
  const backup = createBackup(fresh, change);
  if (demo) return { backup, fresh, saved: { name: t('demo.backupName'), method: 'demo' } };
  const saved = await writeBackupFile(backup, handle);
  if (saved.method === 'download' && !confirm(t('msg.backupConfirmDownload', { name: saved.name }))) throw new Error(t('msg.backupNotConfirmed'));
  return { backup, fresh, saved };
}

// Nach einer Änderung nicht alles neu auslesen: Grundlage ist der frische Stand aus dem Backup,
// neu gelesen werden nur die geänderten Werte.
async function refreshChanged(plan, fresh) {
  rows = fresh.slice();
  for (const key of new Set(plan.steps.filter((s) => !s.write).map((s) => s.key))) {
    const i = rows.findIndex((r) => r.key === key);
    const row = await reader.readPoint(READ_PLAN.find((p) => p.key === key));
    if (row.status === 'error') throw new Error(`${dpLabel(key)}: ${row.error}`);
    if (i >= 0) rows[i] = row;
  }
  S = byKey(rows);
  renderAll();
  if (stack.length) drawPage();
}

$('confirmGo').onclick = async () => {
  if (!pending || busy || blocked) return;
  if (!reader) { pending = null; $('confirmSheet').classList.remove('open'); return toast(t('msg.hbLost'), 'warn'); }
  const { plan, state: previewState } = pending;
  busy = true;
  renderHead();
  $('confirmSheet').classList.remove('open');
  $('progTitle').textContent = plan.title;
  $('progLog').textContent = '';
  $('progKofi').classList.add('hidden');
  $('progDone').classList.add('hidden');
  progStatus(t('msg.backupReading'));
  ring(0);
  $('progSheet').classList.add('open');
  const total = plan.steps.length || 1;
  let done = 0;
  const plog = (m) => {
    log(m); $('progLog').textContent += `${new Date().toLocaleTimeString()}  ${m}\n`;
    if (/^OK /.test(m)) ring((done = Math.min(total, done + 1)) / total);
  };
  let backup = null;
  try {
    const result = await saveBackup({ title: plan.title, steps: plan.steps.map(({ key, before, after }) => ({ key, before, after })) }, progStatus)
      .catch((e) => { throw Object.assign(e, { beforeWrite: true }); });
    backup = result.backup;
    const now = byKey(result.fresh);
    for (const key of guardedKeys(plan)) {
      if (now[key]?.rawHex !== previewState[key]?.rawHex) throw new Error(t('msg.changedPreview', { label: dpLabel(key) }));
    }
    savePending({
      bikeId: now.motorBikeId?.value, at: new Date().toISOString(), title: plan.title, backupName: result.saved.name,
      steps: plan.steps.map((s) => {
        const known = !s.write && !s.volatile;
        return { key: s.key, label: s.label ?? dpLabel(s.key), before: s.before, after: s.after,
          beforeHex: known ? now[s.key]?.rawHex ?? '' : null, afterHex: known ? hex(s.payload) : null };
      }),
    });
    progStatus(t('msg.changing', { title: plan.title }));
    const applied = await applyPlan(reader, plan, now, plog);
    clearPending();
    recordOutcome(backup.createdAt, { ok: true, at: new Date().toISOString(), done: applied.done });
    pending = null;
    plog(`FERTIG: ${plan.title}`);
    const restart = plan.steps.some((s) => s.key.startsWith('light')) ? ` ${t('msg.restart')}` : '';
    // Schritte, die geschrieben, aber nicht zurückgelesen werden konnten (z. B. SoC-Grenzen) – ehrlich als unbestätigt melden
    const unconfirmed = applied.done.some((d) => d.unconfirmed) ? ` ${t('ui.changedUnconfirmed')}` : '';
    const changed = t('ui.changed') + unconfirmed + restart;
    try { await refreshChanged(plan, result.fresh); } catch (e) {
      await disconnect();
      progStatus(`${changed} ${t('msg.readError', { error: e.message })}`, 'warn');
      return progDone('warn');
    }
    progStatus(changed, 'ok');
    progDone('ok');
  } catch (e) {
    if (e.uncertain) {
      blocked = true;
      plog(`ABBRUCH nach Schreibversuch (${e.attempted.join(', ')}): ${e.message}`);
      progStatus(t('msg.abort', { error: e.message }), 'err');
      progDone('err');
    } else {
      clearPending();
      plog(`Nicht geändert: ${e.message}`);
      progStatus(e.beforeWrite && e.name === 'AbortError' ? t('msg.noLocation') : t('msg.notChanged', { error: e.message }), 'warn');
      progDone('warn');
    }
    if (backup) recordOutcome(backup.createdAt, { ok: false, at: new Date().toISOString(), error: e.message, attempted: e.attempted ?? [] });
  } finally {
    busy = false;
    renderAll();
  }
};

async function manualBackup() {
  if (!reader || busy) return;
  busy = true; renderHead();
  toast(t('msg.backupReading'));
  try {
    const { saved } = await saveBackup({ title: t('title.manualBackup'), steps: [] }, (s) => { $('pageSub').textContent = s; });
    toast(t('msg.backupSaved', { name: saved.name }), 'ok');
  } catch (e) {
    toast(e.name === 'AbortError' ? t('msg.noLocation') : t('msg.backupFailed', { error: e.message }), 'warn');
  } finally { busy = false; renderHead(); }
}

// ---------- Diagnose / Export (nur lesen) ----------
// Liest Roh-Adressen aus und erstellt eine Textdatei für den Entwickler (z. B. für nicht erkannte
// Zusatzgeräte). Persönliche Daten (Seriennummern, IDs, Rahmennummer) werden nicht mit ausgelesen.
async function diagReadAddr(address, timeoutMs = 1800) {
  const row = { address, status: 'error', hex: '', fields: '', error: '', code: null };
  if (PRIVATE_ADDR.has(address)) { row.status = 'private'; row.fields = t('diag.hidden'); return row; }
  try {
    const r = await reader.read(address, timeoutMs);
    row.hex = hex(r.payload);
    row.fields = pbSummary(r.payload);
    if (r.status === 0) row.status = 'ok';
    else { row.status = 'rejected'; row.code = r.status; row.error = r.statusName; }
  } catch (e) { row.status = e.timeout ? 'timeout' : 'error'; row.error = e.message; }
  return row;
}
function diagStatusLine(text) { const el = $('diagStatus'); if (el) el.textContent = text; }
function diagSetBusy(on) {
  diag.busy = on; if (on) diag.stop = false;
  for (const id of ['diagRun', 'diagScan', 'diagFull']) { const el = $(id); if (el) el.disabled = on; }
  for (const el of document.querySelectorAll('#diagBands button')) el.disabled = on;
  const stop = $('diagStop'); if (stop) stop.classList.toggle('hidden', !on);
}
function redrawDiag() { if (stack.length && stack[stack.length - 1].name === 'diagnose') drawPage(); }
async function diagRunKnown() {
  if (!reader || diag.busy) return;
  diag.map.clear(); diagSetBusy(true);
  for (const [i, p] of READ_PLAN.entries()) {
    if (diag.stop) break;
    diag.map.set(p.address, await diagReadAddr(p.address));
    diagStatusLine(t('diag.progress', { n: i + 1, total: READ_PLAN.length }));
  }
  diagSetBusy(false); redrawDiag();
}
// Einen Adressbereich scannen (höchstens 600 Adressen pro Lauf). Von Bauteil-Knöpfen und vom eigenen Bereich genutzt.
async function diagScanRange(from, to) {
  if (!reader || diag.busy) return;
  from = Math.max(0, from | 0);
  to = Math.min(0x7fff, to | 0);
  if (to < from) [from, to] = [to, from];
  to = Math.min(to, from + 599);
  diagSetBusy(true);
  let hits = 0;
  for (let a = from; a <= to; a++) {
    if (diag.stop) break;
    const r = await diagReadAddr(a, 450);
    if (r.status === 'ok' || r.status === 'rejected' || r.status === 'private') { diag.map.set(a, r); if (r.status === 'ok') hits++; }
    diagStatusLine(t('diag.scanProgress', { a, to, hits }));
  }
  diagSetBusy(false); redrawDiag();
}
async function diagRunScan() {
  await diagScanRange(parseInt($('diagFrom').value, 10) || 0, parseInt($('diagTo').value, 10) || 0);
}
// Kompletter Scan über den ganzen gültigen Adressraum (0–32767). Dauert lange, jederzeit per Stopp abbrechbar.
async function diagRunFull() {
  if (!reader || diag.busy) return;
  if (!confirm(t('diag.fullConfirm'))) return;
  diagSetBusy(true);
  const MAX = 0x7fff;
  let hits = 0;
  for (let a = 0; a <= MAX; a++) {
    if (diag.stop) break;
    const r = await diagReadAddr(a, 400);
    if (r.status === 'ok' || r.status === 'rejected' || r.status === 'private') { diag.map.set(a, r); if (r.status === 'ok') hits++; }
    if ((a & 0x1f) === 0) diagStatusLine(t('diag.fullProgress', { a, max: MAX, hits }));
  }
  diagSetBusy(false); redrawDiag();
}
function diagText() {
  const name = [txt('oemBrand', ''), txt('oemModel', '')].join(' ').trim();
  const list = [...diag.map.values()].sort((a, b) => a.address - b.address);
  const header = [
    'SelfBike Diagnose-Export',
    `Version ${VERSION}`,
    new Date().toISOString(),
    name ? `Rad: ${name}` : null,
    t('diag.fileNote'),
    '',
    ['Adresse', 'Name', 'Status', 'Hex', 'Felder'].join('\t'),
  ].filter((l) => l !== null);
  const body = list.map((r) => [r.address, ADDR_LABEL.get(r.address) || '',
    r.status + (r.code != null ? ' ' + r.code : ''), r.hex, r.fields || r.error].join('\t'));
  return [...header, ...body].join('\n');
}
function downloadTextFile(fileName, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// ---------- Verbinden und Auslesen ----------

async function refresh() {
  busy = true;
  renderHead();
  rows = await readAll(reader, (row, i) => { $('pageSub').textContent = t('msg.reading', { n: i + 1, total: READ_PLAN.length }); });
  S = byKey(rows);
  $('pageSub').textContent = t('msg.readingFaults');
  faults = await readFaults(reader);
  busy = false;
  if (!demo) addSnapshot(snapshotFromRows(rows, new Date()));
  renderAll();
  if (stack.length) drawPage();
}

async function connectWith(u, isDemo) {
  busy = true;
  demo = isDemo;
  renderHead();
  $('connect').disabled = true;
  $('pageSub').textContent = t('msg.connecting', { name: u.device.productName });
  try {
    usb = u;
    await usb.open();
    reader = new BikeReader(usb);
    await refresh();
    blocked = false;
    startHeartbeat();
    if (demo) toast(t('demo.on'), 'warn');
  } catch (e) {
    log(`Fehler: ${e.message}`);
    await disconnect();
    toast(`${t('msg.connectFailed', { error: e.message })}${/claim/i.test(e.message) ? ' ' + t('msg.busyHint') : ''}`, 'err');
  }
  busy = false;
  $('connect').disabled = !usbUsable();
  renderAll();
}

// iOS/iPadOS erlaubt keinem Browser WebUSB (auch Chrome/Edge nicht, da alle auf WebKit laufen).
// iPad ab iPadOS 13 meldet sich als „MacIntel“ – über Touchpunkte vom echten Mac unterscheiden (Mac = 0).
const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Verbinden-Button nur freigeben, wenn der Browser WebUSB wirklich nutzen kann
// (nicht iOS, navigator.usb vorhanden – z. B. fehlt es in Firefox –, und sicherer Kontext).
const usbUsable = () => !isIos() && 'usb' in navigator && window.isSecureContext;

$('connect').onclick = async () => {
  if (!discAccepted()) return showDisclaimer();
  if (isIos()) return toast(t('msg.iosBlocked'), 'err');
  if (!('usb' in navigator)) return toast(t('msg.noWebusb'), 'err');
  let device;
  try {
    device = await McspUsb.request(); // muss als Erstes im Klick passieren
  } catch (e) {
    return toast(e.name === 'NotFoundError' ? t('msg.noDevice') : `${e.name}: ${e.message}`, 'warn');
  }
  await connectWith(new McspUsb(device, log), false);
};
$('demoStart').onclick = async () => {
  if (!discAccepted()) return showDisclaimer();
  await connectWith(new DemoUsb(log), true);
};

function startHeartbeat() {
  clearInterval(hbTimer);
  hbFailures = 0;
  hbTimer = setInterval(async () => {
    if (busy || !reader || performance.now() - reader.lastActivity < 1100) return;
    try { await heartbeat(reader); hbFailures = 0; } catch (e) {
      log(`Lebenszeichen fehlgeschlagen (${++hbFailures}): ${e.message}`);
      if (hbFailures >= 3 && !busy) { await disconnect(); toast(t('msg.hbLost'), 'warn'); }
    }
  }, 1500);
}

async function disconnect() {
  clearInterval(hbTimer);
  hbTimer = null;
  const u = usb;
  usb = null;
  reader = null;
  pending = null;
  $('confirmSheet').classList.remove('open');
  if (u) await u.close();
  busy = false;
  renderAll();
}
navigator.usb?.addEventListener('disconnect', async (e) => {
  if (usb && e.device === usb.device) { await disconnect(); toast(t('msg.cableOff'), 'warn'); }
});

// ---------- Rechtlicher Hinweis ----------

const DISC_KEY = 'selfbike-disclaimer';
function discAccepted() {
  try { const d = JSON.parse(localStorage.getItem(DISC_KEY)); return d?.v === 1 ? d : null; } catch { return null; }
}
function showDisclaimer() {
  const accepted = !!discAccepted();
  $('discAcceptBox').classList.toggle('hidden', accepted);
  $('discClose').classList.toggle('hidden', !accepted);
  $('discCheck').checked = false;
  $('discAccept').disabled = true;
  $('discSheet').classList.add('open');
}
$('discCheck').onchange = () => { $('discAccept').disabled = !$('discCheck').checked; };
$('discAccept').onclick = () => {
  try { localStorage.setItem(DISC_KEY, JSON.stringify({ v: 1, at: new Date().toISOString(), lang: lang() })); } catch { /* egal */ }
  $('discSheet').classList.remove('open');
};
$('discClose').onclick = () => $('discSheet').classList.remove('open');
$('showLegal').onclick = () => showDisclaimer();

// ---------- Sprache ----------

// Oben immer sichtbar (Kürzel), im Hinweis-Fenster mit vollem Namen
$('topLang').innerHTML = Object.entries(LANGS).map(([c, n]) => `<option value="${c}" title="${esc(n)}">${esc(c.toUpperCase())}</option>`).join('');
$('discLang').innerHTML = Object.entries(LANGS).map(([c, n]) => `<option value="${c}">${esc(n)}</option>`).join('');
// Geschlossen nur das Kürzel (schmal), aufgeklappt Kürzel + Name, damit z. B. CS/DA/SV/FI verständlich sind
const langLabels = (full) => {
  // Breite festhalten, sonst springt die Kopfzeile beim Aufklappen
  $('topLang').style.width = full ? `${$('topLang').offsetWidth}px` : '';
  for (const o of $('topLang').options) o.textContent = full ? `${o.value.toUpperCase()} · ${LANGS[o.value]}` : o.value.toUpperCase();
};
$('topLang').addEventListener('pointerdown', () => langLabels(true));
$('topLang').addEventListener('keydown', () => langLabels(true));
$('topLang').addEventListener('blur', () => langLabels(false));
$('topLang').onchange = () => { langLabels(false); changeLang($('topLang').value); };
$('discLang').onchange = () => changeLang($('discLang').value);
async function changeLang(code) {
  await setLang(code);
  $('discLang').value = $('topLang').value = lang();
  // gelesene Werte neu übersetzen geht über ein erneutes Auslesen; die Oberfläche sofort
  applyStatic();
  showVersion();
  renderAll();
  if (stack.length) drawPage();
}
// Version unten auf der Startseite, verlinkt auf die Liste der Änderungen
function showVersion() {
  $('appVersion').href = CHANGELOG_URL;
  $('appVersion').textContent = `SelfBike ${VERSION} · ${t('ui.whatsNew')}`;
}

// ---------- Start ----------

await Promise.all([loadCatalog(), loadOwnTexts()]);
await setLang(detectLang());
$('discLang').value = $('topLang').value = lang();
applyStatic();
showVersion();
if (isIos()) {
  $('connect').disabled = true;
  $('insecure').textContent = t('msg.iosBlocked');
  $('insecure').classList.remove('hidden');
} else if (!('usb' in navigator)) {
  // Browser ohne WebUSB (z. B. Firefox) gleich beim Laden informieren – nicht erst beim Klick.
  $('connect').disabled = true;
  $('insecure').textContent = t('msg.noWebusb');
  $('insecure').classList.remove('hidden');
} else if (!window.isSecureContext) {
  $('connect').disabled = true;
  $('insecure').textContent = t('msg.insecure', { link: `https://${location.hostname}:8094${location.pathname}` });
  $('insecure').classList.remove('hidden');
}
renderAll();
if (!discAccepted()) showDisclaimer();
