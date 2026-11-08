// Datenpunkte, die beim Auslesen abgefragt werden (nur lesen).
// decoder: Name aus messagebus.decoders (bekommt den Eintrag als 2. Argument: unit, factor, signed).
// private: wird beim Export gekürzt.

export const READ_PLAN = [
  // Antrieb
  { address: 6147, key: 'motorModel', label: 'Motor – Modell', group: 'Antrieb', decoder: 'text' },
  { address: 6190, key: 'motorName', label: 'Motor – Bezeichnung', group: 'Antrieb', decoder: 'text' },
  { address: 6150, key: 'motorFirmware', label: 'Motor – Software', group: 'Antrieb', decoder: 'text' },
  { address: 6148, key: 'motorHardware', label: 'Motor – Hardware', group: 'Antrieb', decoder: 'text' },
  { address: 6188, key: 'motorBikeId', label: 'Motor – Bike-ID', group: 'Antrieb', decoder: 'uuid', private: true },
  { address: 6168, key: 'odometer', label: 'Kilometerstand', group: 'Antrieb', decoder: 'number', unit: 'm' },
  { address: 6145, key: 'motorSerial', label: 'Motor – Seriennummer', group: 'Antrieb', decoder: 'text', private: true },
  // Fahrrad-Check (Adressen/Typen aus dem offenen Verzeichnis von bosch-bes3-reader, siehe data/ATTRIBUTION.md)
  { address: 6269, key: 'region', label: 'Region / Geschwindigkeitsklasse', group: 'Antrieb', decoder: 'region' },
  { address: 6167, key: 'maxAssistSpeed', label: 'Unterstützung bis', group: 'Antrieb', decoder: 'number', unit: 'km/h', factor: 100 },
  // Gesetzliche Grenze laut Fahrrad (z. B. 25 km/h); maxAssistSpeed liegt bei Bosch etwas darüber (Abregelbereich)
  { address: 6163, key: 'maxLegalSpeed', label: 'Gesetzliche Höchstgeschwindigkeit', group: 'Antrieb', decoder: 'number', unit: 'km/h', factor: 100 },
  // Mehr Details (Adressen/Einheiten aus dem offenen Verzeichnis, siehe data/ATTRIBUTION.md; nur lesen)
  { address: 6199, key: 'motorMade', label: 'Motor – hergestellt', group: 'Mehr', decoder: 'text' },
  { address: 164, key: 'batteryMade', label: 'Akku – hergestellt', group: 'Mehr', decoder: 'text' },
  { address: 8294, key: 'controllerMade', label: 'Bedieneinheit – hergestellt', group: 'Mehr', decoder: 'text' },
  { address: 2320, key: 'absMade', label: 'ABS – hergestellt', group: 'Mehr', decoder: 'text' },
  // Kapazität: Rohwert in 0,01 Ah (800-Wh-Akku ≈ 22 Ah bei 36 V)
  { address: 226, key: 'batteryCapacityAh', label: 'Akku – Kapazität', group: 'Mehr', decoder: 'number', unit: 'Ah', factor: 100 },
  { address: 215, key: 'batteryDeliveredAh', label: 'Akku – abgegebene Ladung', group: 'Mehr', decoder: 'number', unit: 'Ah' },
  { address: 140, key: 'batteryVoltage', label: 'Akku – Spannung', group: 'Mehr', decoder: 'number', unit: 'V', factor: 1000 },
  { address: 159, key: 'batteryMaxCurrent', label: 'Akku – max. Ladestrom', group: 'Mehr', decoder: 'number', unit: 'A', factor: 10, signed: true },
  { address: 139, key: 'batteryTempNow', label: 'Akku – Temperatur Zellen', group: 'Mehr', decoder: 'number', unit: '°C', factor: 10, signed: true },
  { address: 210, key: 'batteryFetTemp', label: 'Akku – Temperatur Elektronik', group: 'Mehr', decoder: 'number', unit: '°C', factor: 10, signed: true },
  { address: 157, key: 'batteryThermal', label: 'Akku – Zeit im Überhitzungsschutz', group: 'Mehr', decoder: 'number', unit: 's' },
  { address: 225, key: 'batteryDeepDischarge', label: 'Akku – Tiefentladungen', group: 'Mehr', decoder: 'uint' },
  { address: 220, key: 'batterySelfDischarge', label: 'Akku – Selbstentladung', group: 'Mehr', decoder: 'number', factor: 10 },
  { address: 6217, key: 'rangeExtender', label: 'PowerMore möglich', group: 'Mehr', decoder: 'bool' },
  { address: 6184, key: 'wheelOem', label: 'Radumfang ab Werk', group: 'Mehr', decoder: 'number', unit: 'mm', factor: 10 },
  { address: 6185, key: 'wheelUser', label: 'Radumfang eingestellt', group: 'Mehr', decoder: 'number', unit: 'mm', factor: 10 },
  { address: 6180, key: 'startMode', label: 'Startmodus', group: 'Mehr', decoder: 'startMode' },
  { address: 8545, key: 'gearCount', label: 'eShift – Gänge', group: 'Mehr', decoder: 'gearCount' },
  { address: 8547, key: 'gearNow', label: 'eShift – aktueller Gang', group: 'Mehr', decoder: 'uint' },
  { address: 8549, key: 'gearCadence', label: 'eShift – Ziel-Trittfrequenz', group: 'Mehr', decoder: 'number', unit: 'U/min' },
  { address: 8546, key: 'gearCadenceLimits', label: 'eShift – Trittfrequenz-Bereich', group: 'Mehr', decoder: 'cadenceLimits' },
  { address: 2314, key: 'absModes', label: 'ABS – verfügbare Modi', group: 'Mehr', decoder: 'stringList' },
  { address: 2332, key: 'absDisc', label: 'ABS – Bremsscheibe vorne', group: 'Mehr', decoder: 'number', unit: 'mm' },
  { address: 2324, key: 'absUpdates', label: 'ABS – Software-Updates', group: 'Mehr', decoder: 'uint' },
  // ABS (nur wenn verbaut; sonst „kein Empfänger“)
  { address: 2319, key: 'absName', label: 'ABS – Produkt', group: 'ABS', decoder: 'text' },
  { address: 2313, key: 'absMode', label: 'ABS – Modus', group: 'ABS', decoder: 'text' },
  { address: 2310, key: 'absSoftware', label: 'ABS – Software', group: 'ABS', decoder: 'text' },
  { address: 6225, key: 'tuning', label: 'Tuning-Erkennung', group: 'Antrieb', decoder: 'tuning' },
  // Akku
  { address: 131, key: 'batteryProduct', label: 'Akku – Modell', group: 'Akku', decoder: 'text' },
  { address: 134, key: 'batterySoftware', label: 'Akku – Software', group: 'Akku', decoder: 'text' },
  { address: 132, key: 'batteryHardware', label: 'Akku – Hardware', group: 'Akku', decoder: 'text' },
  { address: 136, key: 'batterySoc', label: 'Akku – Ladezustand', group: 'Akku', decoder: 'number', unit: '%' },
  { address: 216, key: 'batterySoh', label: 'Akku – Gesundheit (SOH)', group: 'Akku', decoder: 'number', unit: '%' },
  { address: 150, key: 'batteryCycles', label: 'Akku – volle Ladezyklen', group: 'Akku', decoder: 'number', factor: 10 },
  { address: 146, key: 'batteryRemainingWh', label: 'Akku – Restenergie', group: 'Akku', decoder: 'number', unit: 'Wh', factor: 10 },
  { address: 145, key: 'batteryRiderWh', label: 'Akku – nutzbare Restenergie', group: 'Akku', decoder: 'number', unit: 'Wh', factor: 10 },
  { address: 129, key: 'batterySerial', label: 'Akku – Seriennummer', group: 'Akku', decoder: 'text', private: true },
  { address: 156, key: 'batteryEnergy', label: 'Akku – abgegebene Energie gesamt', group: 'Akku', decoder: 'number', unit: 'Wh' },
  { address: 160, key: 'batteryTempMax', label: 'Akku – höchste Temperatur', group: 'Akku', decoder: 'number', unit: '°C', factor: 10, signed: true },
  { address: 161, key: 'batteryTempMin', label: 'Akku – niedrigste Temperatur', group: 'Akku', decoder: 'number', unit: '°C', factor: 10, signed: true },
  // leer = keine Schlüsselnummer im System hinterlegt
  { address: 6195, key: 'batteryKeyNumber', label: 'Akku – Schlüsselnummer', group: 'Akku', decoder: 'raw', private: true },
  // Ladefenster (SoC-Grenzen): 162 untere, 163 obere Prozentgrenze. Beta – wird in bike-writer geprüft.
  { address: 162, key: 'socMin', label: 'Akku – Ladefenster unten', group: 'Akku', decoder: 'number', unit: '%' },
  { address: 163, key: 'socMax', label: 'Akku – Ladefenster oben', group: 'Akku', decoder: 'number', unit: '%' },
  // Bedieneinheit
  { address: 8293, key: 'controllerProduct', label: 'Bedieneinheit – Modell', group: 'Bedieneinheit', decoder: 'text' },
  { address: 8299, key: 'controllerSoftware', label: 'Bedieneinheit – Software', group: 'Bedieneinheit', decoder: 'text' },
  { address: 8291, key: 'controllerHardware', label: 'Bedieneinheit – Hardware', group: 'Bedieneinheit', decoder: 'text' },
  { address: 8289, key: 'controllerSerial', label: 'Bedieneinheit – Seriennummer', group: 'Bedieneinheit', decoder: 'text', private: true },
  { address: 8580, key: 'controllerBikeId', label: 'Bedieneinheit – Bike-ID', group: 'Bedieneinheit', decoder: 'uuid', private: true },
  // Anzeige-Einstellungen (in der Flow-App einstellbar; am Rad gelesen 2026-10-28)
  { address: 8577, key: 'displayLanguage', label: 'Bedieneinheit – Sprache', group: 'Bedieneinheit', decoder: 'text' },
  { address: 8578, key: 'displayUnits', label: 'Bedieneinheit – Einheiten', group: 'Bedieneinheit', decoder: 'units' },
  { address: 8579, key: 'timeFormat', label: 'Bedieneinheit – Uhrzeitformat', group: 'Bedieneinheit', decoder: 'timeFormat' },
  { address: 8226, key: 'bikeClock', label: 'Bedieneinheit – Uhrzeit', group: 'Bedieneinheit', decoder: 'clock' },
  { address: 6179, key: 'startModeOem', label: 'Startmodus – Herstellervorgabe', group: 'Mehr', decoder: 'startModeOem' },
  // Schiebehilfe (Felder aus der Flow-App: enabled, maximum_speed; am Rad gelesen 2026-10-28)
  { address: 6182, key: 'walkAssist', label: 'Schiebehilfe', group: 'Mehr', decoder: 'walkAssist' },
  { address: 6181, key: 'walkAssistOem', label: 'Schiebehilfe – Herstellervorgabe', group: 'Mehr', decoder: 'walkAssistOem' },
  // Fahrrad
  { address: 6252, key: 'oemBrand', label: 'Fahrrad – Marke', group: 'Fahrrad', decoder: 'text' },
  { address: 6261, key: 'oemModel', label: 'Fahrrad – Modell', group: 'Fahrrad', decoder: 'text' },
  { address: 6238, key: 'oemBikeNumber', label: 'Fahrrad – Herstellernummer', group: 'Fahrrad', decoder: 'text', private: true },
  { address: 8455, key: 'lockEnabled', label: 'eBike Lock – aktiviert', group: 'Fahrrad', decoder: 'bool' },
  { address: 8453, key: 'lockLocked', label: 'eBike Lock – gesperrt', group: 'Fahrrad', decoder: 'bool' },
  // Fahrstatistik
  { address: 6169, key: 'powerOnHours', label: 'Statistik – Betriebszeit', group: 'Statistik', decoder: 'number', unit: 'h' },
  { address: 6253, key: 'motorHours', label: 'Statistik – davon mit Motorunterstützung', group: 'Statistik', decoder: 'number', unit: 'h' },
  { address: 6262, key: 'cadence', label: 'Statistik – Ø Trittfrequenz', group: 'Statistik', decoder: 'number', unit: 'U/min', signed: true },
  { address: 6223, key: 'rideStats', label: 'Statistik – seit Reset', group: 'Statistik', decoder: 'rideStats' },
  // Fahrmodi (Kennungen + Namen, für die Strecke pro Modus)
  { address: 6222, key: 'activeModes', label: 'Fahrmodi – aktiv', group: 'Fahrmodi', decoder: 'configIds' },
  { address: 6157, key: 'modeNames', label: 'Fahrmodi – Namen', group: 'Fahrmodi', decoder: 'stringList' },
  // Service
  { address: 8581, key: 'serviceDue', label: 'Nächster Service', group: 'Service', decoder: 'service' },
  // Licht
  { address: 6175, key: 'lightOem', label: 'Licht – Herstellerfreigabe', group: 'Licht', decoder: 'lightOem' },
  { address: 6176, key: 'lightAvailable', label: 'Licht – freigeschaltet', group: 'Licht', decoder: 'bool' },
  // bestätigt durch Vergleich: leer = aus, F1=1 = Licht leuchtet gerade
  { address: 6172, key: 'lightState', label: 'Licht – leuchtet gerade', group: 'Licht', decoder: 'bool' },
  { address: 6177, key: 'lightMode', label: 'Licht – Modus', group: 'Licht', decoder: 'lightMode' },
  { address: 6178, key: 'lightPower', label: 'Licht – Gesamtleistung', group: 'Licht', decoder: 'deciWatt' },
  // Zubehöranschlüsse
  { address: 6192, key: 'portOem', label: 'Power Ports – Herstellerfreigabe', group: 'Power Ports', decoder: 'portOem' },
  { address: 6193, key: 'lowPortActive', label: 'Low Power Port aktiv', group: 'Power Ports', decoder: 'bool' },
  { address: 6194, key: 'highPortActive', label: 'High Power Port aktiv', group: 'Power Ports', decoder: 'bool' },
  // Zweiter Akku / Range-Extender (z. B. PowerMore 250). Eigener Block, ~512 Adressen hinter dem Hauptakku.
  // Nur wenn verbaut; sonst „kein Empfänger“. Adressen aus Komplett-Scans nachgerüsteter Räder.
  { address: 643, key: 'battery2Product', label: 'Zusatzakku – Modell', group: 'Akku 2', decoder: 'text' },
  { address: 646, key: 'battery2Software', label: 'Zusatzakku – Software', group: 'Akku 2', decoder: 'text' },
  { address: 644, key: 'battery2Hardware', label: 'Zusatzakku – Hardware', group: 'Akku 2', decoder: 'text' },
  { address: 648, key: 'battery2Soc', label: 'Zusatzakku – Ladezustand', group: 'Akku 2', decoder: 'number', unit: '%' },
  { address: 728, key: 'battery2Soh', label: 'Zusatzakku – Gesundheit (SOH)', group: 'Akku 2', decoder: 'number', unit: '%' },
  { address: 738, key: 'battery2Capacity', label: 'Zusatzakku – Kapazität', group: 'Akku 2', decoder: 'number', unit: 'Ah', factor: 100 },
  { address: 676, key: 'battery2Made', label: 'Zusatzakku – hergestellt', group: 'Akku 2', decoder: 'text' },
  // Connect Module (z. B. BCM3101). Nur wenn verbaut.
  { address: 2821, key: 'connectProduct', label: 'Connect Module – Modell', group: 'Connect', decoder: 'text' },
  { address: 2827, key: 'connectSoftware', label: 'Connect Module – Software', group: 'Connect', decoder: 'text' },
  { address: 2820, key: 'connectHardware', label: 'Connect Module – Hardware', group: 'Connect', decoder: 'text' },
  { address: 2822, key: 'connectMade', label: 'Connect Module – hergestellt', group: 'Connect', decoder: 'text' },
  // Zweites Display / Head-Unit (z. B. Kiox 500, BHU3700). Nur wenn verbaut.
  { address: 3331, key: 'headProduct', label: 'Display – Modell', group: 'Display', decoder: 'text' },
  { address: 3334, key: 'headSoftware', label: 'Display – Software', group: 'Display', decoder: 'text' },
  { address: 3332, key: 'headHardware', label: 'Display – Hardware', group: 'Display', decoder: 'text' },
  { address: 3336, key: 'headMade', label: 'Display – hergestellt', group: 'Display', decoder: 'text' },
];
