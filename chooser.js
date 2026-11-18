// Startseite / Auswahl – nutzt die echten App-Übersetzungen (lib/i18n.js) für den Rechtshinweis.
import { LANGS, setLang, detectLang } from './lib/i18n.js';
import { VERSION } from './lib/version.js';

const STORE = 'selfbike-lang';
const DISC  = 'selfbike-disclaimer';
const $ = (id) => document.getElementById(id);
{ const v = $('verLabel'); if (v) v.textContent = 'SelfBike v' + VERSION; }

// Karten-Texte (nur hier, nicht in der App-i18n)
const S = {
  de:{title:'Welches System hast du?',intro:'Wähle dein Bosch-System. Nicht sicher? Schau in die Demo – da siehst du alles ohne Rad.',open:'Öffnen',demo:'Demo ansehen',support:'Unterstützen',disp:'Displays',year:'Baujahr',since:'ab',pcOnly:'Nur am PC / Laptop',pcPhone:'Am PC & am Handy',preSmart:'vor Smart System'},
  en:{title:'Which system do you have?',intro:"Pick your Bosch system. Not sure? Open the demo – you'll see everything without a bike.",open:'Open',demo:'View demo',support:'Support',disp:'Displays',year:'Model year',since:'since',pcOnly:'PC / laptop only',pcPhone:'On PC & phone',preSmart:'before Smart System'},
  fr:{title:'Quel système as-tu ?',intro:'Choisis ton système Bosch. Pas sûr ? Ouvre la démo – tu vois tout sans vélo.',open:'Ouvrir',demo:'Voir la démo',support:'Soutenir',disp:'Écrans',year:'Année',since:'depuis',pcOnly:'PC / portable uniquement',pcPhone:'Sur PC & téléphone',preSmart:'avant Smart System'},
  it:{title:'Che sistema hai?',intro:'Scegli il tuo sistema Bosch. Non sei sicuro? Apri la demo – vedi tutto senza bici.',open:'Apri',demo:'Guarda la demo',support:'Sostieni',disp:'Display',year:'Anno',since:'dal',pcOnly:'Solo su PC / laptop',pcPhone:'Su PC e telefono',preSmart:'prima di Smart System'},
  es:{title:'¿Qué sistema tienes?',intro:'Elige tu sistema Bosch. ¿No estás seguro? Abre la demo: lo ves todo sin bici.',open:'Abrir',demo:'Ver demo',support:'Apoyar',disp:'Pantallas',year:'Año',since:'desde',pcOnly:'Solo en PC / portátil',pcPhone:'En PC y móvil',preSmart:'antes de Smart System'},
  pt:{title:'Que sistema tens?',intro:'Escolhe o teu sistema Bosch. Em dúvida? Abre a demo – vês tudo sem bicicleta.',open:'Abrir',demo:'Ver demo',support:'Apoiar',disp:'Ecrãs',year:'Ano',since:'desde',pcOnly:'Só em PC / portátil',pcPhone:'Em PC e telemóvel',preSmart:'antes do Smart System'},
  nl:{title:'Welk systeem heb je?',intro:'Kies je Bosch-systeem. Niet zeker? Open de demo – je ziet alles zonder fiets.',open:'Openen',demo:'Demo bekijken',support:'Steunen',disp:'Displays',year:'Bouwjaar',since:'vanaf',pcOnly:'Alleen op pc / laptop',pcPhone:'Op pc & telefoon',preSmart:'vóór Smart System'},
  pl:{title:'Jaki masz system?',intro:'Wybierz swój system Bosch. Nie wiesz? Otwórz demo – zobaczysz wszystko bez roweru.',open:'Otwórz',demo:'Zobacz demo',support:'Wesprzyj',disp:'Wyświetlacze',year:'Rocznik',since:'od',pcOnly:'Tylko na PC / laptopie',pcPhone:'Na PC i telefonie',preSmart:'przed Smart System'},
  cs:{title:'Jaký máš systém?',intro:'Vyber svůj systém Bosch. Nejste si jistí? Otevři demo – uvidíš vše bez kola.',open:'Otevřít',demo:'Zobrazit demo',support:'Podpořit',disp:'Displeje',year:'Rok',since:'od',pcOnly:'Jen na PC / notebooku',pcPhone:'Na PC i telefonu',preSmart:'před Smart System'},
  da:{title:'Hvilket system har du?',intro:'Vælg dit Bosch-system. Usikker? Åbn demoen – du ser alt uden cykel.',open:'Åbn',demo:'Se demo',support:'Støt',disp:'Display',year:'Årgang',since:'fra',pcOnly:'Kun på pc / laptop',pcPhone:'På pc & telefon',preSmart:'før Smart System'},
  sv:{title:'Vilket system har du?',intro:'Välj ditt Bosch-system. Osäker? Öppna demon – du ser allt utan cykel.',open:'Öppna',demo:'Visa demo',support:'Stöd',disp:'Skärmar',year:'Årsmodell',since:'från',pcOnly:'Endast på dator / laptop',pcPhone:'På dator & telefon',preSmart:'före Smart System'},
  fi:{title:'Mikä järjestelmä sinulla on?',intro:'Valitse Bosch-järjestelmäsi. Etkö ole varma? Avaa demo – näet kaiken ilman pyörää.',open:'Avaa',demo:'Katso demo',support:'Tue',disp:'Näytöt',year:'Vuosimalli',since:'alk.',pcOnly:'Vain tietokoneella / läppärillä',pcPhone:'Tietokoneella ja puhelimella',preSmart:'ennen Smart Systemiä'}
};

