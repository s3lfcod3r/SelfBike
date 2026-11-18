'use strict';
/* SelfBike · BES2 (Gen2–4) Diagnose (öffentlich).
   Liest Motor/Akku/Display über WebHID aus. Freischalt-Schlüssel UND die ODX-Decode-Tabelle
   liegen geschützt in Cloudflare-Workern — der Browser schickt nur Seed bzw. Rohbytes hin und
   bekommt den Key bzw. die fertigen Klartext-Werte zurück. Kein Schlüssel, keine Tabelle im Code. */

const VID = 0x108c, PID = 0x193;
const SF_MAX = 13, FF_MAX = 6, CF_MAX = 7, KSTORE = 'bes2.slots';
const T = { SESSION_GAP:25, CONTEXT_GAP:20, KEY_GAP:15, DID_GAP:28, RESPONSE_TIMEOUT:1500,
            PENDING_EXTEND:40000, KEEPALIVE_BUSY:1800, FC_TIMEOUT:1500, LOCKOUT:12000 };
const SID_REPLY = {0x10:0x50,0x11:0x51,0x14:0x54,0x19:0x59,0x22:0x62,0x27:0x67,0x28:0x68,0x2e:0x6e,0x31:0x71,0x3e:0x7e};

// Schlüssel UND Decode-Tabelle liegen NICHT im Browser/Repo — sie kommen von geschützten Cloudflare-Workern.
const KEY_WORKER = 'https://bike-key.s3lfcod3r.workers.dev';
const DECODE_WORKER = 'https://bike-decode.s3lfcod3r.workers.dev';

const TARGETS = [
  { key:'M', id:'motor', name:'Motor', tx:0x20, rx:0x21, slot:0, kontext:[0x22,0x05,0x01], shortKey:false,
    routines:[[3,0x60,0],[3,0x60,1],[3,0x60,2],[3,0x60,3],[3,0x60,4],[3,0x60,5],[3,0x60,6],[3,0x60,7],[3,0x60,8],[3,0x60,9]],
    dids:[[1,3],[1,4],[1,5],[1,6],[1,0x13],[1,0x25],[1,0x43],[1,0x49],[1,0x4a],[1,0x4b],[1,0x4c],[1,0x4f],[1,0x50],[1,0x57],[1,0x58],[1,0x59],[1,0x67],[1,0x6b],[1,0x6c],[1,0x70],[1,0x72],[1,0x73],[1,0x74],[1,0x80],[1,0x81],[1,0x82],[1,0x85],[2,0x10],[2,0x11],[2,0x14],[2,0x16],[2,0x17],[2,0x18],[2,0x19],[2,0x20],[2,0x21],[2,0x24],[2,0x25],[2,0x26],[2,0x27],[2,0x28],[2,0x29],[2,0x2a],[2,0x2b],[2,0x2d],[2,0x40],[2,0x41],[2,0x42],[2,0x43],[2,0x44],[2,0x45],[2,0x46],[2,0x47],[2,0x48],[2,0x49],[2,0x4a],[2,0x4b],[2,0x4c],[2,0x4d],[2,0x51],[2,0x65],[2,0x67],[2,0x68],[2,0x72],[2,0x74],[2,0x80],[1,0x60],[1,0x61],[1,0x62],[1,0x63],[1,0x6a],[1,0x6d],[1,0xa0],[2,0x66],[5,1],[0x11,0x72],[0x5b,0x7c],[0xde,0x82],[0xde,0x95]] },
  { key:'A', id:'akku', name:'Akku', tx:0x22, rx:0x23, slot:1, kontext:[0x22,0x05,0x01], shortKey:false,
    routines:[],
    dids:[[1,3],[1,4],[1,5],[1,6],[1,0x20],[1,0x21],[1,0x22],[1,0x50],[2,0x22],[2,0x24],[2,0x2e],[2,0x2f],[2,0x36],[2,0x64],[2,0x73],[2,0xa0],[3,0x12],[3,0x13],[3,0x19],[4,0x13],[4,0x33],[4,0x50],[5,1],[5,0x10],[6,0x10],[6,0],[7,0xa1],[7,0xa0],[0xda,0x10],[0xda,0x15],[0xda,0x16],[3,0x70],[2,0x1c],[2,0x27],[2,0x26],[2,0x39],[2,0x50],[2,0x7c],[2,0x82],[3,0x11],[3,0x14],[3,0x16],[3,0x17],[0x42,1],[0x5b,0x7c],[0xde,0x82],[0xde,0x95]] },
  { key:'D', id:'display', name:'Display', tx:0x3a, rx:0x3d, slot:5, kontext:null, shortKey:false, routines:[],
    dids:[[0,4],[2,0x20],[2,0x21],[2,0x22],[2,0x30],[2,0x31],[2,0x32],[2,0x3a],[2,0x42],[2,0x43],[2,0x45],[2,0x52],[2,0x53],[2,0x60],[2,0x70],[2,0x71],[2,0x72],[2,0x88],[0x5b,0x7c],[0xde,0x95]] },
];

/* ---------- Schlüssel über den geschützten Worker (Keys bleiben serverseitig) ---------- */
const toHexStr=b=>[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
async function keyFor(slot,seed){
  const r=await fetch(KEY_WORKER,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slot,seed:toHexStr(seed)})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||!j.key)throw new Error('Schlüssel-Dienst: '+(j.error||('HTTP '+r.status)));
  return fromHex(j.key);
}
async function keyServiceOk(){
  try{ const r=await fetch(KEY_WORKER,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slot:5,seed:'06B4C94ECAE6C689540EE03D705C17BF'})}); const j=await r.json(); return j.key==='966F1978E3180DEBF576F9441C467F68'; }catch(e){ return false; }
}

