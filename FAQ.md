# ❓ FAQ · SelfBike

Häufige Fragen zum Auslesen von Bosch-eBikes mit SelfBike.
Common questions about reading out Bosch eBikes with SelfBike.

---

## Welche Systeme werden unterstützt? / Which systems are supported?

🇩🇪 SelfBike deckt **zwei** Bosch-Generationen ab:

- **BES2 (Gen2–4)** — Active Line, Active Line Plus, Performance Line und Performance Line CX **Gen2, Gen3 und Gen4** (ca. 2014–2021). Bedienteile: Kiox, Nyon, Intuvia, Purion.
- **Smart System (Gen5)** — Kiox 300/500, System Controller, LED Remote (ab ca. 2022). Eigene Seite.

**Nicht** unterstützt: die **Classic Line / Classic+ Line** — das ist Boschs **erste Generation von ~2011** (ein eigenes, älteres System mit anderer Schnittstelle). „Classic Line" wird oft fälschlich für die ganze Vor-Smart-System-Ära benutzt; gemeint ist bei uns immer **BES2**.

🇬🇧 SelfBike covers **two** Bosch generations:

- **BES2 (Gen2–4)** — Active Line, Active Line Plus, Performance Line and Performance Line CX **Gen2, Gen3 and Gen4** (~2014–2021). Head units: Kiox, Nyon, Intuvia, Purion.
- **Smart System (Gen5)** — Kiox 300/500, System Controller, LED Remote (from ~2022). Separate page.

**Not** supported: the **Classic Line / Classic+ Line** — that is Bosch's **first generation from ~2011** (a separate, older system with a different interface).

---

## Warum geht es nur am PC/Laptop? / Why only on a PC/laptop?

🇩🇪 Das hängt am Browser, nicht an uns:

- **BES2** meldet sich am USB als **HID-Gerät** → braucht **WebHID**. Das gibt es nur im **Desktop-Chrome/-Edge**, nicht auf Handy-Browsern.
- **Smart System** nutzt **WebUSB** → läuft auch in **Chrome für Android**.
- **iPhone/Safari**: weder WebHID noch WebUSB — geht gar nicht.

🇬🇧 This is a browser limitation, not ours:

- **BES2** enumerates as a **HID device** → needs **WebHID**, which only exists in **desktop Chrome/Edge**, not on mobile browsers.
- **Smart System** uses **WebUSB** → also works in **Chrome for Android**.
- **iPhone/Safari**: neither — not possible.

---

## Welches Bedienteil / welcher Browser? / Which head unit / browser?

🇩🇪 Für BES2: **Kiox, Nyon oder Intuvia** per USB, am **PC/Laptop mit Chrome oder Edge**. Die Geräteerkennung filtert nur nach der **Bosch-Hersteller-Kennung** — so erscheinen Kiox *und* Nyon im Auswahlfenster (z. B. Kiox `PID 0x193`, Nyon 1 `PID 0x0157`).

🇬🇧 For BES2: **Kiox, Nyon or Intuvia** via USB, on a **PC/laptop with Chrome or Edge**. Device detection matches the **Bosch vendor id** only, so both Kiox and Nyon appear in the picker (e.g. Kiox `PID 0x193`, Nyon 1 `PID 0x0157`).

---

## Ist das Tuning? / Is this tuning?

🇩🇪 **Nein.** Die öffentliche Seite **liest nur** aus. Es werden **keine** Tempo- oder Radumfang-Werte und **keine** Akku-Grenzen verändert. Kein Tuning.

🇬🇧 **No.** The public page is **read-only**. It changes **no** speed or wheel-circumference values and **no** battery limits. No tuning.

---

## Was passiert mit meinen Daten? / What about my data?

🇩🇪 Alles bleibt **lokal im Browser**. Im gespeicherten Protokoll werden **Seriennummern und IDs automatisch ausgeblendet**, bevor du es weitergibst.

🇬🇧 Everything stays **local in your browser**. In the saved protocol, **serial numbers and IDs are blurred automatically** before you share it.
