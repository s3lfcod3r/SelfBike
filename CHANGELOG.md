# 📰 Changelog

Newest version first.
Neueste Version zuerst.

---

## 1.4.25 · November 2026
- 🇬🇧 **Riding-mode editing removed**: changing riding modes (assistance, power, dynamics, speed) is gone – the bike reports these as read-only and blocks writing them, so the setting never actually worked. SelfBike stays a read-out and maintenance tool, not a replacement for the Flow app. The general ride statistics (total distance, riding without motor, operating hours) stay.
- 🇩🇪 **Fahrmodus-Einstellungen entfernt**: Das Ändern der Fahrmodi (Unterstützung, Leistung, Dynamik, Tempo) ist raus – das Rad meldet diese Werte schreibgeschützt und lässt das Schreiben nicht zu, das Einstellen hat also nie wirklich funktioniert. SelfBike bleibt ein Auslese- und Wartungswerkzeug, kein Ersatz für die Flow-App. Die allgemeine Fahrstatistik (Gesamtstrecke, Fahren ohne Motor, Betriebszeit) bleibt erhalten.

## 1.4.24 · November 2026
- 🇬🇧 **Browser without WebUSB flagged right away**: browsers that can't do WebUSB at all (e.g. Firefox and anything on its engine, on Windows, Linux, Android or macOS) now show the hint on load with the connect button disabled – the same as the iPhone/iPad case – instead of only after tapping "Connect". Thanks to the forum for the suggestion.
- 🇩🇪 **Browser ohne WebUSB sofort erkannt**: Browser, die kein WebUSB können (z. B. Firefox und alles mit seiner Engine, unter Windows, Linux, Android oder macOS), zeigen den Hinweis jetzt schon beim Laden mit gesperrtem Verbinden-Button – genau wie bei iPhone/iPad – statt erst nach dem Tippen auf „Verbinden". Danke ans Forum für den Vorschlag.

## 1.4.23 · November 2026
- 🇬🇧 **Clear message on iPhone and iPad**: SelfBike now detects iOS/iPadOS and says plainly that USB read-out is impossible there – Apple blocks USB in every iOS browser, Chrome and Edge included. Instead of the misleading "use Chrome or Edge" it now points to a computer (Windows, Mac, Linux, ChromeOS) or an Android phone. Thanks to the forum for the hint.
- 🇩🇪 **Klare Meldung auf iPhone und iPad**: SelfBike erkennt jetzt iOS/iPadOS und sagt direkt, dass das Auslesen per USB dort nicht geht – Apple sperrt USB in jedem iOS-Browser, auch in Chrome und Edge. Statt des irreführenden „bitte Chrome oder Edge" verweist es nun auf einen Computer (Windows, Mac, Linux, ChromeOS) oder ein Android-Handy. Danke ans Forum für den Hinweis.

## 1.4.22 · November 2026
- 🇬🇧 **Traction control, Extended Boost and drivetrain tensioner now adjustable too**: in each riding mode these three can now be set as well (where the motor offers them) – the same as in the Flow app's "Advanced" tab. Traction control as a level (Off / Low / Medium / High), Extended Boost as a value, drivetrain tensioner off / on. The bike caps all of them to its own limits.
- 🇩🇪 **Traktionskontrolle, Extended Boost und Kettenspanner jetzt auch einstellbar**: In jedem Fahrmodus lassen sich nun auch diese drei einstellen (sofern der Motor sie bietet) – genau wie im „Erweitert“-Tab der Flow-App. Traktionskontrolle als Stufe (Aus / Niedrig / Mittel / Hoch), Extended Boost als Wert, Kettenspanner aus / an. Das Rad deckelt alle auf seine eigenen Grenzen.

## 1.4.21 · November 2026
- 🇬🇧 **Two more batteries recognised by name**: PowerPack 400 (BBP3340) and PowerPack 500 (BBP3350) are now shown with their sales name instead of the bare part number. Thanks to the forum for the hint.
- 🇩🇪 **Zwei weitere Akkus mit Namen erkannt**: PowerPack 400 (BBP3340) und PowerPack 500 (BBP3350) werden jetzt mit ihrem Verkaufsnamen statt der nackten Teilenummer angezeigt. Danke ans Forum für den Hinweis.