/* ---------- Helfer ---------- */
const hex=b=>[...b].map(x=>x.toString(16).padStart(2,'0')).join(' ');
const pad=b=>b.toString(16).padStart(2,'0').toUpperCase();
const fromHex=s=>Uint8Array.from(s.replace(/\s/g,'').match(/../g).map(h=>parseInt(h,16)));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const concat=list=>{const n=list.reduce((a,x)=>a+x.length,0),o=new Uint8Array(n);let f=0;for(const a of list){o.set(a,f);f+=a.length;}return o;};
const asciiOf=b=>[...b].filter(x=>x>=0x20&&x<0x7f).map(x=>String.fromCharCode(x)).join('').trim();
const beInt=seg=>{let n=0;for(const b of seg)n=n*256+b;return n;};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------- Zustand + Log ---------- */
let device=null, busy=0, pending=null, fcWait=null;
let PROG={t:0,d:0};
const SEEDS=[]; // nicht-standardmäßige SecurityAccess-Seeds (z. B. Nyon 4 Byte) fürs Protokoll
const assembly=new Map();
let logEl=null;
function log(msg,cls){ if(!logEl)return; const d=document.createElement('div'); if(cls)d.className=cls; d.textContent=new Date().toLocaleTimeString()+'  '+msg; logEl.appendChild(d); logEl.scrollTop=logEl.scrollHeight; }
function setStatus(text,state){ const dot=el('dot'),st=el('statustext'); if(st)st.textContent=text; if(dot)dot.className='dot'+(state?' '+state:''); }

/* ---------- Transport (identisch zur geprüften unlock.js) ---------- */
function frame(dst,payload){const f=new Uint8Array(64);f[0]=1;f[1]=0;f[2]=dst;f[3]=8;f.set(payload,4);return f;}
function buiFrame(dst,pdu){const f=new Uint8Array(64);f[0]=1;f[1]=0;f[2]=dst;f[3]=pdu.length<=SF_MAX?8:0x13;f[4]=pdu.length&0xff;f.set(pdu,5);return f;}
async function rawWrite(f){log('TX '+hex(f.subarray(2,5+f[4])),'tx');await device.sendReport(0,f);}
function waitFc(t,ms){return new Promise((res,rej)=>{const tm=setTimeout(()=>{fcWait=null;rej(new Error('kein Flow Control'));},ms);fcWait={rx:t.rx,done:fc=>{clearTimeout(tm);fcWait=null;res(fc);}};});}
async function sendPdu(t,pdu){
  if(!device)throw new Error('kein Gerät');
  if(t.rx===0x3d)return rawWrite(buiFrame(t.tx,pdu));
  if(pdu.length<=SF_MAX)return rawWrite(frame(t.tx,concat([Uint8Array.of(pdu.length),pdu])));
  const head=Uint8Array.of(0x10|((pdu.length>>8)&0x0f),pdu.length&0xff);
  await rawWrite(frame(t.tx,concat([head,pdu.subarray(0,FF_MAX)])));
  const fc=await waitFc(t,T.FC_TIMEOUT); const stmin=Math.max(fc.stmin||20,10);
  let off=FF_MAX,seq=1;
  while(off<pdu.length){const ch=pdu.subarray(off,off+CF_MAX);await rawWrite(frame(t.tx,concat([Uint8Array.of(0x20|(seq++&0x0f)),ch])));off+=ch.length;if(off<pdu.length)await sleep(stmin);}
}
function request(t,pdu,ms){return new Promise((res,rej)=>{const sid=pdu[0];const tm=setTimeout(()=>{pending=null;rej(new Error('Timeout'));},ms||T.RESPONSE_TIMEOUT);pending={rx:t.rx,sid,want:SID_REPLY[sid]||0,timer:tm,resolve:d=>{clearTimeout(tm);pending=null;res(d);},reject:e=>{clearTimeout(tm);pending=null;rej(e);},rearm:()=>{clearTimeout(pending.timer);pending.timer=setTimeout(()=>{pending=null;rej(new Error('Timeout'));},T.PENDING_EXTEND);}};sendPdu(t,pdu).catch(e=>{if(pending)pending.reject(e);});});}
function deliver(d){if(pending)pending.resolve(d);}
function onReport(ev){
  if(ev.reportId!==0)return;
  const d=new Uint8Array(ev.data.buffer,ev.data.byteOffset,ev.data.byteLength);
  if(d.length>=4&&d[0]===0&&d[1]===1){log('Handshake quittiert','ok');return;}
  if(d.length<5)return;
  const src=d[2],hdr=d[4];
  if(src===0x3d){const len=d[4],data=d.slice(5,5+len);if(!data.length)return;log('RX 3d '+hex(data),'rx');handlePdu(src,data);return;}
  if((hdr&0xf0)===0x30){const fc={bs:d[5],stmin:d[6]};if(fcWait&&fcWait.rx===src)fcWait.done(fc);return;}
  if((hdr&0xf0)===0x10){const total=((hdr&0x0f)<<8)|d[5];const first=d.slice(6,6+FF_MAX);assembly.set(src,{buf:[...first],total});rawWrite(frame(src-1,Uint8Array.of(0x30,0,0))).catch(()=>{});return;}
  if((hdr&0xf0)===0x20){const a=assembly.get(src);if(!a)return;const take=Math.min(CF_MAX,a.total-a.buf.length);for(let i=0;i<take;i++)a.buf.push(d[5+i]);if(a.buf.length>=a.total){assembly.delete(src);handlePdu(src,Uint8Array.from(a.buf));}return;}
  const data=d.slice(5,5+hdr);if(!data.length)return;log('RX '+hex(data),'rx');handlePdu(src,data);
}
function handlePdu(src,pdu){
  if(!pending)return;
  if(src!==pending.rx)return;
  if(pdu.length===2&&pdu[0]===0x7e)return;
  if(pdu[0]===0x7f){if(pdu[2]===0x78){pending.rearm();return;}deliver(pdu);return;}
  if(pending.want&&pdu[0]!==pending.want)return;
  deliver(pdu);
}
async function hello(){const f=new Uint8Array(64);f[2]=1;f[3]=1;log('Handshake gesendet','lock');await device.sendReport(0,f);await sleep(500);}
let tick=null;
function attach(){device.addEventListener('inputreport',onReport);tick=setInterval(()=>{if(!device||busy>0)return;for(const t of TARGETS)sendPdu(t,Uint8Array.of(0x3e,0)).catch(()=>{});},T.KEEPALIVE_BUSY);}
async function pause(ms){busy--;await sleep(ms);busy++;}
async function checkBus(){let n=0;for(const t of TARGETS){try{const r=await request(t,Uint8Array.of(0x10,3),1200);if(r[0]===0x50){n++;log(t.name+': 50 03','ok');}else log(t.name+': '+hex(r),'warn');}catch(e){log(t.name+': '+e.message,'no');}await sleep(300);}return n;}
async function openSession(t){const r=await request(t,Uint8Array.of(0x10,3));if(r[0]!==0x50)throw new Error('Sitzung 03 abgelehnt');await sleep(T.SESSION_GAP);}
async function precheck(t){if(!t.kontext)return;await sleep(T.CONTEXT_GAP);const r=await request(t,Uint8Array.from(t.kontext));if(r[0]!==0x62)throw new Error('Kontext '+hex(r));}
async function getSeed(t,sub){const r=await request(t,Uint8Array.of(0x27,sub));if(r[0]===0x7f){const e=new Error('27'+pad(sub)+' NRC '+pad(r[2]));e.nrc=r[2];throw e;}if(r[0]!==0x67)throw new Error('27'+pad(sub)+' '+hex(r));const s=r.subarray(2);log(t.name+': Seed '+s.length+' Byte: '+hex(s),'lock');if(s.length!==16&&s.length>1)SEEDS.push(t.name+' (27'+pad(sub)+', '+s.length+' Byte): '+hex(s));if(s.length===0||s.every(x=>x===0))return new Uint8Array(16);if(s.length<16)throw new Error('Seed '+s.length+' Byte ('+hex(s)+')');return Uint8Array.from(s.subarray(0,16));}
async function sendKey(t,sub,slot){
  let seed;
  try{seed=await getSeed(t,sub);}catch(e){if(e.nrc===0x37){log(t.name+': Wartezeit – 12 s','warn');await pause(T.LOCKOUT);await openSession(t);await precheck(t);seed=await getSeed(t,sub);}else throw e;}
  let ans=await keyFor(slot,seed);
  if(t.shortKey){const sh=new Uint8Array(16);sh.set(ans.subarray(0,4));ans=sh;}
  await sleep(T.KEY_GAP);
  const r=await request(t,concat([Uint8Array.of(0x27,sub+1),ans]));
  if(r[0]===0x67){log(t.name+': freigeschaltet','ok');return true;}
  if(r[0]===0x7f){const n=r[2];log(t.name+': NRC '+pad(n)+(n===0x36?' (Zähler voll – Kiox aus/15s/ein)':n===0x35?' (Schlüssel passt nicht)':''),'no');const e=new Error('NRC'+pad(n));e.nrc=n;throw e;}
  throw new Error('unerwartet '+hex(r));
}

