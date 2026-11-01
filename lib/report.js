// Erzeugt den Diagnosebericht als druckfertige HTML-Seite in der gewählten Sprache.
// Der Browser macht daraus über „Drucken → Als PDF speichern“ das PDF – ohne Zusatzbibliothek.

import { t, lang, fmtDateTime } from './i18n.js';
import { lookupIssue } from './issue-catalog.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const mask = (s) => (typeof s === 'string' && s.length > 8 ? s.slice(0, 4) + '…' + s.slice(-4) : s);

// Reihenfolge der Abschnitte (= group in datapoints.js)
const SECTIONS = ['Fahrrad', 'Antrieb', 'Akku', 'Bedieneinheit', 'Service', 'Licht', 'Power Ports'];

// Fehlerspeicher mit Klartext (falls Fehlertexte aus der Flow-App geladen sind)
function faultSection(faults) {
  const read = faults.filter((f) => f.status === 'ok');
  if (!read.length) return '';
  const rowsHtml = read.map((f) => {
    if (!f.faults.length) return `<tr><th>${esc(t(`fault.${f.component}`))}</th><td>${esc(t('fault.none'))}</td></tr>`;
    return f.faults.map((e, i) => {
      const code = (e.code ?? 0).toString(16).toUpperCase().padStart(6, '0');
      const info = lookupIssue(e.code ?? 0, lang());
      const when = e.timestamp > 0 ? t('fault.last', { date: fmtDateTime(e.timestamp * 1000) }) : t('fault.noTime');
      return `<tr><th>${i ? '' : esc(t(`fault.${f.component}`))}</th><td>
        <b>${esc(t('fault.code', { code }))}</b> · ${esc(`${e.count ?? '?'}×`)}${info?.s ? ` · ${esc(t(`sev.${info.s}`))}` : ''}<br>
        ${info?.t ? `${esc(info.t)}<br>` : ''}${info?.d ? `<span class="sub">${esc(info.d)}</span><br>` : ''}
        ${info?.m ? `<span class="sub">${esc(t('issues.measures'))}: ${esc(info.m)}</span><br>` : ''}
        <span class="sub">${esc(when)}</span></td></tr>`;
    }).join('');
  }).join('');
  return `<section><h2>${esc(t('faults.title'))}</h2><table>${rowsHtml}</table></section>`;
}

