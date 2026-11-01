# SelfBike

Browser-App, mit der du dein **eigenes Bosch-Smart-System-E-Bike** per USB ausliest und wenige
Einstellungen sicher änderst – ohne Installation, ohne Server, ohne Konto. Alles läuft lokal im Browser.

**Direkt starten:** https://s3lfcod3r.github.io/SelfBike/ (Chrome oder Edge am PC) – einfache Ansicht im iPhone-Stil
**Klassische Ansicht** mit allen Details und Experten-Funktionen: https://s3lfcod3r.github.io/SelfBike/klassisch.html

## Was SelfBike kann

- **Auslesen:** Motor, Akku (Ladezustand, Gesundheit, Ladezyklen), Bedieneinheit, ABS, eShift, Kilometer, Fahrstatistik
- **Fehlerspeicher** lesen (Klartexte optional aus der eigenen Bosch-Flow-App importieren)
- **Ändern** (nur was der Hersteller freigibt): Licht, Service-Intervall, Startmodus, Display-Sprache, Einheiten,
  Uhrzeit, Schiebehilfe an/aus, Fahrmodi (Unterstützung, Dynamik, Höchstgeschwindigkeit – nie über 25 km/h)
- **Sicherheit:** vor jeder Änderung Backup, Vorschau vorher → nachher, jeder Schritt wird zurückgelesen, nie automatisch wiederholt
- PDF-Bericht, Verlauf, Vergleich zweier Stände, Demo-Modus ohne Fahrrad, 12 Sprachen

**Nicht** enthalten und bewusst ausgeschlossen: Tuning, Änderungen an Tempolimit oder Region, Fehler löschen,
Umgehen von Lizenzen oder Händlerfreigaben.

## Benutzung

1. E-Bike einschalten, USB-Datenkabel an die Bedieneinheit und den PC.
2. Bosch-Software und andere SelfBike-Tabs schließen.
3. Seite öffnen, Hinweis bestätigen, **Verbinden** und das Gerät auswählen.

Ohne Fahrrad: „Demo ohne Fahrrad ansehen“. Lokal testen: `start-server.ps1` → http://localhost:8080

## Wichtiger Hinweis

SelfBike ist ein privates, inoffizielles Projekt ohne Verbindung zur Robert Bosch GmbH oder zu Fahrradherstellern.
Nutzung auf eigene Gefahr – Änderungen an der E-Bike-Elektronik können Garantie und Verkehrssicherheit betreffen.
Marken gehören ihren Inhabern und werden nur genannt, um die Kompatibilität zu beschreiben.

## Unterstützen

SelfBike ist kostenlos und ohne Werbung. Wenn es dir hilft und du die Weiterentwicklung unterstützen möchtest:

[☕ SelfBike auf Ko-fi unterstützen](https://ko-fi.com/s3lfcod3r)

## Danke / Quellen

- **bosch-bes3-reader** von Remko Weijnen (https://github.com/rweijnen/bosch-bes3-reader) – Teile des
  Protokollverständnisses und einzelne Adress-/Typangaben. Code-Lizenz MIT, Adressverzeichnis CC BY 4.0.

Details: [data/ATTRIBUTION.md](data/ATTRIBUTION.md), Lizenztext: [data/LICENSE-MIT-bes3-reader.txt](data/LICENSE-MIT-bes3-reader.txt).