## 1.4.20 · November 2026
- 🇬🇧 **Max. torque and max. motor power now adjustable**: in each riding mode you can now also set max. torque (Nm) and max. motor power (W) – the same values the Flow app exposes under "Custom riding modes", and adjustable on every Smart System motor. The bike itself caps them to its own limits (speed and region stay untouched). A note warns that high torque can increase drivetrain wear. Extended Boost, traction control and drivetrain tensioner stay view-only for now (motor-dependent).
- 🇩🇪 **Max. Drehmoment und max. Motorleistung jetzt einstellbar**: In jedem Fahrmodus lassen sich nun auch max. Drehmoment (Nm) und max. Motorleistung (W) einstellen – dieselben Werte, die die Flow-App unter „Individuelle Fahrmodi“ freigibt, und bei jedem Smart-System-Motor einstellbar. Das Rad deckelt sie auf seine eigenen Grenzen (Tempo und Region bleiben unberührt). Ein Hinweis warnt, dass hohes Drehmoment den Verschleiß erhöhen kann. Extended Boost, Traktionskontrolle und Kettenspanner bleiben vorerst nur zur Ansicht (motorabhängig).

## 1.4.19 · November 2026
- 🇬🇧 **More riding-mode values shown (view only)**: each riding mode now also shows max. torque, max. motor power, Extended Boost, traction control and drivetrain tensioner. These are read-only on purpose — adjustable are still only the same three the Flow app exposes under "Custom riding modes" (assistance, dynamics, top speed).
- 🇩🇪 **Mehr Fahrmodi-Werte sichtbar (nur Ansicht)**: Jeder Fahrmodus zeigt jetzt zusätzlich max. Drehmoment, max. Motorleistung, Extended Boost, Traktionskontrolle und Kettenspanner. Die sind bewusst nur zum Ansehen – einstellbar bleiben nur dieselben drei wie in der Flow-App unter „Individuelle Fahrmodi“ (Unterstützung, Dynamik, Höchstgeschwindigkeit).

## 1.4.18 · November 2026
- 🇬🇧 **Electronic shifting (eShift / Di2) now shown under Components and in the report**: if the bike has electronic shifting, it now appears in the component list and the PDF report with the number of gears (and the current gear / target cadence where available). It was already read under "More details" before, but was missing from Components and the report. Bikes with a mechanical derailleur are unchanged.
- 🇩🇪 **Elektronische Schaltung (eShift / Di2) jetzt unter Bauteile und im Bericht**: Hat das Rad eine elektronische Schaltung, erscheint sie jetzt in der Bauteilliste und im PDF-Bericht mit der Gangzahl (und aktuellem Gang / Ziel-Trittfrequenz, soweit vorhanden). Gelesen wurde das vorher schon unter „Mehr Details", in Bauteilen und im Bericht fehlte es aber. Räder mit mechanischer Schaltung bleiben unverändert.

## 1.4.17 · November 2026
- 🇬🇧 **Retrofitted parts now in the PDF report too**: second battery / range extender (PowerMore 250), Connect Module (BCM3101) and the display (Kiox 500) now get their own sections in the printable report — with model and software/hardware version — just as they already appear under Components. The raw-data appendix lists their addresses as well. Bikes without these parts stay unchanged: a part that is not fitted is left out entirely instead of showing up as "unreadable".
- 🇩🇪 **Nachgerüstete Teile jetzt auch im PDF-Bericht**: Zweitakku / Range-Extender (PowerMore 250), Connect Module (BCM3101) und das Display (Kiox 500) bekommen im druckbaren Bericht eigene Abschnitte – mit Modell und Software-/Hardware-Version – genau wie sie schon unter Bauteile erscheinen. Auch im Rohdaten-Anhang stehen ihre Adressen. Räder ohne diese Teile bleiben unverändert: Ein nicht verbautes Teil wird ganz weggelassen und nicht als „nicht lesbar" aufgeführt.