/* ---------- Decode über den geschützten Worker (ODX-Tabelle bleibt serverseitig) ---------- */
async function decodeAll(){
  const items=[], refs=[];
  for(const tk of ['M','A','D']){ const m=model[tk]; if(!m)continue;
    for(const did in m.dids){ items.push({t:tk,did,b:[...m.dids[did].raw]}); refs.push(m.dids[did]); }
    for(const r of m.rc){ items.push({t:tk,rid:r.rid,b:[...r.raw]}); refs.push(r); }
  }
  if(!items.length)return;
  const res=await fetch(DECODE_WORKER,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items})});
  const j=await res.json().catch(()=>({}));
  if(!res.ok||!Array.isArray(j.results))throw new Error('Decode-Dienst: '+(j.error||('HTTP '+res.status)));
  j.results.forEach((dec,i)=>{ refs[i].dec=dec; });
}

/* ---------- Auslesen ---------- */
const model={};
window.__model=model; window.__render=()=>render();
async function scanTarget(t){
  busy++;
  try{
    setStatus(t.name+' – Sitzung …','busy'); progMsg(t.name+' – Sitzung & Freischaltung …');
    await openSession(t); await precheck(t);
    let unlocked=false;
    try{ unlocked=await sendKey(t,0x11,t.slot); }catch(e){ log(t.name+': Freischaltung übersprungen ('+e.message+')','warn'); }
    const tm={unlocked,dids:{},rc:[]};
    // Routinen
    for(const r of t.routines){
      try{ const res=await request(t,concat([Uint8Array.of(0x31,0x01),Uint8Array.from(r)]));
        if(res[0]===0x71){ const rid=r.slice(0,2).map(x=>x.toString(16).padStart(2,'0')).join(''); tm.rc.push({req:r,rid,raw:res.subarray(3)}); }
      }catch(e){}
      await sleep(T.DID_GAP); if(PROG.t){PROG.d++;progTick();}
    }
    // DIDs
    setStatus(t.name+' – lese Kennungen …','busy'); progMsg(t.name+' – Kennungen lesen …');
    for(const did of t.dids){
      const didhex=did.map(x=>x.toString(16).padStart(2,'0')).join('');
      try{ const res=await request(t,Uint8Array.of(0x22,did[0],did[1]));
        if(res[0]===0x62){ tm.dids[didhex]={raw:res.subarray(3)}; }
      }catch(e){}
      await sleep(T.DID_GAP); if(PROG.t){PROG.d++;progTick();}
    }
    model[t.key]=tm;
  }finally{ busy--; }
}
async function scan(){
  if(typeof navigator==='undefined' || !navigator.hid){
    setStatus('Browser unterstützt WebHID nicht','err');
    try{ progOpen('Nicht unterstützt'); progFinish('err','Browser wird nicht unterstützt',false); progMsg('Bitte Chrome oder Edge am PC/Laptop verwenden — nicht Firefox, Safari oder Handy.'); }catch(e){}
    try{ alert('Dieser Browser kann nicht mit dem E-Bike reden (WebHID fehlt).\n\nBitte am PC/Laptop mit Chrome oder Edge öffnen — nicht mit Firefox, Safari oder am Handy.'); }catch(e){}
    reEnable(); return;
  }
  try{
    el('scan').disabled=true; const s2d=el('scan2'); if(s2d)s2d.disabled=true;
    PROG.t=0; PROG.d=0; SEEDS.length=0; progOpen('eBike wird ausgelesen …');
    progMsg('Schlüssel-Dienst prüfen …'); setStatus('Schlüssel-Dienst prüfen …','busy');
    if(!(await keyServiceOk())) throw new Error('Schlüssel-Dienst nicht erreichbar');
    if(!device){
      progMsg('Gerät auswählen …'); setStatus('Geräteauswahl …','busy');
      // Nur Hersteller-Kennung (Bosch), ohne feste PID: so erscheinen auch Nyon/Intuvia, nicht nur der Kiox.
      const [d]=await navigator.hid.requestDevice({filters:[{vendorId:VID}]});
      if(!d){setStatus('abgebrochen'); progClose(); reEnable();return;}
      await d.open(); device=d; attach();
      log('Gerät: '+(d.productName||'?')+' VID=0x'+(d.vendorId||0).toString(16)+' PID=0x'+(d.productId||0).toString(16),'ok');
      progMsg('Gerät: '+(d.productName||'Bosch')+' · PID 0x'+(d.productId||0).toString(16));
    }
    progMsg('Handschlag …'); setStatus('Handschlag …','busy'); await hello();
    progMsg('Bus prüfen …'); const n=await checkBus();
    if(!n){ setStatus('kein Gerät im Diagnosemodus – Kiox aus/15s/ein','err');
      progFinish('err','Kein Gerät gefunden',false); progMsg('Kiox aus → 15 Sek. warten → ein, dann erneut auslesen.'); reEnable(); return; }
    PROG.t=TARGETS.reduce((a,t)=>a+t.routines.length+t.dids.length,0)+1; PROG.d=0; progTick();
    for(const t of TARGETS){ await scanTarget(t); await sleep(T.SESSION_GAP); }
    progMsg('Werte dekodieren …'); setStatus('Werte dekodieren …','busy'); await decodeAll();
    PROG.d=PROG.t; progTick();
    setStatus('fertig ✓','on'); render();
    try{ if(typeof window.__afterRead==='function') window.__afterRead(); }catch(e){}
    progFinish('ok','Auslesen fertig ✓', true); progMsg('Alle Werte stehen bereit. Protokoll kannst du unten speichern.');
  }catch(e){ setStatus('Fehler: '+e.message,'err'); log(e.message,'no'); try{ if(typeof window.recordError==='function') window.recordError('auslesen', e.message); }catch(_){ } progFinish('err','Fehler beim Auslesen',false); progMsg(e.message); }
  finally{ reEnable(); }
}
function reEnable(){ el('scan').disabled=false; const s2=el('scan2'); if(s2)s2.disabled=false; el('scan').textContent='Neu auslesen'; }

