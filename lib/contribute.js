/* SelfBike – Beitrag zur Kompatibilitätsliste (Opt-in).
   Der Nutzer sagt selbst „ich will beitragen"; es werden NUR die erkannten Modell-Codes
   (System, Rad, Motor, Akku, Display, Zubehör) gesendet – KEINE Seriennummern, KEINE
   persönlichen Daten. Der Eintrag erscheint erst nach Freigabe auf der Liste.

   Klassisches Script (kein ES-Modul), damit es sowohl in der BES2-Seite (klassisch) als
   auch in der Smart-App (Modul) über <script src="lib/contribute.js"> nutzbar ist.
   Stellt window.openContribute(payload, lang) bereit. */
(function () {
  'use strict';

  var WORKER = 'https://bike-list.s3lfcod3r.workers.dev';

  // Felder in Anzeige-Reihenfolge. 'extras' ist eine Liste (eShift, ABS, Charger …).
  var ORDER = ['sys', 'brand', 'model', 'motor', 'battery', 'battery2', 'display', 'remote', 'connect', 'extras'];

  // Werte, die „nichts gelesen" bedeuten und nicht gesendet werden.
  var EMPTY = { '': 1, '—': 1, '–': 1, '-': 1, '?': 1, 'n/a': 1, 'na': 1, 'unbekannt': 1, 'unknown': 1 };

  var MAXLEN = { brand: 60, model: 80 };
  var DEFLEN = 48;

  var SYSNAME = { bes2: 'BES2 (Gen 2–4)', smart: 'Smart System (BES3)' };

  var TR = {
    de: { title: 'Zur Liste beitragen', intro: 'Hilf anderen: trag die erkannten Modell-Codes deines Rads anonym zur Kompatibilitätsliste bei. Es werden nur die Typen gesendet – keine Seriennummern, keine persönlichen Daten.', consent: 'Nach kurzer Prüfung erscheint es auf der Liste.', preview: 'Das wird gesendet:', send: 'Beitragen', cancel: 'Abbrechen', sending: 'Wird gesendet …', thanks: 'Danke! Nach der Prüfung erscheint dein Rad auf der Liste.', error: 'Senden hat gerade nicht geklappt. Bitte später nochmal versuchen.', retry: 'Nochmal', close: 'Schließen', empty: 'Es wurde noch nichts ausgelesen, das beigetragen werden könnte.', lSystem: 'System', lBike: 'Rad', lMotor: 'Motor', lBattery: 'Akku', lBattery2: 'Zweitakku', lDisplay: 'Display', lRemote: 'Bedienteil', lConnect: 'Connect-Modul', lExtras: 'Mehr' },
    en: { title: 'Contribute to the list', intro: 'Help others: contribute your bike’s detected model codes to the compatibility list, anonymously. Only the types are sent – no serial numbers, no personal data.', consent: 'After a quick review it appears on the list.', preview: 'This will be sent:', send: 'Contribute', cancel: 'Cancel', sending: 'Sending …', thanks: 'Thanks! After review your bike appears on the list.', error: 'Sending didn’t work just now. Please try again later.', retry: 'Try again', close: 'Close', empty: 'Nothing read out yet to contribute.', lSystem: 'System', lBike: 'Bike', lMotor: 'Motor', lBattery: 'Battery', lBattery2: '2nd battery', lDisplay: 'Display', lRemote: 'Remote', lConnect: 'Connect module', lExtras: 'More' },
    fr: { title: 'Contribuer à la liste', intro: 'Aide les autres : ajoute anonymement les codes modèles détectés de ton vélo à la liste de compatibilité. Seuls les types sont envoyés – aucun numéro de série, aucune donnée personnelle.', consent: 'Après une courte vérification, il apparaît dans la liste.', preview: 'Ceci sera envoyé :', send: 'Contribuer', cancel: 'Annuler', sending: 'Envoi …', thanks: 'Merci ! Après vérification, ton vélo apparaît dans la liste.', error: "L'envoi n'a pas fonctionné. Réessaie plus tard.", retry: 'Réessayer', close: 'Fermer', empty: 'Rien à contribuer pour l’instant.', lSystem: 'Système', lBike: 'Vélo', lMotor: 'Moteur', lBattery: 'Batterie', lBattery2: '2e batterie', lDisplay: 'Écran', lRemote: 'Commande', lConnect: 'Module Connect', lExtras: 'Plus' },
    it: { title: 'Contribuisci alla lista', intro: 'Aiuta gli altri: aggiungi in forma anonima i codici modello rilevati della tua bici alla lista di compatibilità. Vengono inviati solo i tipi – nessun numero di serie, nessun dato personale.', consent: 'Dopo una breve verifica appare nella lista.', preview: 'Questo verrà inviato:', send: 'Contribuisci', cancel: 'Annulla', sending: 'Invio …', thanks: 'Grazie! Dopo la verifica la tua bici appare nella lista.', error: 'L’invio non è riuscito. Riprova più tardi.', retry: 'Riprova', close: 'Chiudi', empty: 'Niente ancora da contribuire.', lSystem: 'Sistema', lBike: 'Bici', lMotor: 'Motore', lBattery: 'Batteria', lBattery2: '2ª batteria', lDisplay: 'Display', lRemote: 'Comando', lConnect: 'Modulo Connect', lExtras: 'Altro' },
    es: { title: 'Contribuir a la lista', intro: 'Ayuda a otros: añade de forma anónima los códigos de modelo detectados de tu bici a la lista de compatibilidad. Solo se envían los tipos: sin números de serie, sin datos personales.', consent: 'Tras una breve revisión aparece en la lista.', preview: 'Esto se enviará:', send: 'Contribuir', cancel: 'Cancelar', sending: 'Enviando …', thanks: '¡Gracias! Tras la revisión tu bici aparece en la lista.', error: 'El envío no funcionó. Inténtalo más tarde.', retry: 'Reintentar', close: 'Cerrar', empty: 'Nada que contribuir todavía.', lSystem: 'Sistema', lBike: 'Bici', lMotor: 'Motor', lBattery: 'Batería', lBattery2: '2.ª batería', lDisplay: 'Pantalla', lRemote: 'Mando', lConnect: 'Módulo Connect', lExtras: 'Más' },
    pt: { title: 'Contribuir para a lista', intro: 'Ajuda os outros: adiciona anonimamente os códigos de modelo detetados da tua bicicleta à lista de compatibilidade. Só são enviados os tipos – sem números de série, sem dados pessoais.', consent: 'Após uma breve verificação aparece na lista.', preview: 'Isto será enviado:', send: 'Contribuir', cancel: 'Cancelar', sending: 'A enviar …', thanks: 'Obrigado! Após a verificação a tua bicicleta aparece na lista.', error: 'O envio não funcionou. Tenta mais tarde.', retry: 'Tentar de novo', close: 'Fechar', empty: 'Ainda nada para contribuir.', lSystem: 'Sistema', lBike: 'Bicicleta', lMotor: 'Motor', lBattery: 'Bateria', lBattery2: '2.ª bateria', lDisplay: 'Ecrã', lRemote: 'Comando', lConnect: 'Módulo Connect', lExtras: 'Mais' },
    nl: { title: 'Bijdragen aan de lijst', intro: 'Help anderen: voeg de herkende modelcodes van je fiets anoniem toe aan de compatibiliteitslijst. Alleen de types worden verstuurd – geen serienummers, geen persoonlijke gegevens.', consent: 'Na een korte controle verschijnt het op de lijst.', preview: 'Dit wordt verstuurd:', send: 'Bijdragen', cancel: 'Annuleren', sending: 'Versturen …', thanks: 'Bedankt! Na controle verschijnt je fiets op de lijst.', error: 'Versturen lukte nu niet. Probeer het later opnieuw.', retry: 'Opnieuw', close: 'Sluiten', empty: 'Nog niets om bij te dragen.', lSystem: 'Systeem', lBike: 'Fiets', lMotor: 'Motor', lBattery: 'Accu', lBattery2: '2e accu', lDisplay: 'Display', lRemote: 'Bediening', lConnect: 'Connect-module', lExtras: 'Meer' },
    pl: { title: 'Dodaj do listy', intro: 'Pomóż innym: dodaj anonimowo wykryte kody modeli swojego roweru do listy kompatybilności. Wysyłane są tylko typy – bez numerów seryjnych, bez danych osobowych.', consent: 'Po krótkiej weryfikacji pojawi się na liście.', preview: 'To zostanie wysłane:', send: 'Dodaj', cancel: 'Anuluj', sending: 'Wysyłanie …', thanks: 'Dzięki! Po weryfikacji Twój rower pojawi się na liście.', error: 'Wysyłka się nie powiodła. Spróbuj później.', retry: 'Ponów', close: 'Zamknij', empty: 'Nie ma jeszcze nic do dodania.', lSystem: 'System', lBike: 'Rower', lMotor: 'Silnik', lBattery: 'Akumulator', lBattery2: '2. akumulator', lDisplay: 'Wyświetlacz', lRemote: 'Sterownik', lConnect: 'Moduł Connect', lExtras: 'Więcej' },
    cs: { title: 'Přispět do seznamu', intro: 'Pomoz ostatním: přidej anonymně zjištěné kódy modelů svého kola do seznamu kompatibility. Odesílají se jen typy – žádná sériová čísla, žádné osobní údaje.', consent: 'Po krátké kontrole se objeví v seznamu.', preview: 'Toto se odešle:', send: 'Přispět', cancel: 'Zrušit', sending: 'Odesílání …', thanks: 'Díky! Po kontrole se tvé kolo objeví v seznamu.', error: 'Odeslání se teď nepovedlo. Zkus to později.', retry: 'Zkusit znovu', close: 'Zavřít', empty: 'Zatím není co přispět.', lSystem: 'Systém', lBike: 'Kolo', lMotor: 'Motor', lBattery: 'Baterie', lBattery2: '2. baterie', lDisplay: 'Displej', lRemote: 'Ovladač', lConnect: 'Modul Connect', lExtras: 'Více' },
    da: { title: 'Bidrag til listen', intro: 'Hjælp andre: tilføj anonymt din cykels registrerede modelkoder til kompatibilitetslisten. Kun typerne sendes – ingen serienumre, ingen personlige data.', consent: 'Efter et kort tjek vises det på listen.', preview: 'Dette sendes:', send: 'Bidrag', cancel: 'Annuller', sending: 'Sender …', thanks: 'Tak! Efter tjek vises din cykel på listen.', error: 'Afsendelsen lykkedes ikke. Prøv igen senere.', retry: 'Prøv igen', close: 'Luk', empty: 'Endnu intet at bidrage med.', lSystem: 'System', lBike: 'Cykel', lMotor: 'Motor', lBattery: 'Batteri', lBattery2: '2. batteri', lDisplay: 'Display', lRemote: 'Betjening', lConnect: 'Connect-modul', lExtras: 'Mere' },
    sv: { title: 'Bidra till listan', intro: 'Hjälp andra: lägg till din cykels avlästa modellkoder i kompatibilitetslistan, anonymt. Endast typerna skickas – inga serienummer, inga personuppgifter.', consent: 'Efter en kort granskning visas det i listan.', preview: 'Detta skickas:', send: 'Bidra', cancel: 'Avbryt', sending: 'Skickar …', thanks: 'Tack! Efter granskning visas din cykel i listan.', error: 'Det gick inte att skicka nu. Försök igen senare.', retry: 'Försök igen', close: 'Stäng', empty: 'Inget att bidra med ännu.', lSystem: 'System', lBike: 'Cykel', lMotor: 'Motor', lBattery: 'Batteri', lBattery2: '2:a batteri', lDisplay: 'Display', lRemote: 'Reglage', lConnect: 'Connect-modul', lExtras: 'Mer' },
    fi: { title: 'Osallistu listaan', intro: 'Auta muita: lisää pyöräsi tunnistetut mallikoodit yhteensopivuuslistaan nimettömästi. Vain tyypit lähetetään – ei sarjanumeroita, ei henkilötietoja.', consent: 'Lyhyen tarkistuksen jälkeen se näkyy listassa.', preview: 'Tämä lähetetään:', send: 'Osallistu', cancel: 'Peruuta', sending: 'Lähetetään …', thanks: 'Kiitos! Tarkistuksen jälkeen pyöräsi näkyy listassa.', error: 'Lähetys ei onnistunut nyt. Yritä myöhemmin uudelleen.', retry: 'Yritä uudelleen', close: 'Sulje', empty: 'Ei vielä mitään osallistuttavaa.', lSystem: 'Järjestelmä', lBike: 'Pyörä', lMotor: 'Moottori', lBattery: 'Akku', lBattery2: '2. akku', lDisplay: 'Näyttö', lRemote: 'Ohjain', lConnect: 'Connect-moduuli', lExtras: 'Lisää' }
  };

  function tr(lang) { return TR[lang] || TR.en; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // Einen Wert säubern: Steuerzeichen raus, Mehrfach-Leerzeichen zusammen, kürzen, „leere" Werte verwerfen.
  function clean(v, key) {
    if (v == null) return '';
    var s = String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (EMPTY[s.toLowerCase()]) return '';
    var max = MAXLEN[key] || DEFLEN;
    if (s.length > max) s = s.slice(0, max);
    return s;
  }

  // Aus der rohen Nutzlast (vom Aufrufer) eine saubere, anonyme Fassung bauen.
  function sanitize(p) {
    p = p || {};
    var out = { v: 1, sys: p.sys === 'smart' ? 'smart' : 'bes2' };
    ['brand', 'model', 'motor', 'battery', 'battery2', 'display', 'remote', 'connect'].forEach(function (k) {
      var c = clean(p[k], k);
      if (c) out[k] = c;
    });
    if (Array.isArray(p.extras)) {
      var seen = {}, ex = [];
      p.extras.forEach(function (e) {
        var c = clean(e, 'extras');
        if (c && !seen[c.toLowerCase()]) { seen[c.toLowerCase()] = 1; ex.push(c); }
      });
      if (ex.length) out.extras = ex.slice(0, 8);
    }
    out.ver = clean(p.ver, 'extras');
    out.lang = (p.lang && String(p.lang).slice(0, 5)) || '';
    return out;
  }

  // Hat der gesäuberte Beitrag überhaupt einen Inhalt außer System?
  function hasContent(c) {
    return !!(c.brand || c.model || c.motor || c.battery || c.battery2 || c.display || c.remote || c.connect || (c.extras && c.extras.length));
  }

  function rowsFor(c, L) {
    var rows = [];
    rows.push([L.lSystem, SYSNAME[c.sys] || c.sys]);
    if (c.brand || c.model) rows.push([L.lBike, [c.brand, c.model].filter(Boolean).join(' ')]);
    if (c.motor) rows.push([L.lMotor, c.motor]);
    if (c.battery) rows.push([L.lBattery, c.battery]);
    if (c.battery2) rows.push([L.lBattery2, c.battery2]);
    if (c.display) rows.push([L.lDisplay, c.display]);
    if (c.remote) rows.push([L.lRemote, c.remote]);
    if (c.connect) rows.push([L.lConnect, c.connect]);
    if (c.extras && c.extras.length) rows.push([L.lExtras, c.extras.join(' · ')]);
    return rows;
  }

  async function send(clean) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 10000);
    try {
      var r = await fetch(WORKER + '/contribute', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clean), signal: ctrl.signal
      });
      return r.ok;
    } catch (e) {
      return false;
    } finally { clearTimeout(timer); }
  }

  var styled = false;
  function injectStyle() {
    if (styled) return; styled = true;
    var css = '' +
      '.sbc-ov{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;' +
      'background:rgba(3,7,12,.68);backdrop-filter:blur(3px);animation:sbc-f .18s ease}' +
      '@keyframes sbc-f{from{opacity:0}to{opacity:1}}' +
      '.sbc-card{width:100%;max-width:420px;max-height:86vh;overflow:auto;background:var(--self-bg-1,#161b22);' +
      'color:var(--self-text,#eef4f7);border:1px solid var(--self-line,rgba(157,189,208,.18));border-radius:18px;' +
      'box-shadow:0 30px 80px rgba(0,0,0,.6);font-family:var(--self-font-sans,system-ui,sans-serif)}' +
      '.sbc-hd{display:flex;align-items:center;gap:10px;padding:16px 18px 12px;border-bottom:1px solid var(--self-line,rgba(157,189,208,.18))}' +
      '.sbc-hd .sbc-ic{font-size:20px}.sbc-hd h3{margin:0;font-size:17px;letter-spacing:-.01em}' +
      '.sbc-bd{padding:14px 18px 4px}' +
      '.sbc-bd p{margin:0 0 12px;font-size:13.5px;line-height:1.55;color:var(--self-text-2,#8a9caa)}' +
      '.sbc-pv-t{font-size:11.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--self-text-2,#8a9caa);margin:0 0 8px}' +
      '.sbc-tbl{width:100%;border-collapse:collapse;margin:0 0 12px;background:var(--self-bg-2,#0d1117);' +
      'border:1px solid var(--self-line,rgba(157,189,208,.18));border-radius:12px;overflow:hidden}' +
      '.sbc-tbl td{padding:8px 11px;font-size:13px;border-bottom:1px solid var(--self-line,rgba(157,189,208,.14));vertical-align:top}' +
      '.sbc-tbl tr:last-child td{border-bottom:0}' +
      '.sbc-tbl td.k{color:var(--self-text-2,#8a9caa);width:38%;font-weight:600}' +
      '.sbc-tbl td.v{font-family:var(--self-font-mono,ui-monospace,monospace);color:var(--self-text,#eef4f7)}' +
      '.sbc-ok{color:var(--self-teal-bright,#43d3ad)}.sbc-err{color:var(--self-red,#e5534b)}' +
      '.sbc-ft{display:flex;gap:9px;justify-content:flex-end;padding:8px 18px 16px}' +
      '.sbc-btn{appearance:none;border-radius:999px;padding:10px 18px;font-size:13.5px;font-weight:700;cursor:pointer;' +
      'border:1px solid var(--self-line-strong,rgba(157,189,208,.3));background:var(--self-bg-2,#0d1117);color:var(--self-text,#eef4f7)}' +
      '.sbc-btn.p{border-color:transparent;background:linear-gradient(135deg,var(--self-teal,#33a78c),var(--self-teal-bright,#43d3ad));color:#04110d}' +
      '.sbc-btn:disabled{opacity:.55;cursor:default}' +
      '.sbc-msg{padding:4px 18px 8px;font-size:13.5px;line-height:1.5}';
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  }

  function openContribute(payload, lang) {
    injectStyle();
    var L = tr(lang || payload && payload.lang || 'en');
    var c = sanitize(payload || {});
    var ov = document.createElement('div');
    ov.className = 'sbc-ov';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');

    function close() { if (ov.parentNode) ov.parentNode.removeChild(ov); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });

    if (!hasContent(c)) {
      ov.innerHTML = '<div class="sbc-card"><div class="sbc-hd"><span class="sbc-ic">✅</span><h3>' + esc(L.title) + '</h3></div>' +
        '<div class="sbc-msg">' + esc(L.empty) + '</div>' +
        '<div class="sbc-ft"><button class="sbc-btn" data-x>' + esc(L.close) + '</button></div></div>';
      document.body.appendChild(ov);
      ov.querySelector('[data-x]').onclick = close;
      return;
    }

    var tbl = rowsFor(c, L).map(function (r) {
      return '<tr><td class="k">' + esc(r[0]) + '</td><td class="v">' + esc(r[1]) + '</td></tr>';
    }).join('');

    ov.innerHTML = '<div class="sbc-card">' +
      '<div class="sbc-hd"><span class="sbc-ic">✅</span><h3>' + esc(L.title) + '</h3></div>' +
      '<div class="sbc-bd">' +
      '<p>' + esc(L.intro) + '</p>' +
      '<p class="sbc-pv-t">' + esc(L.preview) + '</p>' +
      '<table class="sbc-tbl">' + tbl + '</table>' +
      '<p style="margin-bottom:10px">' + esc(L.consent) + '</p>' +
      '</div>' +
      '<div class="sbc-msg" data-msg style="display:none"></div>' +
      '<div class="sbc-ft">' +
      '<button class="sbc-btn" data-cancel>' + esc(L.cancel) + '</button>' +
      '<button class="sbc-btn p" data-send>' + esc(L.send) + '</button>' +
      '</div></div>';
    document.body.appendChild(ov);

    var btnSend = ov.querySelector('[data-send]');
    var btnCancel = ov.querySelector('[data-cancel]');
    var msg = ov.querySelector('[data-msg]');
    btnCancel.onclick = close;

    btnSend.onclick = async function () {
      btnSend.disabled = true; btnCancel.disabled = true;
      msg.style.display = 'block'; msg.className = 'sbc-msg'; msg.textContent = L.sending;
      var ok = await send(c);
      if (ok) {
        msg.className = 'sbc-msg sbc-ok'; msg.textContent = L.thanks;
        btnSend.style.display = 'none';
        btnCancel.disabled = false; btnCancel.textContent = L.close;
      } else {
        msg.className = 'sbc-msg sbc-err'; msg.textContent = L.error;
        btnSend.disabled = false; btnCancel.disabled = false;
        btnSend.textContent = L.retry;
      }
    };
  }

  window.openContribute = openContribute;
  window.SelfBikeContribute = {
    open: openContribute, sanitize: sanitize, hasContent: hasContent,
    t: function (lang, key) { return tr(lang)[key]; }
  };
})();