## 1.4.16 · November 2026
- 🇬🇧 **Retrofitted parts now recognised**: second battery / range extender (PowerMore 250), Connect Module (BCM3101) and a second display (Kiox 500) are now read and shown under Components, including their model and software/hardware version — they sit in address ranges SelfBike did not read before. Diagnostics / Export also gained matching component buttons (second battery ~600–760, Connect Module ~2800–2900, display ~3300–3480), so a missing part can be scanned directly.
- 🇩🇪 **Nachgerüstete Teile werden jetzt erkannt**: Zweitakku / Range-Extender (PowerMore 250), Connect Module (BCM3101) und ein zweites Display (Kiox 500) werden jetzt ausgelesen und unter Bauteile angezeigt – mit Modell und Software-/Hardware-Version. Sie liegen in Adressbereichen, die SelfBike vorher nicht gelesen hat. Diagnose / Export hat dazu passende Bauteil-Knöpfe bekommen (Zusatzakku ~600–760, Connect Module ~2800–2900, Display ~3300–3480), damit man ein fehlendes Teil gezielt scannen kann.

## 1.4.15 · November 2026
- 🇬🇧 **Diagnostics / Export easier to understand**: instead of a bare "0–300" field, there are now clearly named buttons per component, each with its address range shown — Battery (0–300), Brakes / ABS (2300–2400), Motor, riding modes & light (6100–6400), Control unit & service (8200–8600). So if a certain part is missing you scan exactly that one instead of guessing. The known read is marked as step 1, the full scan is for unknown/retrofitted parts, and a manual range stays available for experts.
- 🇩🇪 **Diagnose / Export verständlicher**: Statt eines nackten „0–300"-Feldes gibt es jetzt klar benannte Knöpfe pro Bauteil mit angezeigtem Adressbereich — Akku (0–300), Bremsen / ABS (2300–2400), Motor, Fahrmodi & Licht (6100–6400), Bedieneinheit & Service (8200–8600). Fehlt ein bestimmtes Teil, scannt man gezielt genau dieses, statt zu raten. Das bekannte Auslesen ist als Schritt 1 markiert, der komplette Scan ist für unbekannte/nachgerüstete Teile, und ein eigener Bereich bleibt für Profis.

## 1.4.14 · November 2026
- 🇬🇧 **Full scan in Diagnostics / Export**: in addition to the known addresses and a manual range, there is now a "Full scan" button that checks every address (0–32767), so even unknown retrofitted devices (Connect module, range extender) are found. A clear notice explains that this takes several hours and that the bike and cable must stay connected; it can be stopped at any time and everything read so far is kept. Still read only, personal data stays out of the file.
- 🇩🇪 **Kompletter Scan in Diagnose / Export**: Zusätzlich zu den bekannten Adressen und einem manuellen Bereich gibt es jetzt einen Knopf „Kompletter Scan", der jede Adresse abfragt (0–32767) – so werden auch unbekannte nachgerüstete Geräte (Connect-Modul, Zusatz-Akku) gefunden. Ein deutlicher Hinweis erklärt, dass das mehrere Stunden dauert und Rad und Kabel verbunden bleiben müssen; man kann jederzeit stoppen, das bereits Gelesene bleibt erhalten. Weiterhin nur lesen, persönliche Daten bleiben aus der Datei.

## 1.4.13 · November 2026
- 🇬🇧 **New "Diagnostics / Export" (read only)**: under SafeBike you can now read out your bike and save the result as a text file to send to the developer — for example when a retrofitted part (range extender, Connect module) is shown on the display and the Flow app but not yet in SelfBike. It reads the known addresses and can optionally scan an address range to capture unknown devices. Nothing is written to the bike, and personal data (serial numbers, IDs, frame number) is deliberately left out of the file.
- 🇩🇪 **Neu „Diagnose / Export" (nur lesen)**: Unter SafeBike kannst du dein Rad jetzt auslesen und das Ergebnis als Textdatei speichern, um sie dem Entwickler zu schicken — z. B. wenn ein nachgerüstetes Teil (Zusatz-Akku, Connect-Modul) zwar auf Display und in der Flow-App, aber noch nicht in SelfBike erscheint. Es liest die bekannten Adressen und kann zusätzlich einen Adressbereich scannen, um unbekannte Geräte zu erfassen. Es wird nichts ans Rad geschrieben, und persönliche Daten (Seriennummern, IDs, Rahmennummer) bleiben bewusst aus der Datei heraus.