/* ---------- Darstellung ---------- */
function el(id){return document.getElementById(id);}
/* ---------- Fortschritt + Unterstützung (Ko-fi) ---------- */
const PROG_RC=2*Math.PI*52;
function progSet(frac,kind){ const f=Math.max(0,Math.min(1,frac||0)); const a=el('progArc'); if(a){ a.style.strokeDashoffset=(PROG_RC*(1-f)).toFixed(1); a.style.stroke=kind==='err'?'var(--self-red)':kind==='warn'?'var(--self-yellow)':'var(--self-teal-bright)'; } const p=el('progPct'); if(p)p.textContent=Math.round(f*100)+'%'; }
function progTick(){ if(PROG.t)progSet(PROG.d/PROG.t); }
function progMsg(txt){ const s=el('progStat'); if(s)s.textContent=txt||''; }
function progOpen(title){ const m=el('prog'); if(!m)return; el('progTitle').textContent=title||'Auslesen …'; progMsg(''); el('progKofi').classList.remove('show'); el('progDone').style.display='none'; progSet(0); m.classList.add('open'); }
function progFinish(kind,title,kofi){ if(title&&el('progTitle'))el('progTitle').textContent=title; progSet(kind==='err'?(PROG.t?PROG.d/PROG.t:0):1,kind); if(el('progKofi'))el('progKofi').classList.toggle('show',!!kofi); if(el('progDone'))el('progDone').style.display=''; }
function progClose(){ const m=el('prog'); if(m)m.classList.remove('open'); }
function pick(tk,didhex,i=0){ const d=model[tk]&&model[tk].dids[didhex]; if(!d)return null; return d.dec.parts[i]||null; }
function num(tk,didhex,i=0){ const p=pick(tk,didhex,i); return p&&p.num!=null?p.num:null; }
function str(tk,didhex,i=0){ const p=pick(tk,didhex,i); return p?p.val:null; }
const km=m=>m==null?null:(m/1000);
const nf=(v,d=1)=>v==null?'—':v.toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d});
const ni=v=>v==null?'—':Math.round(v).toLocaleString('de-DE');

