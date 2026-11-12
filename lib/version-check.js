// Update-Hinweis: prüft beim Start, ob auf dem Server schon eine neuere
// SelfBike-Version liegt. Hintergrund: Ein lange geöffneter Tab lädt die
// ES-Module nie neu und läuft dann ewig auf einer alten Version weiter –
// ein daraus erzeugter PDF-Bericht trägt dann eine veraltete Versionsnummer.
// Bei Unterschied blendet SelfBike oben einen Hinweis zum Neuladen ein.
import { VERSION } from './version.js';
import { t } from './i18n.js';

// Holt die auf dem Server liegende Version frisch (am Cache vorbei).
// Liefert null bei offline, file:// oder lokalem Test – dann passiert nichts.
export async function latestVersion() {
  try {
    const res = await fetch(`./lib/version.js?ts=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const m = (await res.text()).match(/VERSION\s*=\s*['"]([^'"]+)['"]/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export async function checkForUpdate() {
  const latest = await latestVersion();
  if (latest && latest !== VERSION) showUpdateBanner(latest);
}

export function showUpdateBanner(latest) {
  if (document.getElementById('sb-update')) return;
  const bar = document.createElement('div');
  bar.id = 'sb-update';
  bar.setAttribute('role', 'status');
  bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:9999;display:flex;gap:.75rem;'
    + 'align-items:center;justify-content:center;flex-wrap:wrap;padding:.55rem .75rem;'
    + 'background:#1f6feb;color:#fff;font:600 14px/1.3 system-ui,-apple-system,sans-serif;'
    + 'box-shadow:0 2px 10px rgba(0,0,0,.25)';
  const msg = document.createElement('span');
  msg.textContent = t('update.available', { v: latest, old: VERSION });
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = t('update.reload');
  btn.style.cssText = 'border:0;border-radius:6px;padding:.3rem .85rem;background:#fff;'
    + 'color:#1f6feb;font-weight:700;cursor:pointer';
  // Neu laden: die alten Cache-Einträge sind längst abgelaufen, der Reload holt frisch.
  btn.addEventListener('click', () => location.reload());
  bar.append(msg, btn);
  document.body.prepend(bar);
}
