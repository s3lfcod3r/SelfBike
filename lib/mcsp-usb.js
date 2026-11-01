// WebUSB-Transport zur USB-Brücke der Bosch-Smart-System-Bedieneinheiten.
//
// Die Bedieneinheit (z. B. Kiox 400C / BRC3200) meldet sich als Vendor-Gerät
// (Klasse 255) mit vier Bulk-Endpunkten. Genutzt werden EP3 IN und EP4 OUT.
// Jede Nachricht läuft in drei Schritten:
//   senden:    Länge per Vendor-Request 0x48 ankündigen → Bulk OUT → Quittung über 0x47 abfragen
//   empfangen: Länge über 0x44 abfragen → Bulk IN → Empfang mit 0x45 bestätigen
// Vorher muss die Brücke konfiguriert und eine Sitzung geöffnet werden, sonst
// leitet sie nichts an den Systembus weiter.

export const BOSCH_VID = 0x108c;
export const SMART_SYSTEM_PIDS = [448, 452, 454, 462, 468];

const EP_IN = 3;
const EP_OUT = 4;
const PACKET = 64;

const REQ = {
  BRIDGE_STATUS: 0x01,
  IN_STATE: 0x44,
  IN_DONE: 0x45,
  OUT_STATE: 0x47,
  OUT_SIZE: 0x48,
};

// Konfiguration der Brücke (Reihenfolge und Inhalt wie beim Original-Tool)
const BRIDGE_CONFIG = Uint8Array.from([0x00, 0x80, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00]);
const BRIDGE_SETUP = [[0x00], [0x43, BRIDGE_CONFIG], [0x23, BRIDGE_CONFIG], [0x41], [0x21]];

// Sitzungsaufbau (Opcode 0x10). Erst danach beantwortet der Bus 0x30-Nachrichten.
const SESSION_OPEN = [
  [0x10, 0x02, 0x01, 0x03],
  [0x10, 0x03, 0x04, 0x04, 0x00],
  [0x10, 0x06, 0x02, 0x01, 0x00, 0x10, 0x00, 0x00],
  [0x10, 0x06, 0x02, 0x02, 0x00, 0x10, 0x00, 0x00],
  [0x10, 0x06, 0x02, 0x03, 0x00, 0x10, 0x00, 0x00],
  [0x10, 0x06, 0x02, 0x04, 0x00, 0x00, 0x00, 0x00],
  [0x10, 0x06, 0x02, 0x05, 0x00, 0x00, 0x00, 0x00],
  [0x10, 0x06, 0x02, 0x06, 0x00, 0x00, 0x00, 0x00],
  [0x10, 0x06, 0x02, 0x07, 0x00, 0x00, 0x00, 0x00],
].map((f) => Uint8Array.from(f));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class McspUsb {
  constructor(device, log = () => {}) {
    this.device = device;
    this.log = log;
  }

  // Muss direkt im Klick-Handler aufgerufen werden (Browser verlangt eine Nutzeraktion).
  static request() {
    return navigator.usb.requestDevice({
      filters: SMART_SYSTEM_PIDS.map((productId) => ({ vendorId: BOSCH_VID, productId })),
    });
  }

  async open() {
    const d = this.device;
    await d.open();
    if (!d.configuration) await d.selectConfiguration(1);
    await d.claimInterface(0);
    this.log('USB geöffnet, Brücke wird eingerichtet …');

    const status = await this.#controlIn(REQ.BRIDGE_STATUS, 1);
    this.log(`Brückenstatus: ${status ? status.getUint8(0) : '–'}`);
    for (const [request, data] of BRIDGE_SETUP) await this.#controlOut(request, data);

    for (const frame of SESSION_OPEN) {
      await this.send(frame);
      // Antworten auf den Sitzungsaufbau abholen, damit sie später nicht stören
      for (let i = 0; i < 4 && (await this.receive(2, 3)); i++);
    }
    this.log('Sitzung geöffnet.');
  }

  async close() {
    try {
      if (this.device.opened) {
        await this.device.releaseInterface(0).catch(() => {});
        await this.device.close();
      }
    } catch (_) { /* Gerät evtl. schon getrennt */ }
  }

  async send(payload) {
    const size = new Uint8Array(4);
    new DataView(size.buffer).setUint32(0, payload.length, true);
    await this.#controlOut(REQ.OUT_SIZE, size);

    // Bulk-Daten auf ganze 64-Byte-Pakete auffüllen
    const padded = new Uint8Array(Math.ceil(payload.length / PACKET) * PACKET);
    padded.set(payload);
    const out = await this.device.transferOut(EP_OUT, padded);
    if (out.status !== 'ok' || out.bytesWritten !== padded.length) {
      throw new Error(`USB-Senden fehlgeschlagen (${out.status})`);
    }

    for (let attempt = 0; attempt < 10; attempt++) {
      const ack = await this.#controlIn(REQ.OUT_STATE, 3);
      if (!ack || ack.byteLength < 3 || ack.getUint8(1) === 3) {
        await sleep(20); // noch beschäftigt
        continue;
      }
      if (ack.getUint8(2) !== 0) throw new Error(`Brücke meldet Sendefehler ${ack.getUint8(2)}`);
      return;
    }
    throw new Error('Keine Sendequittung von der Brücke');
  }

  // Liefert die nächsten empfangenen Bytes oder null, wenn nichts ansteht.
  async receive(polls = 50, delayMs = 5) {
    for (let i = 0; i < polls; i++) {
      const state = await this.#controlIn(REQ.IN_STATE, 7);
      const length = state && state.byteLength >= 4 ? state.getUint32(0, true) : 0;
      if (length === 0 || length > 65536) {
        await sleep(delayMs);
        continue;
      }
      const res = await this.device.transferIn(EP_IN, length);
      await this.#controlOut(REQ.IN_DONE);
      if (res.status !== 'ok' || !res.data || res.data.byteLength !== length) {
        throw new Error('USB-Empfang unvollständig');
      }
      return new Uint8Array(res.data.buffer, res.data.byteOffset, res.data.byteLength);
    }
    return null;
  }

  async #controlOut(request, data = new Uint8Array(0)) {
    const r = await this.device.controlTransferOut(
      { requestType: 'vendor', recipient: 'interface', request, value: 0, index: 0 }, data);
    if (r.status !== 'ok') throw new Error(`Steuerbefehl 0x${request.toString(16)} fehlgeschlagen (${r.status})`);
  }

  async #controlIn(request, length) {
    const r = await this.device.controlTransferIn(
      { requestType: 'vendor', recipient: 'interface', request, value: 0, index: 0 }, length);
    return r.status === 'ok' ? r.data : null;
  }
}
