// SelfBike CAN-Abgriff — ESP32 Listen-Only Sniffer für den Bosch-eBike-CAN-Bus (BES2).
//
// NUR MITHÖREN. Der TWAI-Controller läuft im LISTEN_ONLY-Modus: Er sendet nie, bestätigt
// (ACK) nicht und kann physisch keinen Frame auf den Bus legen. Reines Lesen offener
// Broadcasts — kein Diagnosezugriff, keine Freischaltung, kein Schreiben.
//
// Hardware:  ESP32 (DevKit) + Transceiver SN65HVD230 (3,3 V).
//   ESP32 GPIO5 (CTX) → SN65HVD230 D (TXD)
//   ESP32 GPIO4 (CRX) → SN65HVD230 R (RXD)
//   CANH/CANL an den Bus, GEMEINSAME MASSE, Stichleitung < 10 cm.
//   Bitrate 500 kbit/s (Bosch BES2).
//
// Ausgabe je Frame über USB-Serial, eine Zeile:  T<ID_hex><DLC><Daten_hex>
//   z. B.  T2028C0...  = ID 0x202, 8 Byte, danach die 8 Datenbytes als Hex.
// Dieses Format liest die Seite can-read.html (Web Serial) ein.

#include "driver/twai.h"

static const gpio_num_t TX_PIN = GPIO_NUM_5;   // CTX
static const gpio_num_t RX_PIN = GPIO_NUM_4;   // CRX
static const uint32_t   BAUD   = 921600;       // USB-Serial schnell genug für vollen Bus

void setup() {
  Serial.begin(BAUD);
  delay(300);

  twai_general_config_t g = TWAI_GENERAL_CONFIG_DEFAULT(TX_PIN, RX_PIN, TWAI_MODE_LISTEN_ONLY);
  g.rx_queue_len = 64;
  twai_timing_config_t t = TWAI_TIMING_CONFIG_500KBITS();
  twai_filter_config_t f = TWAI_FILTER_CONFIG_ACCEPT_ALL();

  if (twai_driver_install(&g, &t, &f) != ESP_OK) { Serial.println("# TWAI install FAIL"); return; }
  if (twai_start() != ESP_OK)                     { Serial.println("# TWAI start FAIL");   return; }
  Serial.println("# SelfBike CAN listen-only, 500 kbit/s, bereit");
}

void loop() {
  twai_message_t m;
  if (twai_receive(&m, pdMS_TO_TICKS(100)) != ESP_OK) return;
  if (m.rtr || m.extd) return;                 // nur normale 11-Bit-Datenframes

  char line[32];
  int n = snprintf(line, sizeof(line), "T%03X%u", (unsigned) m.identifier, (unsigned) m.data_length_code);
  Serial.write(line, n);
  for (int i = 0; i < m.data_length_code; i++) {
    char b[3];
    snprintf(b, sizeof(b), "%02X", m.data[i]);
    Serial.write(b, 2);
  }
  Serial.write('\n');
}
