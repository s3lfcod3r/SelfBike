// Klartexte zu Fehlercodes – aus der eigenen Bosch-Flow-App des Nutzers (APK = ZIP-Datei,
// darin assets/issues_<sprache>_Rider.json). Die Texte gehören Bosch: SelfBike liefert sie nicht mit,
// sondern liest sie aus der vom Nutzer gewählten Datei und speichert sie nur in dessen Browser (IndexedDB).
// Format der Datei: { issues: { "1B7210": { severity, AppRiderErrorTitle, description, measures } } }

const DB = 'selfbike';
const STORE = 'issues';
const CATALOG_RE = /(?:^|\/)issues_([a-z]{2})_(Rider|IBD|OEM|SP)\.json$/;

let memory = null; // { [lang]: { tier, issues } }

// ---------- IndexedDB ----------

function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const result = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(result instanceof IDBRequest ? result.result : result);
    t.onerror = () => reject(t.error);
  });
}

// Auf dem eigenen Server abgelegte Fassung (einmalig aus der eigenen Flow-App erzeugt, nicht weitergeben)
const SERVER_FILE = 'data/private/issues-catalog.json';
let fromServer = false;

export async function loadCatalog() {
  // Zuerst die Datei auf dem Server, sonst ein früherer Import in diesem Browser
  memory = null;
  fromServer = false;
  try {
    const res = await fetch(SERVER_FILE, { cache: 'no-cache' });
    if (res.ok) { memory = await res.json(); fromServer = true; }
  } catch { /* keine Datei auf dem Server */ }
  if (!memory) {
    try { memory = (await tx('readonly', (s) => s.get('catalog'))) || null; } catch { memory = null; }
  }
  return memory;
}
export async function clearCatalog() {
  memory = null;
  try { await tx('readwrite', (s) => s.delete('catalog')); } catch { /* egal */ }
}
export function catalogInfo() {
  if (!memory) return null;
  const langs = Object.keys(memory);
  return { langs, count: Object.keys(memory[langs[0]]?.issues ?? {}).length, tier: memory[langs[0]]?.tier, fromServer };
}

// Eintrag zu einem Code in der gewünschten Sprache (sonst Englisch, Deutsch, irgendeine)
export function lookupIssue(code, lang) {
  if (!memory) return null;
  const key = code.toString(16).toUpperCase();
  for (const l of [lang, 'en', 'de', ...Object.keys(memory)]) {
    const e = memory[l]?.issues?.[key];
    if (e) return e;
  }
  return null;
}

// ---------- Import ----------

// Bosch-Texte können HTML enthalten → nur Text übernehmen (nichts davon wird als HTML angezeigt)
function plain(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(String(html).replace(/<br\s*\/?>/gi, '\n'), 'text/html');
  return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}
function slim(json, tier) {
  const issues = {};
  for (const [code, e] of Object.entries(json?.issues ?? {})) {
    issues[code.toUpperCase()] = {
      s: e.severity || '', t: plain(e.AppRiderErrorTitle || e.component_name || ''), d: plain(e.description), m: plain(e.measures),
    };
  }
  return { tier, issues };
}

// Datei des Nutzers: APK/ZIP oder einzelne issues_xx_*.json. Liefert { langs, count }.
export async function importCatalog(file) {
  const found = {};
  const single = CATALOG_RE.exec(file.name);
  if (/\.json$/i.test(file.name)) {
    const lang = single?.[1] ?? 'de';
    found[lang] = slim(JSON.parse(await file.text()), single?.[2] ?? 'Rider');
  } else {
    for (const entry of await zipEntries(file)) {
      const m = CATALOG_RE.exec(entry.name);
      if (!m) continue;
      const lang = m[1];
      // Pro Sprache den umfangreichsten Katalog nehmen
      const data = slim(JSON.parse(await readZipEntry(file, entry)), m[2]);
      if (!found[lang] || Object.keys(data.issues).length > Object.keys(found[lang].issues).length) found[lang] = data;
    }
  }
  if (!Object.keys(found).length) throw new Error('no-catalog');
  memory = found;
  fromServer = false;
  await tx('readwrite', (s) => s.put(found, 'catalog'));
  return catalogInfo();
}

// ---------- minimaler ZIP-Leser (nur Inhaltsverzeichnis + gesuchte Dateien, per Blob.slice) ----------

const u16 = (v, o) => v.getUint16(o, true);
const u32 = (v, o) => v.getUint32(o, true);
const view = async (blob, start, end) => new DataView(await blob.slice(start, end).arrayBuffer());

async function zipEntries(file) {
  // Ende des Inhaltsverzeichnisses (EOCD) in den letzten 64 KB suchen
  const tailStart = Math.max(0, file.size - 65557);
  const tail = await view(file, tailStart, file.size);
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) if (u32(tail, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('no-zip');
  const count = u16(tail, eocd + 10);
  const cdSize = u32(tail, eocd + 12);
  const cdOffset = u32(tail, eocd + 16);
  if (cdOffset === 0xffffffff) throw new Error('zip64');
  const cd = await view(file, cdOffset, cdOffset + cdSize);
  const entries = [];
  for (let i = 0, p = 0; i < count && p < cd.byteLength; i++) {
    if (u32(cd, p) !== 0x02014b50) break;
    const method = u16(cd, p + 10);
    const compSize = u32(cd, p + 20);
    const nameLen = u16(cd, p + 28);
    const extraLen = u16(cd, p + 30);
    const commentLen = u16(cd, p + 32);
    const localOffset = u32(cd, p + 42);
    const name = new TextDecoder().decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen));
    entries.push({ name, method, compSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readZipEntry(file, entry) {
  const head = await view(file, entry.localOffset, entry.localOffset + 30);
  if (u32(head, 0) !== 0x04034b50) throw new Error('bad-entry');
  const start = entry.localOffset + 30 + u16(head, 26) + u16(head, 28);
  const data = file.slice(start, start + entry.compSize);
  if (entry.method === 0) return data.text();
  if (entry.method !== 8) throw new Error('unsupported-compression');
  const stream = data.stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}