## 1.4.12 · November 2026
- 🇬🇧 **Bike check no longer flags legal S-pedelecs**: a factory 45 km/h S-pedelec with no manipulation detected now shows "unremarkable" instead of "flagged". The check used to mark every bike with a legal limit above 25 km/h as flagged, which was a false alarm for genuine S-pedelecs. It now only flags a bike when a manipulation is detected or when the assistance reaches more than 10 % above the bike's own class limit.
- 🇩🇪 **Fahrrad-Check meldet legale S-Pedelecs nicht mehr als auffällig**: Ein ab Werk legales 45-km/h-S-Pedelec ohne erkannte Manipulation zeigt jetzt „unauffällig" statt „auffällig". Vorher wurde jedes Rad mit einer gesetzlichen Grenze über 25 km/h als auffällig markiert — ein Fehlalarm für echte S-Pedelecs. Jetzt gilt „auffällig" nur noch bei erkannter Manipulation oder wenn die Unterstützung mehr als 10 % über der eigenen Klassengrenze liegt.

## 1.4.11 · November 2026
- 🇬🇧 **Fixed "Invalid riding-mode identifier" error**: on bikes that don't have all four riding modes filled in, SelfBike could stop with "Connection failed: Invalid riding-mode identifier" — for example when resetting the service, because the safety backup reads every riding mode first. Empty or unused mode slots are now skipped instead of aborting the whole action. The bike was never at risk, and nothing was changed on it when this happened.
- 🇩🇪 **Fehler „Ungültige Fahrmodus-Kennung" behoben**: Bei Rädern, die nicht alle vier Fahrmodi belegt haben, konnte SelfBike mit „Verbindung fehlgeschlagen: Ungültige Fahrmodus-Kennung" abbrechen — z. B. beim Service-Zurücksetzen, weil das Sicherheits-Backup zuvor alle Fahrmodi ausliest. Leere oder ungenutzte Modus-Slots werden jetzt übersprungen, statt die ganze Aktion abzubrechen. Das Rad war nie in Gefahr, und es wurde dabei nichts daran verstellt.

## 1.4.10 · November 2026
- 🇬🇧 **Riding-mode speed limit per bike class**: the max-speed slider now follows the limit the bike reports for the mode (25 km/h bike → 25, 45 km/h S-pedelec → 45) instead of a fixed 25 km/h, capped absolutely at 45 km/h. This fixes a display bug on S-pedelecs where the slider jumped from 45 to 24, 23, 22… and could lower a legal 45 bike to 25 by mistake. SelfBike still never goes beyond the limit the bike itself allows, and the safety check uses only the limit read directly from the bike, never a value from the browser.
- 🇩🇪 **Fahrmodus-Tempo je Radklasse**: Der Geschwindigkeits-Regler richtet sich jetzt nach der Grenze, die das Rad für den Modus meldet (25er → 25, 45er → 45), statt nach festen 25 km/h, absolut gedeckelt auf 45 km/h. Das behebt einen Anzeigefehler bei S-Pedelecs, bei dem der Regler von 45 auf 24, 23, 22 … sprang und ein legales 45er versehentlich auf 25 hätte senken können. SelfBike geht weiterhin nie über die Grenze hinaus, die das Rad selbst erlaubt, und die Sicherheitsprüfung nutzt nur die direkt vom Rad gelesene Grenze, nie einen Wert aus dem Browser.