function gauge(pct){
  const p=Math.max(0,Math.min(100,pct||0)); const r=62,c=2*Math.PI*r, off=c*(1-p/100);
  const col=p>50?'var(--acc)':p>20?'var(--warn)':'var(--danger)';
  return `<div class="gauge"><svg width="148" height="148" viewBox="0 0 148 148">
    <circle cx="74" cy="74" r="${r}" fill="none" stroke="#1c2634" stroke-width="12"/>
    <circle cx="74" cy="74" r="${r}" fill="none" stroke="${col}" stroke-width="12" stroke-linecap="round"
      stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" style="transition:stroke-dashoffset 1s cubic-bezier(.16,1,.3,1)"/>
  </svg><div class="lbl"><div><div class="p">${p==null?'—':Math.round(p)}<span style="font-size:16px">%</span></div><div class="t">Ladung</div></div></div></div>`;
}
function metric(k,v,cls){ return `<div class="metric"><div class="m-k">${esc(k)}</div><div class="m-v${cls?' '+cls:''}">${v}</div></div>`; }

function render(){
  const stage=el('stage'); stage.innerHTML=''; stage.classList.add('show');
  const intro=el('intro'); if(intro)intro.style.display='none';

  // Werte ziehen
  const frame=str('M','0181')||'—';
  const odo=num('M','0167'); // DID 0167 ist bereits km (×0,001)
  const soc=num('A','0510');
  const volt=num('A','0413'), temp=num('A','0433'), cap=num('A','02a0');
  const cyc=(num('A','0312')||0)+(num('A','0313')||0);
  const ah=num('A','0319'), mcell=num('A','07a1'), mcellMax=num('A','0610'), debal=num('A','da10');
  const delta=debal!=null?debal*1000:(mcellMax!=null&&mcell!=null?(mcellMax-mcell)*1000:null);
  const bd=model.A&&model.A.dids['0120']; const mfg=bd?bd.dec.parts:null;
  const rtM=num('M','016b'), rtS=num('M','016c');
  const assist=num('M','0143'), disp=num('M','0210');
  const manip=num('M','0272');

  let h='';

  // Aktionsleiste
  h+=`<div class="actions"><input id="bikeName" class="bikein" maxlength="80" placeholder="Dein Fahrrad – Marke &amp; Modell (z. B. Cube Stereo Hybrid 2021)"><button class="btn-save" onclick="saveReport()">⬇ Protokoll speichern</button><span class="actions-note">Fahrrad eingeben, Seriennummern werden ausgeblendet · senden an <a href="mailto:info@selfcoder.de">info@selfcoder.de</a></span></div>`;

  // Banner
  h+=`<div class="banner">`;
  h+=`
    <div class="eyebrow">${esc(str('M','5b7c')||'eBike')} · ${esc(str('A','5b7c')||'')} · ${esc(str('D','5b7c')||'')}</div>
    <div class="frame">${esc(frame)}</div>
    <div class="sub">Modell-ID ${esc(str('M','0180')||'—')} · Motor-Nr. ${esc(str('M','014a')||'—')}</div>
    <div class="odo"><div class="num">${odo==null?'—':nf(odo,1)}</div><div class="unit">km Gesamtlaufleistung</div></div>
  </div>`;

  // Akku + Motor
  h+='<div class="grid">';
  h+=`<div class="card"><h3><span class="ico">▰</span> Akku</h3><p class="cardsub">${esc(str('A','5b7c')||'')} · ${cap?ni(cap)+' Wh':''}</p>
    <div class="batt">${gauge(soc)}
      <div class="battstats">
        ${metric('Spannung',nf(volt,2)+' <small>V</small>')}
        ${metric('Temperatur',nf(temp,1)+' <small>°C</small>', temp>45?'bad':temp<0?'warn':'')}
        ${metric('Nennkapazität',ni(cap)+' <small>Wh</small>')}
        ${metric('Ladezyklen',nf(cyc,1), cyc<300?'good':cyc<600?'warn':'bad')}
        ${metric('Entnommen',nf(ah,1)+' <small>Ah</small>')}
        ${metric('min. Zelle',nf(mcell,2)+' <small>V</small>')}
        ${metric('max. Zelle',nf(mcellMax,2)+' <small>V</small>')}
        ${metric('Zell-Delta',delta!=null?ni(delta)+' <small>mV</small>':'—', delta!=null&&delta>50?'warn':'good')}
      </div>
    </div>
    <div class="divider"></div>
    <div class="chips">
      <div class="chip"><span>Serie</span> <b>${esc(str('A','0122')||'—')}</b></div>
      ${mfg?`<div class="chip"><span>Baujahr</span> <b>${mfg[0].num}.${mfg[1].num}.${mfg[2].num}</b></div>`:''}
      <div class="chip"><span>SW</span> <b>${esc(verStr('A','0103'))}</b></div>
    </div>
  </div>`;

  h+=`<div class="card"><h3><span class="ico">⚙</span> Motor</h3><p class="cardsub">${esc(str('M','5b7c')||'')} · ${esc(str('M','0150')||'')}</p>
    <div class="battstats" style="grid-template-columns:1fr 1fr">
      ${metric('Motor-Laufzeit',nf(rtM,1)+' <small>h</small>')}
      ${metric('System an',nf(rtS,1)+' <small>h</small>')}
      ${metric('HW / SW',esc(verStr('M','0104'))+' / '+esc(verStr('M','0103')))}
      ${metric('Laufrad',(num('M','0170')||'—')+' <small>mm</small>')}
    </div>
    <div class="divider"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <span style="color:var(--mut);font-size:12.5px">Geschwindigkeit</span>
      ${manip===0?'<span class="flag ok">✓ keine Manipulation erkannt</span>':manip?'<span class="flag hot">⚠ Manipulation erkannt</span>':''}
    </div>
    <div class="speed">
      <div class="speedbox${assist>25.3?' hot':''}"><div class="s-v">${nf(assist,1)}</div><div class="s-k">Unterstützung km/h</div></div>
      <div class="speedbox"><div class="s-v">${nf(disp,1)}</div><div class="s-k">Anzeige max km/h</div></div>
    </div>
  </div>`;
  h+='</div>';

  // Mode-Distanzen
  const modes=[['Eco','0226'],['Tour','0227'],['Sport','0228'],['Turbo','0247'],['Off','022a']];
  const md=modes.map(([n,d])=>({n,km:km(num('M',d))||0}));
  const maxkm=Math.max(1,...md.map(x=>x.km));
  h+=`<div class="card"><h3><span class="ico">▤</span> Fahrstrecke nach Modus</h3><p class="cardsub">Summe entspricht dem Gesamtkilometerstand</p>
    <div class="bars">${md.map(x=>`<div class="bar"><div class="b-k">${x.n}</div><div class="b-track"><div class="b-fill" style="width:${(x.km/maxkm*100).toFixed(1)}%"></div></div><div class="b-v">${nf(x.km,1)} km</div></div>`).join('')}</div>
  </div>`;

  // Service-Historie
  const hist=(model.M&&model.M.rc||[]).map(r=>r.dec).filter(d=>d&&!d.empty&&d.parts.length>=4);
  if(hist.length){
    h+=`<div class="card"><h3><span class="ico">◷</span> Service-Historie</h3><p class="cardsub">Datum und Kilometerstand je Eintrag</p>
      <div class="timeline">${hist.map((d,i)=>{const y=d.parts[0].num,m=d.parts[1].num,day=d.parts[2].num,o=d.parts[3].num;return `<div class="tl${o===0?' first':''}"><div class="d">${String(day).padStart(2,'0')}.${String(m).padStart(2,'0')}.${y}</div><div class="k">${o===0?'Erstregistrierung / Produktion':(o/1000).toFixed(1)+' km'}</div></div>`;}).join('')}</div>
    </div>`;
  }

  // Display-Karte
  h+=`<div class="card"><h3><span class="ico">▣</span> Display</h3><p class="cardsub">${esc(str('D','5b7c')||'')}</p>
    <div class="chips">
      <div class="chip"><span>Serie</span> <b>${esc(str('D','0242')||'—')}</b></div>
      <div class="chip"><span>Teilenr.</span> <b>${esc(str('D','0232')||'—')}</b></div>
      <div class="chip"><span>SW</span> <b>${esc(verStr('D','0220'))}</b></div>
      <div class="chip"><span>HW</span> <b>${esc(verStr('D','0221'))}</b></div>
    </div>
  </div>`;

  stage.innerHTML=h;

  // Volltabellen + Log anhängen
  stage.appendChild(fullTables());
  const logWrap=document.createElement('details');
  logWrap.innerHTML='<summary>Protokoll <span class="arr">▾</span></summary>';
  const ld=document.createElement('div'); ld.id='log'; logWrap.appendChild(ld); stage.appendChild(logWrap);
  // altes Log übernehmen
  if(logEl){ ld.innerHTML=logEl.innerHTML; } logEl=ld;
}
function verStr(tk,didhex){ const p=model[tk]&&model[tk].dids[didhex]; if(!p)return '—'; const q=p.dec.parts; if(q.length>=3)return q.slice(0,4).map(x=>x.num!=null?x.num:x.val).join('.'); return q[0]?q[0].val:'—'; }