function fillLangs(cur){
  $('lang').innerHTML = Object.entries(LANGS).map(([c,n]) => '<option value="'+c+'">'+n+'</option>').join('');
  $('lang').value = cur;
}
function applyCards(code){
  const s = S[code] || S.de;
  $('t-title').textContent = s.title;
  $('t-intro').textContent = s.intro;
  $('t-bes2k').textContent = 'BES2 · ' + s.preSmart;
  $('t-bes2f1').textContent = 'Active · Performance · Cargo';
  $('t-bes2f2').textContent = 'Purion · BDU2xx–4xx';
  $('t-bes2f3').textContent = s.year + ' ~2014–2021';
  $('t-bes2f4').textContent = s.pcOnly;
  $('t-ssk').textContent = 'BES3 · Smart System';
  $('t-ssf1').textContent = s.disp + ': Kiox 300 / 500';
  $('t-ssf2').textContent = 'Controller & LED-Remote';
  $('t-ssf3').textContent = s.year + ' ' + s.since + ' ~2022';
  $('t-ssf4').textContent = s.pcPhone;
  $('t-open1').textContent = s.open; $('t-demo1').textContent = s.demo;
  $('t-open2').textContent = s.open; $('t-demo2').textContent = s.demo;
  $('t-support').textContent = s.support;
}

// Rechtshinweis-Fenster
let pendingUrl = null;
function openLegal(gate, url){
  pendingUrl = gate ? url : null;
  $('legalAcceptBox').style.display = gate ? '' : 'none';
  $('legalCheck').checked = false;
  $('legalAccept').disabled = true;
  $('legal').classList.add('open');
  const b = $('legal').querySelector('.mbody'); if (b) b.scrollTop = 0;
}
function closeLegal(){ $('legal').classList.remove('open'); pendingUrl = null; }

async function init(){
  let cur = detectLang();
  fillLangs(cur);
  await setLang(cur);   // füllt alle data-i18n (Rechtstext + Fußzeile) in der Sprache
  applyCards(cur);

  $('lang').onchange = async (e) => { cur = e.target.value; await setLang(cur); applyCards(cur); };

  $('legalLink').onclick = (e) => { e.preventDefault(); openLegal(false); };
  $('legalX').onclick = closeLegal;
  $('legal').onclick = (e) => { if (e.target === $('legal')) closeLegal(); };

  // Öffnen/Demo gehen direkt weiter – der Rechtshinweis kommt erst in der App beim Verbinden.
  $('legalCheck').onchange = (e) => { $('legalAccept').disabled = !e.target.checked; };
  $('legalAccept').onclick = () => {
    try { localStorage.setItem(DISC, JSON.stringify({ v:1, at:new Date().toISOString(), lang:cur })); } catch (e) {}
    const url = pendingUrl; closeLegal();
    if (url) location.href = url;
  };
}
init();
