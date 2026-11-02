# 📰 Changelog

Newest version first.
Neueste Version zuerst.

---

## 1.4.1 · November 2026
- 🇬🇧 **Fault texts in all 12 languages**: titles and tips for all fault codes are now translated; SelfBike shows the language selected at the top.
- 🇩🇪 **Fehlertexte in allen 12 Sprachen**: Titel und Hinweise zu allen Fehlercodes sind jetzt übersetzt; SelfBike zeigt die oben eingestellte Sprache.

## 1.4.0 · November 2026
- 🇬🇧 **Fault codes explained for all codes**: every one of the ~1100 fault codes now has its own short title, what it means for you and what to do – written in our own words. A coloured label shows how serious it is: 🔴 critical, 🟠 error, 🟡 warning, 🟢 info (also in the PDF report). The demo now shows sample faults from all areas. Translations follow; until then the texts are shown in German.
- 🇩🇪 **Alle Fehlercodes erklärt**: Jeder der rund 1100 Fehlercodes hat jetzt einen eigenen kurzen Titel, was er für dich bedeutet und was zu tun ist – in eigenen Worten. Ein farbiges Etikett zeigt, wie ernst es ist: 🔴 kritisch, 🟠 Fehler, 🟡 Warnung, 🟢 Info (auch im PDF-Bericht). Die Demo zeigt jetzt Beispiel-Meldungen aus allen Bereichen. Übersetzungen folgen; bis dahin erscheinen die Texte auf Deutsch.

## 1.3.0 · November 2026
- 🇬🇧 **Own fault texts**: `data/fault-texts.csv` holds self-written titles and tips per fault code (per language or for all), loaded automatically and shown in the app and PDF report. The import of fault texts from the Flow app has been removed. Changes now finish faster: after writing, only the changed values are read again.
- 🇩🇪 **Eigene Fehlertexte**: In `data/fault-texts.csv` stehen selbst formulierte Titel und Hinweise pro Fehlercode (pro Sprache oder für alle), werden automatisch geladen und in App und PDF-Bericht gezeigt. Der Import von Fehlertexten aus der Flow-App ist entfernt. Änderungen sind schneller fertig: Nach dem Schreiben werden nur die geänderten Werte neu gelesen.

## 1.2.0 · November 2026
- 🇬🇧 **Power ports (beta)**: switch the low and high power port on the motor on or off — only if your bike's manufacturer allows it. Locked ports are shown but never written. Tested on one bike so far; whether yours allows it depends on the manufacturer.
- 🇩🇪 **Power Ports (Beta)**: Low und High Power Port am Motor ein- und ausschalten — nur wenn der Hersteller deines Rads es freigibt. Gesperrte Ports werden angezeigt, aber nie geschrieben. Bisher an einem Rad getestet; ob deins es zulässt, hängt vom Hersteller ab.

## 1.1.0 · November 2026
- 🇬🇧 **Fault codes explained**: every stored code now shows its area (e.g. drive unit, battery temperature, ABS wheel sensors) and a general tip on what to check — SelfBike's own wording in all 12 languages, also in the PDF report. Exact Bosch texts still only from your own Flow app.
- 🇩🇪 **Fehlercodes erklärt**: Jeder gespeicherte Code zeigt jetzt seinen Bereich (z. B. Antriebseinheit, Akku-Temperatur, ABS-Radsensoren) und einen allgemeinen Hinweis, was man prüfen kann — eigene Formulierung in allen 12 Sprachen, auch im PDF-Bericht. Genaue Bosch-Texte weiterhin nur aus der eigenen Flow-App.

## 1.0.0 · November 2026
- 🇬🇧 **First public release**: read out Bosch Smart System e-bikes over **WebUSB**, safe changes with **backup and read-back**, assist modes (max. 25 km/h), fault memory, **PDF report** (light or dark), history, compare, demo mode and **12 languages** — live at **bike.selfcoder.de**.
- 🇩🇪 **Erste öffentliche Version**: Bosch-Smart-System-E-Bikes per **WebUSB** auslesen, sichere Änderungen mit **Backup und Rücklesen**, Fahrmodi (max. 25 km/h), Fehlerspeicher, **PDF-Bericht** (hell oder dunkel), Verlauf, Vergleich, Demo-Modus und **12 Sprachen** — live unter **bike.selfcoder.de**.