## 1.4.9 · November 2026
- 🇬🇧 **PDF report corrected**: the note no longer claims SelfBike is a read-only program – it now says that for this report the values were only read. In the battery section the calculated "battery charges used" (with the calculation) and the battery's own cycle counter now appear together, explained in simple words: "Used so far: 650 Wh. A full battery holds 802 Wh. That makes 0.8 full battery charges." The battery probably includes charging as well, which is why its own number is higher. Same explanation in the app. eBike Lock entries are named in full ("eBike Lock Enabled"), and fault tips no longer show a duplicate "Tip:" label.
- 🇩🇪 **PDF-Bericht korrigiert**: Der Hinweis behauptet nicht mehr, SelfBike sei ein rein lesendes Programm – er sagt jetzt, dass für diesen Bericht nur gelesen wurde. Im Akku-Abschnitt stehen die berechneten „Akkuladungen verbraucht“ (mit Rechnung) und der eigene Zyklenzähler des Akkus jetzt zusammen, einfach erklärt: „Bisher verbraucht: 650 Wh. Ein voller Akku hat 802 Wh. Das sind 0,8 volle Akkuladungen.“ Der Akku rechnet vermutlich das Aufladen mit ein, darum ist seine eigene Zahl höher. Gleiche Erklärung auch in der App. Die Einträge zum eBike Lock heißen vollständig („eBike Lock aktiviert“), und bei Fehlertipps steht kein doppeltes „Hinweis:“ mehr.

## 1.4.8 · November 2026
- 🇬🇧 **Battery usage explained**: the battery check now says "0.8 full battery charges used" instead of just a number, with an example: what counts is the energy used, not how often you charge – riding from 100 % to 30 % adds 0.7 per ride, charging in between costs nothing extra. The PDF report uses the same wording.
- 🇩🇪 **Akku-Nutzung verständlich erklärt**: Der Akku-Check zeigt jetzt „0,8 volle Akkuladungen verbraucht“ statt nur einer Zahl, mit Beispiel: Gezählt wird die verbrauchte Energie, nicht wie oft geladen wurde – wer von 100 % auf 30 % fährt, kommt pro Fahrt auf 0,7, Zwischendurch-Laden kostet nichts extra. Der PDF-Bericht verwendet dieselbe Bezeichnung.

## 1.4.7 · November 2026
- 🇬🇧 **Exact charge cycles**: full charge cycles are now calculated from the energy the battery has delivered in total, divided by its size (capacity × 36 V) – e.g. 650 Wh ÷ 802 Wh = 0.8. The calculation is shown, plus a rating (hardly / little / well / heavily used) instead of "tip". The battery's own counter, which usually shows a higher value, is still listed. **Language menu** shows the language names when opened (e.g. "CS · Čeština"), and all drop-down lists now have light text on a dark background. Unused texts of the former Flow app import were removed.
- 🇩🇪 **Genaue Ladezyklen**: Volle Ladezyklen werden jetzt aus der insgesamt abgegebenen Energie des Akkus geteilt durch seine Größe (Kapazität × 36 V) berechnet – z. B. 650 Wh ÷ 802 Wh = 0,8. Die Rechnung steht dabei, dazu eine Einstufung (kaum / wenig / gut / viel genutzt) statt „Tipp“. Der eigene Zähler des Akkus, der meist höher liegt, wird weiterhin genannt. Die **Sprachauswahl** zeigt beim Aufklappen die Sprachnamen (z. B. „CS · Čeština“), und alle Auswahllisten haben jetzt helle Schrift auf dunklem Grund. Ungenutzte Texte des früheren Flow-App-Imports sind entfernt.

## 1.4.6 · November 2026
- 🇬🇧 **Version shown in the app**: the start page now shows the SelfBike version at the bottom ("SelfBike 1.4.6 · What's new?"), linking to this list of changes. The PDF report also names the version it was created with.
- 🇩🇪 **Version in der App sichtbar**: Unten auf der Startseite steht jetzt die SelfBike-Version („SelfBike 1.4.6 · Was ist neu?“) mit Link zu dieser Liste der Änderungen. Auch der PDF-Bericht nennt die Version, mit der er erstellt wurde.

## 1.4.5 · November 2026
- 🇬🇧 **Clear message when the connection is lost**: if the connection to the bike drops (bike switched off, cable moved), SelfBike no longer starts a change with outdated values but shows "Connection lost. Please reconnect." Nothing is written in that case.
- 🇩🇪 **Klare Meldung bei Verbindungsabbruch**: Bricht die Verbindung zum Rad ab (Rad aus, Kabel bewegt), startet SelfBike keine Änderung mehr mit veralteten Werten, sondern zeigt „Verbindung verloren. Bitte neu verbinden.“ Geschrieben wird dann nichts.