export function buildReportHtml(rows, { maskIds = false, createdAt = new Date(), name = '', faults = [] } = {}) {
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
  const text = (key) => (byKey[key]?.status === 'ok' && byKey[key].value !== '' ? byKey[key].text : null);
  const shown = (r) => (r.private && maskIds ? mask(r.text) : r.text);

  const title = name || [text('oemBrand') || 'E-Bike', text('oemModel')].filter(Boolean).join(' ');
  const when = fmtDateTime(createdAt, { dateStyle: 'long', timeStyle: 'short' });

  const tiles = [
    [t('dp.odometer'), text('odometer')],
    [t('bat.soh'), text('batterySoh')],
    [t('bat.cycles'), text('batteryCycles')],
    [t('dp.serviceDue'), text('serviceDue')],
  ].filter(([, v]) => v);

  const failed = rows.filter((r) => r.status !== 'ok' && SECTIONS.includes(r.group));
  const sections = SECTIONS.map((group) => {
    // Leere Werte (z. B. nicht hinterlegtes Fahrradmodell) weglassen
    const items = rows.filter((r) => r.group === group && r.status === 'ok' && r.value !== '' && r.text);
    if (!items.length) return '';
    // „Akku – Modell“ → „Modell“ innerhalb des Abschnitts
    const label = (r) => t(`dp.${r.key}`).replace(/^[^–]+ – /, '');
    return `<section><h2>${esc(t(`grp.${group}`))}</h2><table>${items.map((r) =>
      `<tr><th>${esc(label(r))}</th><td>${esc(shown(r))}</td></tr>`).join('')}</table></section>`;
  }).join('');

  const rawRows = rows.filter((r) => SECTIONS.includes(r.group)).map((r) =>
    `<tr><td>${r.address}</td><td>${esc(r.key)}</td><td>${esc(r.status)}</td>` +
    `<td>${esc(r.private && maskIds ? mask(r.rawHex) : r.rawHex)}</td></tr>`).join('');

  return `<!doctype html>
<html lang="${lang()}"><head><meta charset="utf-8">
<title>SelfBike ${esc(title)} ${createdAt.toISOString().slice(0, 10)}</title>
<style>
  /* Druckfassung: heller Grund, Self-Teal als Akzent (Werte aus brand/tokens.css) */
  :root { --self-teal-deep: #1f7763; --self-text: #1a2230; --self-text-2: #5b6776; --self-line: #d6dde6; }
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: var(--self-text); background: #fff; font: 10.5pt/1.45 "Exo 2", "Segoe UI", system-ui, sans-serif; }
  .page { max-width: 190mm; margin: 0 auto; padding: 8mm 0; }
  header { display: flex; justify-content: space-between; align-items: flex-end;
           border-bottom: 2px solid var(--self-teal-deep); padding-bottom: 6px; margin-bottom: 14px; }
  h1 { font-size: 18pt; margin: 0; }
  .brand { color: var(--self-teal-deep); font-weight: 700; letter-spacing: .02em; }
  .sub { color: var(--self-text-2); }
  .tiles { display: grid; grid-template-columns: repeat(${Math.max(tiles.length, 1)}, 1fr); gap: 8px; margin-bottom: 16px; }
  .tile { border: 1px solid var(--self-line); border-left: 3px solid var(--self-teal-deep); border-radius: 6px; padding: 8px 10px; }
  .tile b { display: block; font-size: 12.5pt; }
  .tile span { color: var(--self-text-2); font-size: 9pt; }
  section { break-inside: avoid; margin-bottom: 12px; }
  h2 { font-size: 11.5pt; margin: 0 0 4px; color: var(--self-teal-deep); }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 3px 6px; border-bottom: 1px solid var(--self-line); vertical-align: top; }
  th { width: 45%; font-weight: 500; color: var(--self-text-2); }
  .note { color: var(--self-text-2); font-size: 8.5pt; margin-top: 14px; }
  .raw { margin-top: 18px; break-before: page; }
  .raw table { font: 8pt/1.35 "IBM Plex Mono", Consolas, ui-monospace, monospace; }
  .raw th { width: auto; }
  .noprint { margin: 12px 0; padding: 10px; border: 1px solid var(--self-line); border-radius: 6px; }
  @media print { .noprint { display: none; } .page { padding: 0; } }
</style></head>
<body><div class="page">
  <p class="noprint">${esc(t('rep.hint'))}</p>
  <header>
    <div><div class="brand">SelfBike</div><h1>${esc(t('rep.title'))}</h1><div class="sub">${esc(title)} · Bosch Smart System</div></div>
    <div class="sub">${esc(t('rep.readAt', { date: when }))}</div>
  </header>
  ${tiles.length ? `<div class="tiles">${tiles.map(([l, v]) => `<div class="tile"><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join('')}</div>` : ''}
  ${sections}
  ${faultSection(faults)}
  ${failed.length ? `<section><h2>${esc(t('rep.unreadable'))}</h2><table>${failed.map((r) =>
    `<tr><th>${esc(t(`dp.${r.key}`))}</th><td>${esc(r.error || r.status)}</td></tr>`).join('')}</table></section>` : ''}
  <p class="note">${esc(t('rep.note'))}${maskIds ? ' ' + esc(t('rep.masked')) : ''}</p>
  <div class="raw"><h2>${esc(t('rep.appendix'))}</h2>
    <table><tr><th>${esc(t('rep.colAddress'))}</th><th>${esc(t('rep.colKey'))}</th><th>${esc(t('rep.colStatus'))}</th><th>${esc(t('rep.colData'))}</th></tr>${rawRows}</table></div>
</div>
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script>
</body></html>`;
}