function fullTables(){
  const names={M:'Motor',A:'Akku',D:'Display'};
  const det=document.createElement('details');
  let h='<summary>Alle Werte ('+Object.values(model).reduce((a,m)=>a+Object.keys(m.dids).length,0)+' Kennungen) <span class="arr">▾</span></summary>';
  for(const tk of ['M','A','D']){
    const m=model[tk]; if(!m)continue;
    h+=`<table class="tbl"><thead><tr><th colspan="3">${names[tk]}</th></tr></thead><tbody>`;
    for(const [did,o] of Object.entries(m.dids)){
      const lbl=did.slice(0,2)+' '+did.slice(2);
      const dec=o.dec.parts.map(p=>p.name?`${esc(p.name)}: ${esc(p.val)}`:esc(p.val)).join(' · ');
      h+=`<tr><td class="did">${lbl}</td><td class="svc">${esc(o.dec.n||'')}</td><td class="val">${dec}</td></tr>`;
    }
    for(const r of (m.rc||[])){
      const lbl=r.req.map(x=>x.toString(16).padStart(2,'0')).join(' ');
      const dec=r.dec.empty?'leer':r.dec.parts.map(p=>`${esc(p.name)}: ${esc(/odometer/i.test(p.name||'')&&p.num!=null?nf(p.num/1000,1)+' km':(p.val||'unbekannt'))}`).join(' · ');
      h+=`<tr><td class="did">${lbl}</td><td class="svc">${esc(r.dec.n||'')}</td><td class="val">${dec}</td></tr>`;
    }
    h+='</tbody></table>';
  }
  det.innerHTML=h; return det;
}

