# Bosch Gen2–Gen4 (BES2) über Kiox-USB — Protokoll-Fixture

Echte, **anonymisierte** Frames von einem Performance Line CX (Gen4), Display Kiox
(BUI330), Akku BBP290, gelesen über WebHID. Seriennummern, Teilenummern und
SecurityAccess-Seed/Key sind entfernt oder durch `XX` ersetzt. Grundlage für den
Parser und als Referenz für BES2. Bytes in Hex, Nutzlast je Frame ohne Report-ID.

## Stack
`USB-HID (64 B) → Handschlag → Legacy-Transport → CAN → ISO-TP → UDS (ISO 14229)`

Das Display führt die Sitzung und ist das Gateway zu Motor und Akku. Ohne Handschlag
sendet es nichts (reines Mitlesen ergibt 0 Pakete).

## Adresskarte (CAN)
| Steuergerät | TX (Anfrage) | RX (Antwort) |
|---|---|---|
| Motor (DU)  | `0x20` | `0x21` |
| Akku (BMS)  | `0x22` | `0x23` |
| Display (BUI) | `0x3A` | `0x3D` |

Nicht `dst+1` annehmen — Display ist `0x3A → 0x3D`.

## Handschlag (Legacy)
```
TX  00 00 01 01            # PC-Hallo, N=1 (nur Legacy angeboten)
RX  00 01 01               # [0]=0 ok, [1]=1 ok, [2]=1 = LEGACY
```

## Frame-Format (Legacy-Wrapper je CAN-Frame)
```
01 00 <canId> <DLC> <ISO-TP-PCI + Daten …>
```
- Byte 0 = `01` (ein CAN-Frame), Byte 1 = `00`
- Byte 2 = CAN-ID, Byte 3 = DLC
- ab Byte 4: ISO-TP. Nutzlast **strikt über die Längenangabe** begrenzen — der Rest
  des 64-Byte-Reports ist Trailer (Stack/CRC), keine Daten.

## ISO-TP
| Typ | PCI | Bedeutung |
|---|---|---|
| Single Frame | `0x0L` | L Datenbytes direkt (bei BUI bis ~15, da größere Frames) |
| First Frame | `0x1X XX` | 12-Bit-Gesamtlänge, 6 Startbytes, dann CF |
| Consecutive | `0x2N` | 7 Folgebytes, N = Sequenz |
| Flow Control | `30 10 05` | Clear To Send, Blockgröße 0x10, STmin 5 ms |

## UDS-Dienste
| Dienst | Bedeutung |
|---|---|
| `10 03` | Erweiterte Sitzung. Antwort `50 03 00 32 01 F4` → P2 = 50 ms, P2\* = 5 s |
| `3E 00` | TesterPresent (Keep-alive, spätestens alle 5 s) |
| `22 <DID>` | ReadDataByIdentifier |
| `19 02 08` | Fehlerspeicher (reportDTCByStatusMask) |
| `27 11` | SecurityAccess RequestSeed (Herstellerebene) — **gesperrt, nicht Teil dieses Lesers** |

Negative Antwort: `7F <Dienst> <NRC>`. Wichtige NRC: `31` existiert nicht ·
`33` SecurityAccess nötig · `13` Formatfehler · `22` falscher Zustand.

## Fehlerspeicher (frei, ohne Freischaltung)
```
# Anfrage an jedes Steuergerät
TX  01 00 20 08 03 19 02 08        # Motor
TX  01 00 22 08 03 19 02 08        # Akku
TX  01 00 3A 08 03 19 02 08        # Display

# Antworten
RX  01 00 21 08 03 59 02 7B                                  # Motor: keine Codes
RX  01 00 23 08 03 59 02 7B                                  # Akku:  keine Codes
RX  01 00 3D 0C 0B 59 02 7B 43 00 13 28 4D 30 07 68          # Display: 2 Codes
#   59 02 <mask=7B> dann je 4 Byte: DTC(3) + Status(1)
#   → 430013 (Status 0x28), 4D3007 (Status 0x68)
```

## Status / Kennungen (frei beobachtet)
```
TX  01 00 3A 08 03 22 5B 7C        RX  01 00 3D 0E 0D 62 5B 7C 42 55 49 33 33 30   # Display-Typ "BUI330"
TX  01 00 3A 08 03 22 02 20        RX  01 00 3D 08 07 62 02 20 04 00 04 00         # Display-SW 4.0.4.0
TX  01 00 22 08 03 22 01 03        RX  01 00 23 08 07 62 01 03 01 0C 01 00         # Akku-SW 1.12.1.0
TX  01 00 22 08 03 22 05 01        RX  01 00 23 08 04 62 05 01 A1                  # Akku-Status 0xA1 "Application running"
TX  01 00 22 08 03 22 01 21        RX  01 00 23 08 04 62 01 21 1F                  # Akku-Variante (Enum 0x1F)
```

## Multiframe-Beispiel (Teilenummer, Werte anonymisiert)
```
TX  01 00 22 08 03 22 01 22                                  # read 0x0122
RX  01 00 22 08 10 0E 62 01 22 XX XX XX                      # First Frame: total 14, 6 Startbytes
TX  01 00 22 08 30 10 05                                     # Flow Control (Clear To Send)
RX  01 00 23 08 21 XX XX XX XX XX XX XX                      # CF seq 1 (7 Bytes)
RX  01 00 23 08 22 XX                                        # CF seq 2 (Rest, auf total=14 begrenzt)
```

## Gesperrt über Kiox-USB (SecurityAccess, NRC 0x33)
Zustands-/Zählerwerte (Ladestand, Spannung, Temperatur, Ladezyklen, entnommene Ah,
Kilometerstand). Beispiel:
```
TX  01 00 22 08 03 22 04 13        RX  01 00 23 08 03 7F 22 33     # Spannung → SecurityAccess denied
TX  01 00 20 08 03 22 01 67        RX  01 00 21 08 03 7F 22 33     # Kilometerstand → denied
```
Diese Live-Werte laufen auf BES2 zusätzlich passiv als CAN-Broadcast (z. B. `0x203`,
`0x2AA`) — dort ohne Sperre, aber nur über einen direkten CAN-Abgriff, nicht über
Kiox-USB. Das ist ein separater, späterer Ausbau.