## 1.4.4 · November 2026
- 🇬🇧 **SelfBike is free – clearly stated**: the PDF report, the PDF page and the start page now say that nobody may charge money for SelfBike (a workshop may only charge for its own work), with a contact address in case someone did. The Ko-fi link is marked as voluntary.
- 🇩🇪 **SelfBike ist kostenlos – jetzt deutlich sichtbar**: PDF-Bericht, PDF-Seite und Startseite sagen jetzt, dass niemand Geld für SelfBike verlangen darf (eine Werkstatt darf nur ihre eigene Arbeit berechnen), mit Kontaktadresse, falls es doch passiert ist. Der Ko-fi-Link ist als freiwillig gekennzeichnet.

## 1.4.3 · November 2026
- 🇬🇧 **Light power explained correctly**: the wattage is used by the bike to keep a battery reserve for the light – a higher value makes the motor stop assisting earlier when the battery is almost empty, it does not damage the lamps. The "Wattage checked" confirmation now only appears when you actually change the wattage; changing just the light mode no longer asks for it.
- 🇩🇪 **Lichtleistung richtig erklärt**: Nach der Watt-Angabe berechnet das Rad die Akku-Reserve fürs Licht – ein höherer Wert lässt den Motor bei fast leerem Akku früher aufhören, kaputt geht dadurch nichts. Die Abfrage „Watt-Angaben geprüft“ erscheint nur noch, wenn man die Watt-Zahl wirklich ändert; wer nur den Lichtmodus umstellt, wird nicht mehr gefragt.

## 1.4.2 · November 2026
- 🇬🇧 **Product names**: battery and control unit now show their name next to the part number, e.g. "PowerTube 800 · BBP3880" or "Kiox 400C · BRC3200" (app and PDF report). **Faults sorted by severity**: critical first, then errors, warnings and info. Backup on Android: if the file cannot be written completely, SelfBike offers it as a download instead. Clearer texts for obsolete fault codes; the "Area" line was removed.
- 🇩🇪 **Produktnamen**: Akku und Bedieneinheit zeigen jetzt ihren Namen neben der Teilenummer, z. B. „PowerTube 800 · BBP3880“ oder „Kiox 400C · BRC3200“ (App und PDF-Bericht). **Fehler nach Schwere sortiert**: zuerst kritisch, dann Fehler, Warnungen und Info. Backup auf Android: Lässt sich die Datei nicht vollständig schreiben, bietet SelfBike sie als Download an. Klarere Texte bei veralteten Fehlercodes; die Zeile „Bereich“ ist entfernt.

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
- 🇬🇧 **Fault codes explained**: every stored code now shows its area (e.g. drive unit, battery temperature, ABS wheel sensors) and a general tip on what to check — SelfBike's own wording in all 12 languages, also in the PDF report.
- 🇩🇪 **Fehlercodes erklärt**: Jeder gespeicherte Code zeigt jetzt seinen Bereich (z. B. Antriebseinheit, Akku-Temperatur, ABS-Radsensoren) und einen allgemeinen Hinweis, was man prüfen kann — eigene Formulierung in allen 12 Sprachen, auch im PDF-Bericht.

## 1.0.0 · November 2026
- 🇬🇧 **First public release**: read out Bosch Smart System e-bikes over **WebUSB**, safe changes with **backup and read-back**, assist modes (max. 25 km/h), fault memory, **PDF report** (light or dark), history, compare, demo mode and **12 languages** — live at **bike.selfcoder.de**.
- 🇩🇪 **Erste öffentliche Version**: Bosch-Smart-System-E-Bikes per **WebUSB** auslesen, sichere Änderungen mit **Backup und Rücklesen**, Fahrmodi (max. 25 km/h), Fehlerspeicher, **PDF-Bericht** (hell oder dunkel), Verlauf, Vergleich, Demo-Modus und **12 Sprachen** — live unter **bike.selfcoder.de**.