/* ---------- Protokoll speichern (Seriennummern/IDs ausgeblendet) ---------- */
const BLUR=/serial|seriennumm|partnumber|teilenumm|idnumber|keynumber|rahmennumm|bike_id|number|label/i;
function blurVal(name,svc,val,isStr){ if(!isStr)return val; if(BLUR.test(name||'')||BLUR.test(svc||''))return '•••••••• (ausgeblendet)'; return val; }
const FAULT_PREF={M:['BDU','DU'],A:['BBP','BMS','BCT','BCS'],D:['HMI']};
function faultTextEng(tk,code){ const F=window.BES2_FAULTS||{}; for(const p of (FAULT_PREF[tk]||[])){ if(F[p]&&F[p][code]) return F[p][code]; } return null; }
function buildReport(dtc){
  dtc=dtc||{};
  const names={M:'Motor',A:'Akku',D:'Display'};
  const bike=(el('bikeName')?el('bikeName').value.trim():'')||'—';
  const L=['SelfBike · BES2 (Gen2–4) — Auslese-Protokoll','Fahrrad: '+bike,'Datum: '+new Date().toLocaleString('de-DE'),
    'Seriennummern/IDs sind zum Schutz ausgeblendet. Senden an: info@selfcoder.de','',
    'Typ: '+(str('M','5b7c')||'unbekannt')+' / '+(str('A','5b7c')||'unbekannt')+' / '+(str('D','5b7c')||'unbekannt'),
    'Gesamt-km: '+(num('M','0167')!=null?nf(num('M','0167'),1):'—'),''];
  for(const tk of ['M','A','D']){ const m=model[tk]; if(!m)continue;
    L.push('=== '+names[tk]+' ===');
    for(const [did,o] of Object.entries(m.dids)){
      const parts=o.dec.parts.map(p=>(p.name?p.name+': ':'')+blurVal(p.name,o.dec.n,p.val,p.str)).join(' · ');
      L.push(('  '+did.slice(0,2)+' '+did.slice(2)).padEnd(8)+(o.dec.n||'').padEnd(40)+' '+parts);
    }
    for(const r of (m.rc||[])){ const lbl=r.req.map(x=>x.toString(16).padStart(2,'0')).join(' ');
      const dec=r.dec.empty?'leer':r.dec.parts.map(p=>p.name+': '+(/odometer/i.test(p.name||'')&&p.num!=null?nf(p.num/1000,1)+' km':(p.val||'unbekannt'))).join(' · ');
      L.push(('  '+lbl).padEnd(8)+(r.dec.n||'').padEnd(40)+' '+dec); }
    L.push('');
  }
  L.push('=== Fehlerspeicher ===');
  for(const tk of ['M','A','D']){ const list=dtc[tk];
    if(list==null){ L.push('  '+names[tk]+': nicht gelesen'); continue; }
    if(list.error){ L.push('  '+names[tk]+': nicht lesbar ('+list.error+')'); continue; }
    if(!list.length){ L.push('  '+names[tk]+': keine Fehler gespeichert'); continue; }
    for(const d of list){ const act=(d.status&0x01)||(d.status&0x08); const info=faultTextEng(tk,d.code);
      L.push('  '+names[tk]+': Fehler '+d.code+' ('+(act?'aktiv':'gespeichert')+')'+(info&&info.d?' — '+info.d:'')); } }
  L.push('');
  if(SEEDS.length){ L.push('=== SecurityAccess-Seeds (für Analyse, keine persönlichen Daten) ==='); SEEDS.forEach(x=>L.push('  '+x)); L.push(''); }
  L.push('Erstellt mit SelfBike · bike.selfcoder.de');
  return L.join('\n');
}
async function saveReport(){
  if(!Object.keys(model).length){ alert('Erst auslesen.'); return; }
  const f=el('bikeName'); const bike=(f?f.value:'').trim();
  if(bike.length<3){ alert('Bitte gib dein Fahrrad ein (Marke und Modell) — damit wir das eingeschickte Protokoll zuordnen können.'); if(f){f.focus();f.style.borderColor='var(--self-red)';} return; }
  if(f)f.style.borderColor='';
  const slug=bike.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'rad';
  progOpen('Protokoll wird erstellt …'); progMsg('Fehlerspeicher wird gelesen …');
  let dtc={}; try{ dtc=await readDTC(); }catch(e){}
  const rpt=buildReport(dtc);
  try{ if(!(model&&model.__demo) && typeof window.archiveProto==='function') window.archiveProto('bes2',bike,rpt); }catch(e){}
  const blob=new Blob([rpt],{type:'text/plain;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='selfbike-protokoll-'+slug+'-'+new Date().toISOString().slice(0,10)+'.txt';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  progFinish('ok','Protokoll gespeichert ✓', true); progMsg('Danke! Schick uns die Datei gern an info@selfcoder.de.');
}
window.saveReport=saveReport;
window.__buildReport=(dtc)=>buildReport(dtc); // Protokoll-Text (Seriennummern ausgeblendet) für das Support-Paket

/* ---------- Schreiben (Beta – nur sichere Wartung, Erlaubnis-Liste). KEIN Tuning, KEINE Akku-/BMS-Werte. ---------- */
async function clearFaults(onLog){
  if(!device) throw new Error('Nicht verbunden – bitte zuerst „Verbinden & Auslesen".');
  const out=[]; busy++;
  try{
    for(const t of TARGETS){
      try{
        await openSession(t);
        // ClearDiagnosticInformation: 0x14 FF FF FF (alle gespeicherten Fehler)
        let r=await request(t,Uint8Array.of(0x14,0xff,0xff,0xff));
        if(r[0]===0x7f && (r[2]===0x33||r[2]===0x22||r[2]===0x7f)){
          try{ await precheck(t); await sendKey(t,0x11,t.slot); r=await request(t,Uint8Array.of(0x14,0xff,0xff,0xff)); }catch(e){}
        }
        let msg;
        if(r[0]===0x54) msg=t.name+': Fehlerspeicher gelöscht ✓';
        else if(r[0]===0x7f) msg=t.name+': abgelehnt (NRC 0x'+pad(r[2])+')';
        else msg=t.name+': '+hex(r);
        out.push(msg); if(onLog)onLog(msg);
      }catch(e){ const m=t.name+': '+e.message; out.push(m); if(onLog)onLog(m); }
      await sleep(T.SESSION_GAP);
    }
  } finally { busy--; }
  return out;
}
// Engine-Allowlist (doppelter Boden – unabhängig vom Worker): nur diese DIDs dürfen geschrieben werden. KEIN Tuning/BMS.
const WRITE_OK={ D:['024d','024f','024b','024a','024c','0250','0251','0243','0244','0252','0253'], M:['0225','0113','0211','0301','024d'] };
function writeAllowed(tk,didHex){ return !!(WRITE_OK[tk] && WRITE_OK[tk].includes(didHex)); }
function tgtOf(tk){ const t=TARGETS.find(x=>x.key===tk); if(!t)throw new Error('Ziel unbekannt'); return t; }
function didArr(h){ return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16)]; }
async function readRaw(t,did){ const r=await request(t,Uint8Array.of(0x22,did[0],did[1])); if(r[0]!==0x62)throw new Error('Lesen abgelehnt ('+hex(r)+')'); return r.subarray(3); }
async function writeRawPdu(t,did,raw){ const r=await request(t,concat([Uint8Array.of(0x2e,did[0],did[1]),raw])); if(r[0]===0x6e)return true; if(r[0]===0x7f){ const e=new Error('NRC 0x'+pad(r[2])); e.nrc=r[2]; throw e; } throw new Error('unerwartet '+hex(r)); }
async function ensureUnlock(t){ try{ await sendKey(t,0x11,t.slot); }catch(e){ if(!e.nrc) throw e; } }
async function readFieldRaw(tk,didHex){ const t=tgtOf(tk); busy++; try{ await openSession(t); await precheck(t); return [...await readRaw(t,didArr(didHex))]; } finally{ busy--; } }
async function writeField(tk,didHex,pos,bytes){
  if(!writeAllowed(tk,didHex)) throw new Error('Diese Einstellung ist gesperrt (kein Tuning/BMS).');
  if(!device) throw new Error('Nicht verbunden – bitte zuerst „Verbinden & Auslesen".');
  const t=tgtOf(tk), did=didArr(didHex); busy++;
  try{
    await openSession(t); await precheck(t); await ensureUnlock(t);
    const before=await readRaw(t,did); const buf=Uint8Array.from(before);
    for(let i=0;i<bytes.length;i++){ if(pos+i<buf.length) buf[pos+i]=bytes[i]&0xff; }
    await writeRawPdu(t,did,buf);
    const after=await readRaw(t,did);
    return { before:[...before], after:[...after] };
  } finally{ busy--; }
}
async function restoreField(tk,didHex,rawBytes){
  if(!writeAllowed(tk,didHex)) throw new Error('Gesperrt.');
  const t=tgtOf(tk), did=didArr(didHex); busy++;
  try{ await openSession(t); await precheck(t); await ensureUnlock(t); await writeRawPdu(t,did,Uint8Array.from(rawBytes)); return { after:[...await readRaw(t,did)] }; }
  finally{ busy--; }
}
// Fehlerspeicher lesen (UDS 0x19 0x02 0xFF) – je Steuergerät, read-only
async function reopenIfClosed(){ try{ if(device && device.opened===false) await device.open(); }catch(_){ } }
async function readDTC(){
  const out={};
  for(const t of TARGETS){
    busy++;
    try{
      // USB kann zwischen dem langen Auslesen und hier zumachen ("device closed"/Timeout):
      // einmal neu öffnen + erneut versuchen, bevor wir für dieses Steuergerät aufgeben.
      let r;
      await reopenIfClosed();
      try{ await openSession(t); r=await request(t,Uint8Array.of(0x19,0x02,0xff)); }
      catch(e1){ await reopenIfClosed(); await sleep(T.SESSION_GAP); await openSession(t); r=await request(t,Uint8Array.of(0x19,0x02,0xff)); }
      const list=[];
      if(r[0]===0x59 && r[1]===0x02){
        for(let i=3;i+3<r.length;i+=4){
          const code=(r[i]<<16)|(r[i+1]<<8)|r[i+2]; const status=r[i+3];
          if(code===0) continue;
          list.push({code:code.toString(16).toUpperCase().padStart(6,'0'), status});
        }
      } else if(r[0]===0x7f){ out[t.key]={error:'NRC 0x'+pad(r[2])}; busy--; await sleep(T.SESSION_GAP); continue; }
      out[t.key]=list;
    }catch(e){ out[t.key]={error:e.message}; }
    finally{ busy--; }
    await sleep(T.SESSION_GAP);
  }
  return out;
}
window.__bikeWrite={ clearFaults, readFieldRaw, writeField, restoreField, readDTC };
window.__scan=scan; // damit die „Mein E-Bike"-Hülle den Scan starten und abwarten kann
// TX/RX-Übertragungsverlauf als Text (für das Support-Paket, damit man sieht, wo z. B. das Fehlerlesen hängt).
window.__diagLog=()=>{ try{ return logEl ? Array.from(logEl.children).map(d=>d.textContent).join('\n') : ''; }catch(e){ return ''; } };

/* ---------- Init ---------- */
function init(){
  logEl=document.createElement('div'); logEl.style.display='none'; document.body.appendChild(logEl);
  el('scan').onclick=scan; const s2=el('scan2'); if(s2)s2.onclick=scan;
  const pd=el('progDone'); if(pd)pd.onclick=progClose;
  const pm=el('prog'); if(pm)pm.addEventListener('click',e=>{ if(e.target===pm && el('progDone').style.display!=='none') progClose(); });
}
init();
