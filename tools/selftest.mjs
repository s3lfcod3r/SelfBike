// SelfBike Selbsttest – vor jedem Commit ausführen:  node tools/selftest.mjs
//
// Prüft die sicherheitsrelevante statische Schreib-Freigabeliste (WRITE_RULES):
//   1. Jede Schreibadresse trägt eine bewusste Flag-Klassifikation (Flag-Referenz oder flag:null + Begründung).
//   2. Jede OEM-Flag-Referenz zeigt auf einen echten Datenpunkt in READ_PLAN (kein Tippfehler).
// Fehler werden im Klartext mit Adresse + Grund gemeldet; Exit-Code != 0 bricht den Commit ab.

import { checkWriteRulesClassified, WRITE_FLAG } from '../lib/bike-reader.js';
import { READ_PLAN } from '../lib/datapoints.js';

const problems = [];

// 1. Vollständige Klassifikation
for (const p of checkWriteRulesClassified()) problems.push(p);

// 2. Flag-Referenzen zeigen auf echte Datenpunkte
const keys = new Set(READ_PLAN.map((p) => p.key));
for (const [address, flag] of WRITE_FLAG) {
  if (flag && !keys.has(flag[0])) problems.push(`Adresse ${address}: Flag-Datenpunkt „${flag[0]}“ fehlt in READ_PLAN`);
}

if (problems.length) {
  console.error(`✗ SelfBike-Selbsttest: ${problems.length} Problem(e)`);
  for (const p of problems) console.error('  • ' + p);
  process.exit(1);
}

const gated = Array.from(WRITE_FLAG.values()).filter(Boolean).length;
console.log(`✓ SelfBike-Selbsttest bestanden: ${WRITE_FLAG.size} Schreibadressen klassifiziert, ${gated} davon OEM-gegated und gegen READ_PLAN geprüft.`);
