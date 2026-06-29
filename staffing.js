/* ===================== EWR MOVE TEAM — MANPOWER / STAFFING =====================
   Supervisor links 3 eTA exports (Manpower PDF, OT Award PDF, Call-out .xls),
   the tool builds the per-shift pool and generates the EWR AMT STAFFING sheet. */
(function(){
"use strict";
const $=(s,el=document)=>el.querySelector(s);
const $$=(s,el=document)=>[...el.querySelectorAll(s)];
const esc=s=>(s==null?"":String(s)).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const UP=`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`;
const CK=`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

/* ---------- config ---------- */
const SHIFTS=["AM","PM","NH"];
const SHIFT_CORE={AM:[300,780],PM:[780,1260],NH:[1260,1740]}; // 05–13 / 13–21 / 21–05 (mins)
const TUGS=[1,3,4,10,17,18,19,20,21,22,23,24,25,26,27,28,29,51];
const TUG_GROUPS=[{label:"1 · 3 · 4",ids:[1,3,4]},{label:"10–19",ids:[10,17,18,19]},{label:"20–29",ids:[20,21,22,23,24,25,26,27,28,29]},{label:"51",ids:[51]}];
const ELECTRIC=new Set([20,25,26,28,29]);
const DISPATCHERS=["Plant, Corey","Castro, Alex","Cope, Yolanda","Santana, Carlos","Menendez, Kevin","Murillo Mieles, Andres","Murray, Naki","Young, Benjamin","Platero, German","Reid, Sharee"];
const AREAS=[ // min staffing per shift; null = supervisor discretion
  {key:"Ballpark",  min:{AM:3,PM:3,NH:3}},
  {key:"WestPark",  min:{AM:2,PM:2,NH:2}},
  {key:"South Team",min:{AM:2,PM:2,NH:2}},
  {key:"Terminal B",min:{AM:1,PM:2,NH:1}},
  {key:"APU",       min:{AM:1,PM:1,NH:1}},
  {key:"Support",   min:null},
  {key:"C4",        min:null},
];
const SUP_DEFAULT=["Sheldon","Paulia","Qua","Mark","Stephanie","Denroy","Earl","John","Juan"];
const MANAGERS=["Steve"];
const ASSTMGRS=["Jay","Tito"];
/* roster store (base supervisors + co-signed temporary supervisors) */
function loadTempSups(){const d=Store.getJSON("elt.staff.tempsups",[]);return Array.isArray(d)?d:[];}
function saveTempSups(l){Store.setJSON("elt.staff.tempsups",l);}
function supervisorList(){ const t=loadTempSups().map(x=>x.name); return [...SUP_DEFAULT,...t.filter(n=>!SUP_DEFAULT.includes(n))]; }
const SUPERVISORS=supervisorList(); // compatibility (recomputed where it matters via supervisorList())
function isTempSup(name){ return loadTempSups().some(x=>x.name===name); }
function rosterAll(){ return [...supervisorList().map(n=>({name:n,role:"Supervisor",temp:isTempSup(n)})),
  ...MANAGERS.map(n=>({name:n,role:"Manager",temp:false})), ...ASSTMGRS.map(n=>({name:n,role:"Assistant Manager",temp:false}))]; }

/* per-person codes (stored hashed, never plaintext) */
function loadCodes(){return Store.getJSON("elt.staff.codes",{})||{};}
function saveCodes(c){return Store.setJSON("elt.staff.codes",c);}
function hasCode(name){ return !!loadCodes()[name]; }
function resetCode(name){ const c=loadCodes(); delete c[name]; saveCodes(c); }
async function hashCode(salt,code){
  try{ const data=new TextEncoder().encode(salt+"|"+code);
    const buf=await crypto.subtle.digest("SHA-256",data);
    return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join(""); }
  catch(_){ let h=0; const s=salt+"|"+code; for(let i=0;i<s.length;i++){h=(h*31+s.charCodeAt(i))>>>0;} return "f"+h.toString(16); }
}
function randSalt(){ const a=new Uint8Array(8); (crypto.getRandomValues?crypto.getRandomValues(a):a.forEach((_,i)=>a[i]=i*7)); return [...a].map(b=>b.toString(16).padStart(2,"0")).join(""); }
async function setCode(name,code){ const c=loadCodes(); const salt=randSalt(); c[name]={salt,hash:await hashCode(salt,code)}; return saveCodes(c); }
async function checkCode(name,code){ const e=loadCodes()[name]; if(!e)return false; return (await hashCode(e.salt,code))===e.hash; }
const EXCLUDE_DEFAULT=["Bonet, Christopher","Vizcaino, Angel","Dickey, Todd","Mendes","Stephens, Kevin"];
const OUT_CODES=new Set(["VC","OUT","DTO","HOLT","DATV","DO","SICK","SICK ","CB","SKU","SKUS","Partial DTO","Shift Trade","HOLF","HOLM","JD","MD","DATC","DAT3","C4D","HODV"]);
const WORKED_CODES=new Set(["DTW","HWP","HWFT"]);

/* ---------- bid results (hours + days off per emp) ---------- */
let BIDS=null;
async function loadBids(){ if(BIDS)return BIDS; try{const r=await fetch("./bids.json",{cache:"force-cache"});const j=await r.json();BIDS=j.bids||{};}catch(_){BIDS={};} return BIDS; }

/* ---------- pdf.js (vendored, lazy) ---------- */
let pdfjs=null;
async function loadPdfjs(){
  if(pdfjs)return pdfjs;
  pdfjs=await import("./vendor/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc="./vendor/pdf.worker.min.mjs";
  return pdfjs;
}
async function pdfTokens(file){
  const lib=await loadPdfjs();
  const data=new Uint8Array(await file.arrayBuffer());
  const doc=await lib.getDocument({data,useSystemFonts:true}).promise;
  const toks=[];
  for(let p=1;p<=doc.numPages;p++){
    const page=await doc.getPage(p);
    const tc=await page.getTextContent();
    const items=tc.items.filter(it=>it.str.trim()).map(it=>({s:it.str.trim(),x:it.transform[4],y:it.transform[5]}));
    items.sort((a,b)=>(b.y-a.y)||(a.x-b.x));
    let cur=null;const lines=[];
    for(const it of items){ if(!cur||Math.abs(cur.y-it.y)>3){cur={y:it.y,its:[it]};lines.push(cur);} else cur.its.push(it); }
    for(const ln of lines){ ln.its.sort((a,b)=>a.x-b.x); ln.its.forEach(it=>toks.push(it.s)); }
  }
  return toks;
}

/* ---------- parsers ---------- */
const isDate=s=>/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s);
const isTime=s=>/^\d{1,2}:\d{2}$/.test(s);
const isEmp=s=>/^\d{6}$/.test(s);
const isName=s=>/^[A-Z][A-Za-z'.\-\s]*,\s*[A-Za-z]/.test(s);
const isStamp=s=>/^\d{1,2}\/\d{1,2}\/\d{4}\s+\d/.test(s)||/^Page \d+ of \d+$/i.test(s)||/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s);
const SECT={"DISPATCH":"DISPATCH","EWR-PUSH TEAM":"PUSH","OR B - RELIEF":"PUSH","PUSH TEAM TRAINING":"TRAINING","SAFETY ADV":"SAFETY"};
const MP_NOISE=new Set(["eTA Manpower sheet for Cost Center for 7134","Wednesday","Sunday","Monday","Tuesday","Thursday","Friday","Saturday","PUSH TEAM","Move Team Employee","Craft Sen. Dt","Company Sen. Dt","Start","End","End  ","Emp #","Outage","Trade Type","Trade Name","DISPATCH","EWR-PUSH TEAM","OR B - RELIEF","PUSH TEAM TRAINING","SAFETY ADV"]);

function parseManpower(rawToks){
  let section="";const T=[],S=[];
  for(const l of rawToks){ if(!l)continue; if(SECT[l]){section=SECT[l];continue;} if(MP_NOISE.has(l)||isStamp(l))continue; T.push(l);S.push(section); }
  const recs=[];let i=0;
  while(i<T.length){
    if(!isName(T[i])){i++;continue;}
    const name=T[i],sec=S[i];i++;
    const craft=isDate(T[i])?T[i++]:"";const comp=isDate(T[i])?T[i++]:"";
    const start=isTime(T[i])?T[i++]:"";const end=isTime(T[i])?T[i++]:"";const emp=isEmp(T[i])?T[i++]:"";
    const rec={name,sec,start,end,emp,code:"",covers:[]};
    while(i<T.length){
      const t=T[i];
      if(isName(t)&&isDate(T[i+1]))break;
      if(isName(t))break;
      const code=t;i++;rec.code=rec.code||code;
      if(isName(T[i])&&isEmp(T[i+1])&&isTime(T[i+2])&&isTime(T[i+3])){
        rec.covers.push({name:T[i],emp:T[i+1],start:T[i+2],end:T[i+3],type:code});i+=4;
      }
    }
    recs.push(rec);
  }
  return recs;
}

function parseOT(rawToks){
  const toks=rawToks.map(s=>s.trim());
  // each award row contains one "EWR BTW" (Line ID cell); use it as the record boundary
  const idxs=[];toks.forEach((t,i)=>{ if(t==="EWR BTW"||/^\d{6,8} EWR BTW$/.test(t))idxs.push(i); });
  const recs=[];
  for(let k=0;k<idxs.length;k++){
    const a=idxs[k], b=k+1<idxs.length?idxs[k+1]:toks.length;
    const block=toks.slice(a,b);
    const times=block.filter(x=>/^\d{1,2}:\d{2}$/.test(x));
    const emp=block.find(x=>/^\d{6}$/.test(x));
    const name=emp?block[block.indexOf(emp)+1]:"";
    if(name&&isName2(name)&&times.length>=2) recs.push({name,emp:emp||"",start:times[0],end:times[1],src:"OT"});
  }
  return recs;
}
const isName2=s=>/[A-Za-z]/.test(s)&&!/^\d/.test(s)&&!/^(OTSB|OTAD|PUSH|TEAM|EWR)/.test(s);

function parseCallout(html,dateStr){
  const rows=[...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m=>
    [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(c=>c[1].replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ").trim()));
  if(!rows.length)return [];
  const H=rows[0],idx=n=>H.indexOf(n);
  const out=[];
  for(const r of rows.slice(1)){
    const o={name:r[idx("FULL_NAME")],emp:r[idx("EMPL_ID")],reason:r[idx("REASON_DESCRIPTION")],dur:r[idx("DURATION")],absStart:r[idx("ABSENCE_START")]};
    if(o.emp)out.push(o);
  }
  return dateStr?out.filter(o=>(o.absStart||"").startsWith(dateStr)):out;
}

/* ---------- shift bucketing ---------- */
function mins(t){const m=(t||"").match(/^(\d{1,2}):(\d{2})$/);return m?(+m[1])*60+(+m[2]):null;}
function ivl(s,e){let a=mins(s),b=mins(e);if(a==null||b==null)return null;if(b<=a)b+=1440;return [a,b];}
function ovl(p,w){let best=0;for(const off of [0,1440]){const a=Math.max(p[0],w[0]+off),b=Math.min(p[1],w[1]+off);best=Math.max(best,b-a);}return Math.max(0,best);}
function primaryShift(start){const a=mins(start);if(a==null)return "PM";if(a>=240&&a<720)return "AM";if(a>=720&&a<1260)return "PM";return "NH";}
function shiftsFor(b){
  const p=ivl(b.start,b.end);if(!p)return [];
  const prim=primaryShift(b.start),out=[];
  for(const sh of SHIFTS){ const o=ovl(p,SHIFT_CORE[sh]); if(sh===prim)out.push({sh,prim:true,ov:o}); else if(o>60)out.push({sh,prim:false,ov:o}); }
  return out;
}
const normName=n=>(n||"").toLowerCase().replace(/[.,]/g,"").replace(/\s+/g," ").trim();
// exclusion entries may be a full "Last, First" or just a last name ("Mendes")
function isExcluded(name){
  const pn=normName(name),last=pn.split(" ")[0];
  return excludeList().some(e=>{const en=normName(e);return en===pn||(en.indexOf(" ")<0&&en===last);});
}

/* =====================  STATE  ===================== */
const ST={
  step:"menu",
  files:{mp:null,ot:null,co:null},
  parsed:null,           // {mpRecs, otRecs, coRows, date}
  shift:"AM",
  numTugs:8,
  prompts:{},            // name -> bool (trainees + exclusions availability)
  supers:[], manager:MANAGERS[0]||"", asst:[],
  tug:{},                // tugId -> "unset"|"ready"|"inop"|"oos"
  dispatch:null,         // {name,emp}
  brief:null,            // briefing fields (phase 2)
  bodies:null,           // built pool bodies (all shifts)
  assign:null,           // {tugs:{id:{DRIVER,OBSERVR}}, areas:{key:[...]}}
};
/* 4-state tug cycle: unset(grey) → ready(green) → inop(yellow) → oos(red) → unset */
const TUG_ORDER=["unset","ready","inop","oos"];
function tugSt(id){ return ST.tug[id]||"unset"; }
function setTug(id,s){ ST.tug[id]=s; }
function cycleTug(id){ ST.tug[id]=TUG_ORDER[(TUG_ORDER.indexOf(tugSt(id))+1)%TUG_ORDER.length]; }
// compatibility view used by sheets/board/exports
function tugState(id){ const s=tugSt(id); return {state:s, oos:s==="oos", gpu:s==="inop"?"inop":"ok", running:s==="ready"||s==="inop", unset:s==="unset"}; }
// tug make/model by id range
function tugType(id){ if([1,3,4].includes(id))return "TBL-400"; if(id>=10&&id<=19)return "TBL-280"; if(id>=20&&id<=29)return "GOLDHOFER"; if(id===51)return "Kalmar"; return ""; }
const PREV_SHIFT={AM:"NH",PM:"AM",NH:"PM"};
// label for someone who worked the directly-preceding shift (full or partial)
function prevWorkLabel(emp){
  const prev=PREV_SHIFT[ST.shift]; if(!prev||!emp) return "";
  const blocks=(ST.bodies||[]).filter(b=>b.emp===emp);
  if(!blocks.length) return "";
  let ov=0; blocks.forEach(b=>{const p=ivl(b.start,b.end); if(p) ov+=ovl(p,SHIFT_CORE[prev]);});
  ov=Math.min(ov,480);
  if(ov<45) return "";
  const full=ov>=360;
  if(full) return prev==="NH" ? "Worked last night" : "Worked "+prev;
  return "Worked Partial ("+prev+")";
}
// compact form for assigned-crew badges ("Worked last night" → "last night")
function prevWorkShort(emp){ const l=prevWorkLabel(emp); return l?l.replace(/^Worked\s+/i,""):""; }
// works this shift AND the next one = a (forward) double → DBL
const NEXT_SHIFT={AM:"PM",PM:"NH",NH:"AM"};
function worksNext(emp){ const nx=NEXT_SHIFT[ST.shift]; if(!nx||!emp)return false;
  let ov=0; (ST.bodies||[]).filter(b=>b.emp===emp).forEach(b=>{const p=ivl(b.start,b.end); if(p)ov+=ovl(p,SHIFT_CORE[nx]);});
  return Math.min(ov,480)>=45; }
function excludeList(){ const d=Store.getJSON("elt.staff.exclude",null); return Array.isArray(d)?d:EXCLUDE_DEFAULT.slice(); }

/* build the body list (all shifts) from parsed inputs + prompt answers */
function buildBodies(){
  const {mpRecs,otRecs,coRows}=ST.parsed;
  const calledOut=new Set(coRows.map(r=>r.emp));
  const bodies=[];
  // scheduled push + relief, with covers
  for(const r of mpRecs){
    if(r.sec!=="PUSH")continue;
    const origWorks=(!r.code||WORKED_CODES.has(r.code));
    if(origWorks&&r.start&&r.end) bodies.push({name:r.name,emp:r.emp,start:r.start,end:r.end,src:"sched"});
    for(const c of r.covers) bodies.push({name:c.name,emp:c.emp,start:c.start,end:c.end,src:"cover"});
  }
  // trainees — only if marked available
  for(const r of mpRecs){
    if(r.sec!=="TRAINING")continue;
    if(ST.prompts["T:"+r.name]&&r.start&&r.end) bodies.push({name:r.name+" +TrainingOJT",emp:r.emp,start:r.start,end:r.end,src:"train"});
  }
  // OT
  for(const o of otRecs) bodies.push({...o});
  // remove call-outs + exclusions (unless prompt said available)
  const filtered=bodies.filter(b=>{
    if(calledOut.has(b.emp))return false;
    if(isExcluded(b.name)&&!ST.prompts["X:"+b.name])return false;
    return true;
  });
  return filtered;
}

/* people flagged as trainees / exclusions that appear on the sheet — for prompts */
function promptTargets(){
  const {mpRecs}=ST.parsed;
  const trainees=mpRecs.filter(r=>r.sec==="TRAINING"&&r.start).map(r=>({key:"T:"+r.name,name:r.name,hours:r.start+"-"+r.end,kind:"trainee"}));
  const seen=new Set(),excl=[];
  for(const r of mpRecs){ if(r.sec!=="PUSH")continue; if(isExcluded(r.name)&&!seen.has(r.name)){seen.add(r.name);excl.push({key:"X:"+r.name,name:r.name,hours:r.start+"-"+r.end,kind:"exclude"});} }
  return [...trainees,...excl];
}

function fmtMin(m){ m=((m%1440)+1440)%1440; const h=Math.floor(m/60),mm=m%60; return (h<10?"0":"")+h+":"+(mm<10?"0":"")+mm; }
/* the hours to SHOW for a person on this shift — clipped to their ~8h shift window,
   so a double/relief block (e.g. 05:00-21:00) reads as their current shift (05:00-13:00) */
function shiftHours(b,shift){
  const a=mins(b.start); let z=mins(b.end); if(a==null||z==null) return (b.start||"")+"-"+(b.end||"");
  if(z<=a)z+=1440;
  const prev=PREV_SHIFT[shift];
  let workedPrevShift=false;
  if(prev){ let ov=0; (ST.bodies||[]).filter(x=>x.emp===b.emp).forEach(x=>{const p=ivl(x.start,x.end); if(p)ov+=ovl(p,SHIFT_CORE[prev]);}); workedPrevShift=Math.min(ov,480)>=45; }
  let ds,de;
  if(workedPrevShift){ de=z; ds=Math.max(a,z-480); }   // came off the previous shift → show the tail (this shift)
  else { ds=a; de=Math.min(z,a+480); }                 // forward/normal → show their first ~8h
  return fmtMin(ds)+"-"+fmtMin(de);
}
/* per-shift pool (deduped by emp within shift) */
function poolFor(shift){
  const out=[],seen=new Set();
  if(!ST.bodies)return out;
  for(const b of ST.bodies){
    const sh=shiftsFor(b).find(x=>x.sh===shift);
    if(!sh)continue;
    if(b.emp&&seen.has(b.emp))continue; if(b.emp)seen.add(b.emp);
    const d=ST.dbl&&ST.dbl[b.emp];
    out.push({...b,prim:sh.prim,ov:sh.ov,double:!!(d&&d.double),hours:shiftHours(b,shift),span:(d&&d.double&&d.combo)?d.combo[0]+"-"+d.combo[1]:""});
  }
  out.sort((a,b)=>(a.prim===b.prim?normName(a.name).localeCompare(normName(b.name)):a.prim?-1:1));
  return out;
}
/* double detection: an emp working 2+ shifts → combined window + "Double" */
function comboWin(blocks){
  if(blocks.length===1)return [blocks[0].start,blocks[0].end];
  const m=s=>mins(s);
  const hasNH=blocks.some(b=>m(b.start)>=1260||m(b.start)<240);
  const hasAM=blocks.some(b=>m(b.start)>=240&&m(b.start)<720);
  if(hasNH&&hasAM){ // overnight into morning (NH → AM)
    const nh=blocks.filter(b=>m(b.start)>=1260||m(b.start)<240).sort((a,b)=>m(a.start)-m(b.start))[0];
    const am=blocks.filter(b=>m(b.start)>=240&&m(b.start)<720).sort((a,b)=>m(b.end)-m(a.end))[0];
    return [nh.start,am.end];
  }
  const s=blocks.slice().sort((a,b)=>m(a.start)-m(b.start));
  return [s[0].start,s[s.length-1].end];
}
function buildDoubles(){
  const byEmp={};for(const b of ST.bodies){if(!b.emp)continue;(byEmp[b.emp]=byEmp[b.emp]||[]).push(b);}
  const map={};
  for(const emp in byEmp){const blocks=byEmp[emp];const shifts=new Set();
    blocks.forEach(b=>shiftsFor(b).forEach(x=>{if(x.prim||x.ov>60)shifts.add(x.sh);}));
    const isD=shifts.size>=2;
    map[emp]={double:isD,combo:isD?comboWin(blocks):null};}
  return map;
}
/* dispatch candidate for the shift from the DISPATCH section */
function dispatchCandidates(shift){
  const {mpRecs}=ST.parsed;
  return mpRecs.filter(r=>r.sec==="DISPATCH"&&r.start).map(r=>({...r,avail:!r.code||WORKED_CODES.has(r.code),sh:primaryShift(r.start)}))
    .filter(d=>d.sh===shift);
}
/* who was scheduled for the shift but isn't in the pool, and why (code) */
function calloutReason(emp){ const r=(ST.parsed.coRows||[]).find(x=>x.emp===emp); return r?(/(sick)/i.test(r.reason)?"SICK":(r.reason||"OUT")):""; }
function absentFor(shift){
  if(!ST.parsed)return [];
  const {mpRecs}=ST.parsed;
  const poolEmps=new Set(poolFor(shift).map(b=>b.emp));
  const seen=new Set(),out=[];
  for(const r of mpRecs){
    if(r.sec!=="PUSH"||!r.start)continue;
    if(primaryShift(r.start)!==shift)continue;
    if(poolEmps.has(r.emp))continue;          // they're working — skip
    if(seen.has(r.emp||r.name))continue; seen.add(r.emp||r.name);
    let code=calloutReason(r.emp)||r.code||(isExcluded(r.name)?"N/A":"OUT");
    out.push({name:r.name,code});
  }
  out.sort((a,b)=>a.code.localeCompare(b.code)||normName(a.name).localeCompare(normName(b.name)));
  return out;
}
/* tallies across all shifts for the briefing staffing count */
function absenceTally(){
  const t={VAC:0,DAT:0,CB:0,SICK:0,OUT:0,OJI:0};
  const all=[].concat(...SHIFTS.map(s=>absentFor(s)));
  for(const a of all){ const c=(a.code||"").toUpperCase();
    if(/VC|VAC/.test(c))t.VAC++; else if(/DAT/.test(c))t.DAT++; else if(/CB/.test(c))t.CB++;
    else if(/SICK/.test(c))t.SICK++; else if(/OJI|INJ/.test(c))t.OJI++; else t.OUT++; }
  return t;
}

/* =====================  RENDER  ===================== */
let ROOT=null;
function render(){
  ROOT=$("#staffRoot");if(!ROOT)return;
  ({auth:rAuth,menu:rMenu,upload:rUpload,setup:rSetup,pool:rPool,reconcile:rReconcile,assign:rAssign,brief:rBrief,sheet:rSheet,logs:rLogs,drafts:rDrafts}[ST.step]||rMenu)();
}
function card(inner){return `<div class="card pad">${inner}</div>`;}
function staffModal(html){
  document.querySelector(".staff-modal")?.remove();
  const ov=document.createElement("div");ov.className="staff-modal";
  ov.innerHTML=`<div class="sm-box">${html}</div>`;
  ov.addEventListener("click",e=>{ if(e.target===ov||e.target.closest("[data-close]"))ov.remove(); });
  document.body.appendChild(ov);
  return ov;
}
function dispatcherWarn(){
  if(!ST.dispatch||!ST.dispatch.name){
    staffModal(`<div class="sm-bang">!!!</div>
      <h3 class="sm-title">YOU DON'T HAVE A DISPATCHER!!!</h3>
      <p class="sm-sub">Pick a dispatcher below before you finish the board.</p>
      <button class="btn navy" data-close>OK</button>`);
  }
}
function back(toStep,label){return `<button class="btn ghost stp-back" data-to="${toStep}" style="margin-top:10px">‹ ${label}</button>`;}

/* ---- snapshots, drafts & past logs ---- */
const SNAP_KEYS=["shift","numTugs","prompts","supers","manager","asst","tug","dispatch","brief","assign","bodies","dbl","parsed"];
function snapshot(){ const s={}; SNAP_KEYS.forEach(k=>s[k]=ST[k]); return JSON.parse(JSON.stringify(s)); }
function applySnapshot(s){ SNAP_KEYS.forEach(k=>{ if(k in s) ST[k]=JSON.parse(JSON.stringify(s[k])); }); }
function withSnapshot(s,fn){ const cur={}; SNAP_KEYS.forEach(k=>cur[k]=ST[k]); applySnapshot(s); try{ return fn(); } finally { SNAP_KEYS.forEach(k=>ST[k]=cur[k]); } }
function assignedCount(){ if(!ST.assign)return 0; let n=0;
  Object.values(ST.assign.tugs).forEach(t=>["DRIVER","OBSERVR"].forEach(r=>t[r]&&n++));
  Object.values(ST.assign.areas).forEach(li=>n+=li.length);
  if(ST.dispatch&&ST.dispatch.name)n++; return n; }
function loadDrafts(){const d=Store.getJSON("elt.staff.drafts",[]);return Array.isArray(d)?d:[];}
function saveDraftList(l){return Store.setJSON("elt.staff.drafts",l);}
function saveDraft(){
  if(!ST.parsed||assignedCount()<1)return;
  const date=ST.parsed.date||"",shift=ST.shift,id="D|"+date+"|"+shift;
  const entry={id,date,shift,when:Date.now(),count:assignedCount(),step:ST.step,snap:snapshot()};
  let l=loadDrafts().filter(e=>e.id!==id);l.unshift(entry);l=l.slice(0,6);
  if(!saveDraftList(l)){l=l.slice(0,3);saveDraftList(l);}
}
function deleteDraft(id){ saveDraftList(loadDrafts().filter(e=>e.id!==id)); }

/* ---- step: auth (who's running this shift + code) ---- */
let AUTH=null;                  // {name, role, temp} for this app session
let authView="pick", authRole="Supervisor", authPick=null, authErr="", authTemp={name:"",signer:""};
function authenticate(name,role,temp){
  AUTH={name,role,temp:!!temp}; authErr=""; authView="pick"; authPick=null; authTemp={name:"",signer:""};
  if(role==="Supervisor"){ if(!ST.supers||!ST.supers.length)ST.supers=[name]; else if(!ST.supers.includes(name))ST.supers=[name,...ST.supers]; }
  else if(role==="Manager"){ ST.manager=name; }
  else if(role==="Assistant Manager"){ if(!ST.asst.includes(name))ST.asst=[...ST.asst,name]; }
  ST.step="menu"; render();
}
function rAuth(){
  // code entry (create on first use, or enter)
  if(authView==="code"){
    const first=!hasCode(authPick);
    ROOT.innerHTML=card(`
      <h2 class="staff-h">${esc(authPick)}</h2>
      <p class="hint" style="margin:0 0 12px">${first?"First time — create a code you'll enter each shift. Keep it private.":"Enter your code to continue."}</p>
      <label class="fld-l">${first?"Create code":"Code"}</label>
      <input id="codeIn" class="code-in" type="password" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="••••" />
      ${first?'<label class="fld-l">Confirm code</label><input id="codeIn2" class="code-in" type="password" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="••••" />':''}
      ${authErr?`<div class="code-err">${esc(authErr)}</div>`:''}
      <div class="btnrow" style="margin-top:14px"><button class="btn navy" id="codeGo">${first?"Set code & continue":"Continue"} ›</button></div>
      <button class="btn ghost auth-back" style="margin-top:10px">‹ Back</button>`);
    const go=async()=>{
      const v=($("#codeIn").value||"").trim();
      if(first){ const v2=($("#codeIn2").value||"").trim();
        if(v.length<4){authErr="Use at least 4 digits.";return render();}
        if(v!==v2){authErr="Codes don't match.";return render();}
        await setCode(authPick,v); authenticate(authPick,authRole,isTempSup(authPick)); return; }
      if(await checkCode(authPick,v)){ authenticate(authPick,authRole,isTempSup(authPick)); }
      else { authErr="Incorrect code."; render(); }
    };
    $("#codeGo").onclick=go;
    $("#codeIn").addEventListener("keydown",e=>{ if(e.key==="Enter"&&!first)go(); });
    $$('#staffRoot .auth-back').forEach(b=>b.onclick=()=>{authView="pick";authErr="";render();});
    setTimeout(()=>$("#codeIn")?.focus(),60);
    return;
  }
  // create temporary supervisor — name
  if(authView==="tempname"){
    ROOT.innerHTML=card(`
      <h2 class="staff-h">Temporary supervisor</h2>
      <p class="hint" style="margin:0 0 12px">Add a fill-in supervisor for tonight. Creation must be co-signed by an existing supervisor.</p>
      <label class="fld-l">New supervisor name</label>
      <input id="tmpName" class="code-in txt" autocomplete="off" placeholder="e.g. Andres" value="${esc(authTemp.name)}" />
      ${authErr?`<div class="code-err">${esc(authErr)}</div>`:''}
      <div class="btnrow" style="margin-top:14px"><button class="btn navy" id="tmpNext">Continue to co-sign ›</button></div>
      <button class="btn ghost auth-back" style="margin-top:10px">‹ Back</button>`);
    $("#tmpNext").onclick=()=>{ const n=($("#tmpName").value||"").trim();
      if(n.length<2){authErr="Enter a name.";return render();}
      if(rosterAll().some(r=>r.name.toLowerCase()===n.toLowerCase())){authErr="That name already exists.";return render();}
      authTemp={name:n,signer:""}; authErr=""; authView="tempsign"; render(); };
    $$('#staffRoot .auth-back').forEach(b=>b.onclick=()=>{authView="pick";authErr="";render();});
    return;
  }
  // create temporary supervisor — co-sign
  if(authView==="tempsign"){
    const signers=rosterAll().filter(r=>r.role!=="Assistant Manager"&&r.name!==authTemp.name);
    ROOT.innerHTML=card(`
      <h2 class="staff-h">Co-sign “${esc(authTemp.name)}”</h2>
      <p class="hint" style="margin:0 0 12px">An existing supervisor or manager must approve by entering their own code.</p>
      <label class="fld-l">Approving supervisor</label>
      <select id="signSel" class="code-in txt">
        <option value="">— select —</option>
        ${signers.map(r=>`<option value="${esc(r.name)}" ${authTemp.signer===r.name?'selected':''}>${esc(r.name)}${r.temp?' (temp)':''}</option>`).join("")}
      </select>
      <label class="fld-l">Their code</label>
      <input id="signCode" class="code-in" type="password" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="••••" />
      ${authErr?`<div class="code-err">${esc(authErr)}</div>`:''}
      <div class="btnrow" style="margin-top:14px"><button class="btn navy" id="signGo">Create temporary supervisor ›</button></div>
      <button class="btn ghost auth-back" style="margin-top:10px">‹ Back</button>`);
    $("#signSel").onchange=e=>{authTemp.signer=e.target.value;};
    $("#signGo").onclick=async()=>{
      const signer=$("#signSel").value, code=($("#signCode").value||"").trim();
      if(!signer){authErr="Pick an approving supervisor.";return render();}
      if(!hasCode(signer)){authErr=signer+" hasn't set up a code yet — they must sign in once first.";return render();}
      if(!(await checkCode(signer,code))){authErr="That supervisor's code is incorrect.";return render();}
      const l=loadTempSups(); l.push({name:authTemp.name,by:signer,when:Date.now()}); saveTempSups(l);
      authenticate(authTemp.name,"Supervisor",true);
    };
    $$('#staffRoot .auth-back').forEach(b=>b.onclick=()=>{authView="tempname";authErr="";render();});
    return;
  }
  // pick role + name
  const roles=["Supervisor","Manager","Assistant Manager"];
  const seg=roles.map(r=>`<button class="seg ${authRole===r?'on':''}" data-role="${r}">${r==="Assistant Manager"?"Asst Mgr":r}</button>`).join("");
  const names=rosterAll().filter(r=>r.role===authRole);
  const chips=names.map(r=>`<button class="auth-name" data-name="${esc(r.name)}">${esc(r.name)}${r.temp?'<i>temp</i>':''}${hasCode(r.name)?'':'<u>set up</u>'}</button>`).join("");
  ROOT.innerHTML=card(`
    <h2 class="staff-h">Who's running this shift?</h2>
    <p class="hint" style="margin:0 0 10px">Pick your name, then enter your code. ${AUTH?`<br>Signed in as <b>${esc(AUTH.name)}</b>.`:''}</p>
    <div class="seg-wrap auth-seg">${seg}</div>
    <div class="auth-names">${chips||'<p class="hint">No one here.</p>'}</div>
    ${authRole==="Supervisor"?'<button class="btn ghost" id="addTemp" style="margin-top:12px">＋ Temporary supervisor (co-signed)</button>':''}`);
  $$('#staffRoot .seg[data-role]').forEach(b=>b.onclick=()=>{authRole=b.dataset.role;authErr="";render();});
  $$('#staffRoot .auth-name').forEach(b=>b.onclick=()=>{authPick=b.dataset.name;authErr="";authView="code";render();});
  $("#addTemp")?.addEventListener("click",()=>{authTemp={name:"",signer:""};authErr="";authView="tempname";render();});
}

/* ---- step: menu (Create / Past / Draft) ---- */
function rMenu(){
  const logs=loadLog().length, drafts=loadDrafts().length;
  ROOT.innerHTML=card(`
    <div class="pool-head"><h2 class="staff-h" style="margin:0">Manpower / Staffing</h2>
      ${AUTH?`<button class="who-chip" id="mpSwitch">${esc(AUTH.name)}${AUTH.temp?' · temp':''} · switch</button>`:''}</div>
    <p class="hint" style="margin:0 0 12px">Build tonight's board, pick up a draft, or look back at a past shift.</p>
    <div class="mp-menu">
      <button class="mp-tile create" id="mpCreate">
        <span class="mp-ic">＋</span><span class="mp-tx"><b>Create Manpower</b><span>Link the eTA sheets &amp; build a new board</span></span></button>
      <button class="mp-tile" id="mpDraft">
        <span class="mp-ic">✎</span><span class="mp-tx"><b>Draft Manpowers</b><span>${drafts?drafts+" saved · resume where you left off":"Nothing in progress"}</span></span><span class="mp-n">${drafts||""}</span></button>
      <button class="mp-tile" id="mpPast">
        <span class="mp-ic">🗂</span><span class="mp-tx"><b>Past Manpowers</b><span>${logs?logs+" logged · AM · PM · NH (read-only)":"Nothing logged yet"}</span></span><span class="mp-n">${logs||""}</span></button>
    </div>`);
  $("#mpCreate").onclick=()=>{ ST.files={mp:null,ot:null,co:null}; ST.parsed=null; ST.bodies=null; ST.assign=null; ST.brief=null; ST.tug={}; ST.dispatch=null; ST.step="upload"; render(); };
  $("#mpDraft").onclick=()=>{ ST.step="drafts"; render(); };
  $("#mpPast").onclick=()=>{ ST.step="logs"; render(); };
  $("#mpSwitch")?.addEventListener("click",()=>{ AUTH=null; authView="pick"; authPick=null; ST.step="auth"; render(); });
}

/* ---- step: drafts ---- */
function rDrafts(){
  const list=loadDrafts();
  const ord={AM:0,PM:1,NH:2};
  ROOT.innerHTML=card(`<div class="pool-head"><h2 class="staff-h" style="margin:0">Draft manpowers</h2><span class="cnt">${list.length}</span></div>
    <p class="hint" style="margin:0 0 8px">Boards you started but didn't log. Resume to keep assigning.</p>
    ${list.length?list.map(e=>`<div class="log-row draft-row"><button class="dr-main" data-id="${esc(e.id)}"><b>${esc(e.shift)} manpower</b><span>${esc(e.date||'(no date)')} · ${e.count} assigned</span></button>
        <button class="dr-del" data-del="${esc(e.id)}" title="Delete">✕</button></div>`).join(""):'<p class="hint">No drafts. They save automatically once you assign at least one person.</p>'}
    <div class="btnrow" style="margin-top:12px"><button class="btn ghost stp-back" data-to="menu">‹ Back</button></div>`);
  $$('#staffRoot .dr-main').forEach(b=>b.onclick=()=>{ const e=loadDrafts().find(x=>x.id===b.dataset.id); if(!e)return render();
    applySnapshot(e.snap); ST._tugSeeded=true; ST.step=e.step&&e.step!=="upload"?e.step:"assign"; render(); });
  $$('#staffRoot .dr-del').forEach(b=>b.onclick=()=>{ deleteDraft(b.dataset.del); render(); });
  $$('#staffRoot .stp-back').forEach(b=>b.onclick=()=>{ST.step=b.dataset.to;render();});
}

/* ---- step: upload ---- */
function rUpload(){
  const f=ST.files;
  const slot=(k,title,sub,accept)=>`
    <label class="up-slot ${f[k]?'on':''}">
      <input type="file" accept="${accept}" data-k="${k}" hidden />
      <span class="up-ic">${f[k]?CK:UP}</span>
      <span class="up-tx"><b>${title}</b><span>${f[k]?esc(f[k].name):sub}</span></span>
    </label>`;
  ROOT.innerHTML=card(`
    <h2 class="staff-h">Build the shift pool</h2>
    <p class="hint" style="margin:0 0 12px">Link the three eTA exports for this shift. The tool reads them and builds the manpower pool.</p>
    ${slot("mp","Manpower sheet","eTA Manpower PDF",".pdf")}
    ${slot("ot","Overtime sheet","OT Award Report PDF",".pdf")}
    ${slot("co","Call-out sheet","Absence Monitor (.xls/.html)",".xls,.html,.htm,.xlsx")}
    <div id="upMsg" class="hint" style="margin-top:10px"></div>
    <div class="btnrow" style="margin-top:6px"><button class="btn navy" id="upBuild" ${f.mp?"":"disabled"}>Read files &amp; build pool ›</button></div>
    ${back("menu","Manpower menu")}`);
  $$('#staffRoot input[type=file]').forEach(inp=>inp.addEventListener("change",e=>{
    const k=inp.dataset.k,file=inp.files[0];if(!file)return;ST.files[k]=file;render();}));
  $("#upBuild")?.addEventListener("click",doBuild);
  $$('#staffRoot .stp-back').forEach(b=>b.onclick=()=>{ST.step=b.dataset.to;render();});
}
async function doBuild(){
  const msg=$("#upMsg");msg.innerHTML=`<span class="spin"></span> Reading files…`;
  try{
    const mpToks=await pdfTokens(ST.files.mp);
    const otToks=ST.files.ot?await pdfTokens(ST.files.ot):[];
    const coText=ST.files.co?await ST.files.co.text():"";
    // date = from manpower header (first M/D/YYYY token) for callout filtering
    const dm=mpToks.find(t=>/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t));
    const date=dm||"";
    ST.parsed={ mpRecs:parseManpower(mpToks), otRecs:parseOT(otToks), coRows:parseCallout(coText,date), date };
    ST.tug={};ST._tugSeeded=false;ST.dispatch=null;ST.assign=null;ST.brief=null;ST.bodies=null;
    ST.step="setup";render();
  }catch(err){ msg.innerHTML=`<span style="color:var(--danger)">Couldn't read a file: ${esc(err.message||err)}</span>`; }
}

/* ---- step: setup (shift, tugs, prompts, supervisors) ---- */
function rSetup(){
  const p=ST.parsed;
  const tgts=promptTargets();
  const seg=SHIFTS.map(s=>`<button class="seg ${ST.shift===s?'on':''}" data-sh="${s}">${s}</button>`).join("");
  const chip=(list,sel,attr)=>list.map(n=>`<button class="chip pick ${sel.includes(n)?'on':''}" ${attr}="${esc(n)}">${esc(n)}${sel.includes(n)?' ✓':''}</button>`).join("");
  const promptRows=tgts.map(t=>{
    const on=!!ST.prompts[t.key];
    return `<div class="prow"><div><b>${esc(t.name.replace(' +TrainingOJT',''))}</b> <span class="hint">${t.kind==='trainee'?'training':'exclusion'} · ${esc(t.hours)}</span></div>
      <button class="yn ${on?'on':''}" data-pk="${esc(t.key)}">${on?'Available ✓':'Add?'}</button></div>`;
  }).join("")||`<p class="hint" style="margin:0">No trainees or exclusion-list people on the sheet.</p>`;
  ROOT.innerHTML=card(`
    <h2 class="staff-h">Shift setup</h2>
    <div class="muted-row">Parsed: ${p.mpRecs.filter(r=>r.sec==='PUSH').length} scheduled · ${p.otRecs.length} OT · ${p.coRows.length} call-outs ${p.date?'· '+esc(p.date):''}</div>
    <label class="fld-l">Shift</label><div class="seg-wrap">${seg}</div>
    <label class="fld-l">Tugs to run</label>
    <div class="num-row"><button class="numb" data-d="-1">−</button><input id="numTugs" type="number" min="0" max="${TUGS.length}" value="${ST.numTugs}" /><button class="numb" data-d="1">+</button></div>
    <label class="fld-l">Availability checks</label>
    <div class="prow-wrap">${promptRows}</div>
    <label class="fld-l">Supervisor(s) on shift</label><div class="chips">${chip(supervisorList(),ST.supers,'data-sup')}</div>
    <label class="fld-l">Manager / Asst</label><div class="chips">${MANAGERS.map(n=>`<button class="chip pick ${ST.manager===n?'on':''}" data-mgr="${esc(n)}">${esc(n)}${ST.manager===n?' ✓':''}</button>`).join("")} ${chip(ASSTMGRS,ST.asst,'data-asst')}</div>
    <div class="btnrow" style="margin-top:14px"><button class="btn navy" id="toPool">Review pool ›</button></div>
    ${back("upload","Files")}`);
  $$('#staffRoot .seg[data-sh]').forEach(b=>b.onclick=()=>{ST.shift=b.dataset.sh;render();});
  $$('#staffRoot .numb').forEach(b=>b.onclick=()=>{ST.numTugs=Math.max(0,Math.min(TUGS.length,(+$("#numTugs").value||0)+ +b.dataset.d));render();});
  $("#numTugs").onchange=e=>{ST.numTugs=Math.max(0,Math.min(TUGS.length,+e.target.value||0));};
  $$('#staffRoot .yn[data-pk]').forEach(b=>b.onclick=()=>{const k=b.dataset.pk;ST.prompts[k]=!ST.prompts[k];render();});
  $$('#staffRoot .chip[data-sup]').forEach(b=>b.onclick=()=>{const n=b.dataset.sup;ST.supers=ST.supers.includes(n)?ST.supers.filter(x=>x!==n):[...ST.supers,n];render();});
  $$('#staffRoot .chip[data-asst]').forEach(b=>b.onclick=()=>{const n=b.dataset.asst;ST.asst=ST.asst.includes(n)?ST.asst.filter(x=>x!==n):[...ST.asst,n];render();});
  $$('#staffRoot .chip[data-mgr]').forEach(b=>b.onclick=()=>{ST.manager=ST.manager===b.dataset.mgr?"":b.dataset.mgr;render();});
  $("#toPool").onclick=()=>{ ST.bodies=buildBodies(); ST.dbl=buildDoubles(); ST.step="pool"; render(); };
  $$('#staffRoot .stp-back').forEach(b=>b.onclick=()=>{ST.step=b.dataset.to;render();});
}

/* ---- step: pool review ---- */
function rPool(){
  const pool=poolFor(ST.shift);
  const disp=dispatchCandidates(ST.shift);
  const dispLine=disp.length?disp.map(d=>`${esc(d.name)}${d.avail?'':' <span class="bad">('+esc(d.code)+')</span>'}`).join(" · "):'<span class="bad">none on shift</span>';
  const rows=pool.map(b=>{const bid=BIDS&&BIDS[b.emp];const pw=prevWorkLabel(b.emp);const fwd=!pw&&worksNext(b.emp);
    return `<div class="prow prow-tap" data-emp="${esc(b.emp)}"><div class="prow-main"><div><b>${esc(b.name)}</b> <span class="hint">${esc(b.hours)}</span>
      ${fwd?'<span class="tag db">Double</span>':''}${b.src==='OT'?'<span class="tag ot">OT</span>':''}${b.src==='cover'?'<span class="tag cv">Daytrade</span>':''}${b.src==='train'?'<span class="tag tr">OJT</span>':''}${pw?`<span class="tag pw">${esc(pw)}</span>`:''}
      <div class="bid-line">${bid?`Bid <b>${esc(bid.hours||'—')}</b> · Off <b>${esc(bid.off||'—')}</b>`:'<span class="hint">No bid on file</span>'}</div></div>
      <button class="xrem" data-emp="${esc(b.emp)}" data-name="${esc(b.name)}" title="Remove">✕</button></div></div>`;}).join("");
  ROOT.innerHTML=card(`
    <div class="pool-head"><h2 class="staff-h" style="margin:0">${ST.shift} pool</h2><span class="cnt">${pool.length}</span></div>
    <div class="muted-row">Dispatcher candidate: ${dispLine}</div>
    <p class="hint" style="margin:0 0 6px">Tap a name to see their bid hours &amp; days off.</p>
    <div class="prow-wrap">${rows||'<p class="hint">No one in this shift.</p>'}</div>
    <div class="btnrow" style="margin-top:12px"><button class="btn navy" id="toAssign">Assign the board ›</button></div>
    ${back("setup","Setup")}`);
  $$('#staffRoot .prow-tap').forEach(r=>r.addEventListener("click",e=>{ if(e.target.closest(".xrem"))return; r.classList.toggle("open"); }));
  $$('#staffRoot .xrem').forEach(b=>b.onclick=e=>{ e.stopPropagation(); const emp=b.dataset.emp,nm=b.dataset.name;
    ST.bodies=ST.bodies.filter(x=>!(x.emp===emp&&x.name===nm)); render(); });
  $("#toAssign").onclick=()=>{ initTug(); ST.step="reconcile"; render(); };
  $$('#staffRoot .stp-back').forEach(b=>b.onclick=()=>{ST.step=b.dataset.to;render();});
}

/* ---- step: tug status (tap-cycle reconciliation) ---- */
function initTug(){ /* everything starts grey/unset — supervisor taps each tug */ }
const STATUS_LABEL={
  unset:"Tap to set status",
  ready:"Ready · Good GPU",
  inop:"GPU Inop · tug still ready",
  oos:"Tug out of Service"
};
function rReconcile(){
  const running=TUGS.filter(id=>tugState(id).running).length;
  const oosN=TUGS.filter(id=>tugState(id).oos).length;
  const inopN=TUGS.filter(id=>tugSt(id)==="inop").length;
  const unsetN=TUGS.filter(id=>tugSt(id)==="unset").length;
  const tile=id=>{const s=tugSt(id);
    return `<button class="rtile ${s}" data-tug="${id}">
        <span class="rt-top"><span class="rt-n">${id}</span>${ELECTRIC.has(id)?'<span class="rt-e">⚡ ELECTRIC</span>':''}</span>
        <span class="rt-st">${s==='ready'?'✓ ':''}${STATUS_LABEL[s]}</span>
      </button>`;};
  const grp=g=>`<div class="rgroup"><div class="rg-h">STUG ${g.label}${tugType(g.ids[0])?` · <b>${tugType(g.ids[0])}</b>`:''}</div><div class="rt-grid">${g.ids.map(tile).join("")}</div></div>`;
  ROOT.innerHTML=card(`
    <h2 class="staff-h">Tug status</h2>
    <p class="hint" style="margin:0 0 8px">Tap a tug to cycle: <b class="rk g">green</b> ready, good GPU → <b class="rk y">yellow</b> GPU inop but still ready → <b class="rk r">red</b> out of service → grey not set.</p>
    <div class="muted-row"><b>${running}</b> in service · <b>${inopN}</b> GPU inop · <b>${oosN}</b> out of service${unsetN?` · ${unsetN} not set`:''}</div>
    <div class="recon">${TUG_GROUPS.map(grp).join("")}</div>
    <div class="btnrow" style="margin-top:12px"><button class="btn navy" id="toAssign2">Assign the board ›</button></div>
    ${back("pool","Pool")}`);
  $$('#staffRoot .rtile').forEach(b=>b.onclick=()=>{cycleTug(+b.dataset.tug);render();});
  $("#toAssign2").onclick=()=>{ initAssign(); ST.step="assign"; render(); dispatcherWarn(); };
  $$('#staffRoot .stp-back').forEach(b=>b.onclick=()=>{ST.step=b.dataset.to;render();});
}

/* ---- step: assign ---- */
let SEL=null; // selected pool entry key
let poolCollapsed=new Set(); // collapsed staff hour-groups (by start time)
let showUnusedTugs=false;    // hide not-in-service tugs on the board unless toggled
/* auto-assign modes + multi-assign (one person → 2 places) */
let autoMode=null;            // null | 'tug' | 'remote' | 'multi'
let autoPick=[];             // emps multi-selected in tug/remote auto modes (ordered)
let autoStep=0;              // remote: index into REMOTE_ORDER
const REMOTE_ORDER=["Ballpark","WestPark","APU","South Team","Terminal B"];
function empAreaCount(emp){let n=0;Object.values(ST.assign.areas).forEach(list=>list.forEach(p=>{if(p.emp===emp)n++;}));return n;}
function empInTug(emp){return Object.values(ST.assign.tugs).some(t=>["DRIVER","OBSERVR"].some(r=>t[r]&&t[r].emp===emp));}
// in multi mode the selected person stays in the pool so you can place them in a 2nd spot
function availBody(b){const emp=b.emp;if(autoMode==='multi'&&SEL===emp)return true;if(dispEmp()===emp)return false;if(empInTug(emp))return false;return empAreaCount(emp)===0;}
function mkBody(b){return b?{name:b.name,emp:b.emp,start:b.start,end:b.end,_hours:b.hours,_double:b.double}:null;}
function autoPairTugs(){
  const items=autoPick.map(e=>poolFor(ST.shift).find(b=>b.emp===e)).filter(Boolean);
  const used=new Set(),pairs=[];
  for(let i=0;i<items.length;i++){ if(used.has(i))continue; used.add(i); let j=-1;
    for(let k=i+1;k<items.length;k++){ if(!used.has(k)&&items[k].hours===items[i].hours){j=k;break;} } // shift parity first
    if(j<0)for(let k=i+1;k<items.length;k++){ if(!used.has(k)){j=k;break;} }                            // else next available
    if(j>=0)used.add(j); pairs.push([items[i],j>=0?items[j]:null]); }
  const free=TUGS.filter(id=>{const t=tugState(id);if(!t.running)return false;const c=ST.assign.tugs[id]||{};return !c.DRIVER&&!c.OBSERVR;});
  let n=0; pairs.forEach((p,idx)=>{const id=free[idx];if(id==null)return;ST.assign.tugs[id]={DRIVER:mkBody(p[0]),OBSERVR:mkBody(p[1])};n++;});
  autoMode=null;autoPick=[];render();
  toast(n?`Paired ${n} tug${n>1?'s':''}`+(pairs.length>n?` · ${pairs.length-n} pair(s) had no free tug`:""):"No free tugs available");
}
function autoNextRemote(){
  const area=REMOTE_ORDER[autoStep],list=ST.assign.areas[area]=ST.assign.areas[area]||[];
  autoPick.forEach(emp=>{ if(list.some(p=>p.emp===emp))return; const b=poolFor(ST.shift).find(x=>x.emp===emp); if(b)list.push(mkBody(b)); });
  autoPick=[]; autoStep++;
  if(autoStep>=REMOTE_ORDER.length){autoMode=null;autoStep=0;toast("Auto remote complete");}
  render();
}
function fillDoubleTugs(){
  const dbl=(ST.assign.dblTugs||[]).filter(id=>tugState(id).running);
  if(!dbl.length){toast("Mark a tug as double first (2× on the tug)");return;}
  const avail=poolFor(ST.shift).filter(availBody).filter(b=>worksNext(b.emp)).sort((a,b)=>(a.hours||"").localeCompare(b.hours||"")); // doubles, parity-sorted
  let bi=0;
  dbl.forEach(id=>{const c=ST.assign.tugs[id]=ST.assign.tugs[id]||{};["DRIVER","OBSERVR"].forEach(role=>{ if(c[role])return; if(bi<avail.length){c[role]=mkBody(avail[bi]);bi++;} });});
  render(); toast(bi?`Placed ${bi} double${bi>1?'s':''} into double tug${dbl.length>1?'s':''}`:"No unassigned doubles in the pool");
}
function autoBar(){
  if(autoMode==="multi")
    return `<div class="autobar multi"><div class="ab-msg"><b>MULTI ASSIGN</b><small>Tap a name, then tap two places — they stay in the pool until placed twice</small></div>
      <div class="ab-acts"><button class="btn good" id="abCancel">Done ✓</button></div></div>`;
  if(autoMode==="tug")
    return `<div class="autobar"><div class="ab-msg"><b>AUTO MODE · TUG</b><small>Tap people to pair into tugs (in order) — <span id="abCount">${autoPick.length}</span> picked</small></div>
      <div class="ab-acts"><button class="btn ghost" id="abCancel">Cancel</button><button class="btn good" id="abGo">Pair up ›</button></div></div>`;
  const area=REMOTE_ORDER[autoStep],ar=AREAS.find(a=>a.key===area),min=ar&&ar.min?ar.min[ST.shift]:0;
  const lbl=area==="South Team"?"SOUTH":area==="Terminal B"?"TB":area.toUpperCase();
  return `<div class="autobar"><div class="ab-msg"><b>AUTO MODE — PICK YOUR ${min} ${lbl} ${min===1?"PERSON":"PEOPLE"}</b><small><span id="abCount">${autoPick.length}</span> picked · step ${autoStep+1} of ${REMOTE_ORDER.length}</small></div>
    <div class="ab-acts"><button class="btn ghost" id="abCancel">Cancel</button><button class="btn good" id="abNext">${autoStep<REMOTE_ORDER.length-1?"Next ›":"Finish"}</button></div></div>`;
}
function initAssign(){
  if(!ST.assign){ ST.assign={ tugs:{}, areas:{} }; AREAS.forEach(a=>ST.assign.areas[a.key]=[]); }
  if(!ST.dispatch){ const d=dispatchCandidates(ST.shift).find(x=>x.avail); ST.dispatch=d?{name:d.name,emp:d.emp,custom:false}:{name:"",emp:"",custom:false}; }
}
function dispEmp(){ // emp of the chosen dispatcher if they're a pool body (so they leave the pool)
  if(!ST.dispatch||!ST.dispatch.name)return "";
  if(ST.dispatch.emp)return ST.dispatch.emp;
  const m=poolFor(ST.shift).find(b=>normName(b.name)===normName(ST.dispatch.name));
  return m?m.emp:"";
}
function assignedEmps(){
  const s=new Set();const a=ST.assign;const de=dispEmp();if(de)s.add(de);
  Object.values(a.tugs).forEach(t=>["DRIVER","OBSERVR"].forEach(r=>t[r]&&s.add(t[r].emp)));
  Object.values(a.areas).forEach(list=>list.forEach(p=>s.add(p.emp)));
  return s;
}
const BOLT='<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z"/></svg>';
const BOLT_X='<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" fill="currentColor" stroke="none"/><line x1="3" y1="3" x2="21" y2="21"/></svg>';
const POWER='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3.5v8"/><path d="M6.8 7a8 8 0 1 0 10.4 0"/></svg>';
const ovh=m=>(m/60).toFixed(1).replace('.0','');
function rAssign(){
  const pool=poolFor(ST.shift);
  const avail=pool.filter(availBody);
  // group by START time so doubles & prev-shift workers sit with their base-shift peers
  const toMin=t=>{const m=(t||"").match(/^(\d{1,2}):(\d{2})/);return m?(+m[1])*60+(+m[2]):9999;};
  const chip=(b,groupEnd)=>{const pw=prevWorkLabel(b.emp), fwd=!pw&&worksNext(b.emp);
    const s=(b.hours||"").split("-")[0]||"", e=(b.hours||"").split("-")[1]||"";
    const early=toMin(e)<groupEnd;                         // leaves before the group's latest end → flag red
    const hrs=esc(s)+"-"+(early?`<u class="early">${esc(e)}</u>`:esc(e));
    const isSel=SEL===b.emp, partial=(b.ov||0)<240, ac=empAreaCount(b.emp);
    return `<button class="abody ${isSel?(autoMode==='multi'?'sel multisel':'sel'):''} ${autoPick.includes(b.emp)?'apick':''} ${fwd?'dbl':''} ${partial?'partial':''}" data-emp="${esc(b.emp)}">${esc(b.name)}${fwd?'<em>DBL</em>':''}${partial?'<em class="prt">PARTIAL</em>':''}${autoMode==='multi'&&isSel&&ac>0?`<em class="a2">in ${ac}</em>`:''}<span>${hrs}</span>${pw?`<i class="pw">${esc(pw)}</i>`:''}</button>`;};
  const grp={};avail.forEach(b=>{const st=(b.hours||"").split("-")[0];(grp[st]=grp[st]||[]).push(b);});
  const gkeys=Object.keys(grp).sort((a,b)=>toMin(a)-toMin(b));
  const poolHTML=avail.length?gkeys.map(st=>{
    const list=grp[st];
    const endStr=list.reduce((mx,x)=>{const e=(x.hours||"").split("-")[1]||"";return toMin(e)>toMin(mx)?e:mx;},"00:00");
    const groupEnd=toMin(endStr);
    const col=poolCollapsed.has(st);
    return `<div class="shgrp ${col?'collapsed':''}"><div class="shgrp-h" data-grp="${esc(st)}"><span class="shg-ca">${col?'▸':'▾'}</span>${esc(st)}-${esc(endStr)}<span>${list.length}</span></div><div class="abody-wrap">${list.map(b=>chip(b,groupEnd)).join("")}</div></div>`;
  }).join(""):'<span class="hint">All assigned.</span>';
  const slotName=p=>{ if(!p) return `<span class="slot-empty">tap to fill</span>`;
    const pw=prevWorkLabel(p.emp), fwd=!pw&&worksNext(p.emp);
    return `<span class="slot-name">${esc(p.name)}${fwd?'<em class="sdbl">DBL</em>':''}</span><span class="slot-t">${esc(p._hours||(p.start+"-"+p.end))}${pw?`<b class="swln">${esc(pw)}</b>`:''}</span>`; };
  // dispatch dropdown + custom
  const cur=ST.dispatch?ST.dispatch.name:"", custom=!!(ST.dispatch&&ST.dispatch.custom);
  const opts=[...new Set([...DISPATCHERS,...(cur&&!custom&&!DISPATCHERS.includes(cur)?[cur]:[])])];
  const dispBox=`<select id="dispSel">
      <option value="">— none / OPEN —</option>
      ${opts.map(n=>`<option value="${esc(n)}" ${cur===n&&!custom?'selected':''}>${esc(n)}</option>`).join("")}
      <option value="__custom" ${custom?'selected':''}>Custom…</option>
    </select>${custom?`<input id="dispCustom" placeholder="Type dispatcher name" value="${esc(cur)}" autocomplete="off" />`:''}`;
  // areas
  const areaCards=AREAS.map(a=>{
    const list=ST.assign.areas[a.key],min=a.min?a.min[ST.shift]:0,need=min&&list.length<min;
    return `<div class="acard ${need?'need':''}"><div class="ahdr">${esc(a.key)} ${min?`<span class="amin ${need?'bad':''}">${list.length}/${min}</span>`:'<span class="amin disc">disc</span>'}</div>
      <div class="aslots">${list.map((p,i)=>`<span class="slot-chip" data-area="${esc(a.key)}" data-i="${i}">${esc(p.name)}<small>${esc(p._hours||(p.start+"-"+p.end))}</small> ✕</span>`).join("")}
        <button class="aadd" data-areaadd="${esc(a.key)}">+ add</button></div></div>`;
  }).join("");
  // tugs grouped
  const tugCard=id=>{const t=tugState(id),crew=ST.assign.tugs[id]||{},ty=tugType(id);
    const isDbl=(ST.assign.dblTugs||[]).includes(id);
    const stCls=t.oos?'st-oos':(t.gpu==='inop'?'st-inop':'st-ready');  // follow GPU/OOS color logic
    return `<div class="tcard ${stCls} ${t.oos?'oos':''} ${t.gpu==='inop'?'gpinop':''} ${isDbl?'dbltug':''}">
      <div class="thdr"><span class="thdr-l">STUG ${id}${ELECTRIC.has(id)?'<i>E</i>':''}${isDbl?'<b class="dbltag">2×</b>':''}</span>
        <span class="thdr-r">${t.oos?'':`<button class="ticon gpubtn ${t.gpu==='inop'?'inop':'ok'}" data-gpu="${id}" title="Ground power: ${t.gpu==='inop'?'INOP':'OK'}">${t.gpu==='inop'?BOLT_X:BOLT}</button>`}
        <button class="ticon toos ${t.oos?'isoos':''}" data-oos="${id}" title="${t.oos?'Bring into service':'Mark out of service'}">${t.oos?'OOS':POWER}</button>
        <button class="ticon thide" data-hide="${id}" title="Remove from board">✕</button></span></div>
      ${t.oos?`<div class="oosbar"><span class="haz">✕</span> OUT OF SERVICE</div>`:
        `<div class="trow ${crew.DRIVER?'full':''}" data-tug="${id}" data-role="DRIVER"><i>DRIVER</i>${slotName(crew.DRIVER)}</div>
         <div class="trow ${crew.OBSERVR?'full':''}" data-tug="${id}" data-role="OBSERVR"><i>OBSERVR</i>${slotName(crew.OBSERVR)}</div>
         <button class="tdbl ${isDbl?'on':''}" data-dbl="${id}">${isDbl?'✓ Double tug':'2× Double tug'}</button>`}
    </div>`;};
  // unused (unset) tugs still show, extremely muted — tap to bring into service
  const mutedCard=id=>`<div class="tcard muted" data-add="${id}"><div class="thdr"><span class="thdr-l">STUG ${id}${ELECTRIC.has(id)?'<i>E</i>':''}</span><span class="muse">+ add</span></div><div class="muted-b">Not in service · tap to add</div></div>`;
  const tugGroups=TUG_GROUPS.map(g=>{
    const ids=showUnusedTugs?g.ids:g.ids.filter(id=>{const t=tugState(id);return t.running||t.oos;});
    if(!ids.length)return "";
    const cells=ids.map(id=>{const t=tugState(id);return (t.running||t.oos)?tugCard(id):mutedCard(id);});
    return `<div class="tug-gtitle">STUG ${g.label}${tugType(g.ids[0])?` · ${tugType(g.ids[0])}`:''}</div><div class="tug-grid">${cells.join("")}</div>`;
  }).join("")||'<p class="hint" style="margin:4px 0">No tugs in service — show unused to add one.</p>';
  const unusedN=TUGS.filter(id=>tugState(id).unset).length;
  const tugToggle=unusedN?`<button class="btn ghost sm" id="toggleUnused" style="margin-top:10px;width:auto">${showUnusedTugs?'Hide unused tugs':'＋ Show '+unusedN+' unused tug'+(unusedN>1?'s':'')}</button>`:'';
  const running=TUGS.filter(id=>tugState(id).running).length;
  ROOT.innerHTML=`
    <div class="card pad asg2-top"><div class="pool-head"><h2 class="staff-h" style="margin:0">Assign ${ST.shift}</h2><span class="cnt">${avail.length} left</span></div>
      <p class="hint" style="margin:2px 0 0">${autoMode==='multi'?'<b>Multi Assign</b> — tap names to turn them purple (can go in 2 areas).':autoMode?'<b>Auto mode</b> — tap people in the pool, then use the bar below.':'Tap a name, then tap a tug or area slot. Use <b>Multi Assign</b> to mark people for 2 areas.'}</p></div>
    <div class="asg2">
      <div class="asg2-pool card pad">
        <div class="seg-section">STAFF · ${avail.length} left</div>
        <div class="auto-btns"><button class="btn ghost sm ${autoMode==='tug'?'on':''}" id="autoTug">⚙ Auto Tug</button><button class="btn ghost sm ${autoMode==='remote'?'on':''}" id="autoRemote">⚙ Auto Remote</button><button class="btn ghost sm ${autoMode==='multi'?'on purple':''}" id="autoMulti">✦ Multi Assign</button></div>
        <div class="pool-groups">${poolHTML}</div>
      </div>
      <div class="asg2-board">
        <div class="card pad"><div class="seg-section">DISPATCH (1 per shift)</div><div class="disp-box">${dispBox}</div></div>
        <div class="card pad"><div class="seg-section">TUGS — ${running} running</div>${tugGroups}${tugToggle}${(ST.assign.dblTugs||[]).length?` <button class="btn ghost sm" id="fillDbl" style="margin-top:10px;width:auto">⤵ Fill double tugs with doubles</button>`:''}</div>
        <div class="card pad"><div class="seg-section">AREAS</div><div class="area-grid">${areaCards}</div></div>
      </div>
    </div>
    <div class="btnrow" style="margin-top:10px"><button class="btn navy" id="toBrief">Generate staffing sheet ›</button></div>
    ${back("reconcile","Tugs")}
    ${autoMode?'<div class="autobar-spacer"></div>'+autoBar():''}`;
  // pool chip tap depends on mode: multi/normal = select · tug/remote = pick
  const poolEl=$('#staffRoot .pool-groups');
  poolEl?.addEventListener('click',ev=>{ const chip=ev.target.closest('.abody'); if(!chip)return; const emp=chip.dataset.emp;
    if(autoMode==='tug'||autoMode==='remote'){ const i=autoPick.indexOf(emp); i>=0?autoPick.splice(i,1):autoPick.push(emp); chip.classList.toggle('apick',autoPick.includes(emp)); const cc=$('#abCount'); if(cc)cc.textContent=autoPick.length; return; }
    if(autoMode==='multi'){ SEL=(SEL===emp?null:emp); render(); return; } // multi: select; placing keeps them available for a 2nd spot
    if(SEL===emp){SEL=null;chip.classList.remove('sel');} else { SEL=emp; $$('#staffRoot .abody.sel').forEach(c=>c.classList.remove('sel')); chip.classList.add('sel'); } });
  $("#autoTug")?.addEventListener("click",()=>{ autoMode=autoMode==='tug'?null:'tug'; autoPick=[]; SEL=null; render(); });
  $("#autoRemote")?.addEventListener("click",()=>{ autoMode=autoMode==='remote'?null:'remote'; autoStep=0; autoPick=[]; SEL=null; render(); });
  $("#autoMulti")?.addEventListener("click",()=>{ autoMode=autoMode==='multi'?null:'multi'; autoPick=[]; SEL=null; render(); });
  $("#abCancel")?.addEventListener("click",()=>{ autoMode=null; autoPick=[]; autoStep=0; render(); });
  $("#abGo")?.addEventListener("click",autoPairTugs);
  $("#abNext")?.addEventListener("click",autoNextRemote);
  $$('#staffRoot .tdbl').forEach(b=>b.onclick=()=>{ const id=+b.dataset.dbl; ST.assign.dblTugs=ST.assign.dblTugs||[]; const i=ST.assign.dblTugs.indexOf(id); i>=0?ST.assign.dblTugs.splice(i,1):ST.assign.dblTugs.push(id); render(); });
  $("#fillDbl")?.addEventListener("click",fillDoubleTugs);
  $$('#staffRoot .shgrp-h[data-grp]').forEach(h=>h.onclick=()=>{ const g=h.dataset.grp; poolCollapsed.has(g)?poolCollapsed.delete(g):poolCollapsed.add(g); render(); });
  // placing keeps the selection in multi mode so the same person can go in a 2nd spot (auto-clears at 2 areas)
  const place=(setter)=>{ if(!SEL)return; const emp=SEL,b=poolFor(ST.shift).find(x=>x.emp===emp); if(!b)return; setter(mkBody(b)); if(autoMode!=='multi'||empAreaCount(emp)>=2)SEL=null; render(); };
  $("#dispSel")?.addEventListener("change",e=>{ const v=e.target.value;
    if(v==="__custom"){ST.dispatch={name:custom?cur:"",emp:"",custom:true};}
    else{ const m=pool.find(b=>normName(b.name)===normName(v)); ST.dispatch=v?{name:v,emp:m?m.emp:"",custom:false}:{name:"",emp:"",custom:false}; }
    render(); });
  $("#dispCustom")?.addEventListener("input",e=>{ ST.dispatch={name:e.target.value,emp:"",custom:true}; });
  $$('#staffRoot .trow').forEach(s=>s.onclick=()=>{ const id=s.dataset.tug,role=s.dataset.role,t=ST.assign.tugs[id]=ST.assign.tugs[id]||{};
    if(t[role]){const p=t[role];t[role]=null;SEL=p.emp;render();return;} place(p=>{ST.assign.tugs[id]=ST.assign.tugs[id]||{};ST.assign.tugs[id][role]=p;}); }); // tap filled slot = pick up & move
  $$('#staffRoot .toos').forEach(b=>b.onclick=()=>{ const id=+b.dataset.oos,t=tugState(id); if(t.oos){setTug(id,"ready");} else {setTug(id,"oos");delete ST.assign.tugs[id];} render(); });
  $$('#staffRoot .gpubtn').forEach(b=>b.onclick=()=>{ const id=+b.dataset.gpu,t=tugState(id); if(t.oos)return; setTug(id,t.gpu==='inop'?"ready":"inop"); render(); });
  $$('#staffRoot .tcard.muted[data-add]').forEach(c=>c.onclick=()=>{ setTug(+c.dataset.add,"ready"); render(); });
  $("#toggleUnused")?.addEventListener("click",()=>{ showUnusedTugs=!showUnusedTugs; render(); });
  $$('#staffRoot .thide').forEach(b=>b.onclick=()=>{ const id=+b.dataset.hide; setTug(id,"unset"); delete ST.assign.tugs[id]; render(); });
  $$('#staffRoot .aadd').forEach(b=>b.onclick=()=>{ const k=b.dataset.areaadd; place(p=>{ if(!ST.assign.areas[k].some(x=>x.emp===p.emp))ST.assign.areas[k].push(p); }); });
  $$('#staffRoot .slot-chip').forEach(c=>c.onclick=()=>{ const k=c.dataset.area,i=+c.dataset.i; const p=ST.assign.areas[k][i]; ST.assign.areas[k].splice(i,1); if(p)SEL=p.emp; render(); }); // remove = pick up & move
  $("#toBrief").onclick=()=>{ initBrief(); saveDraft(); ST.step="sheet"; render(); };  // briefing is edited in its own tab, not here
  saveDraft();
  $$('#staffRoot .stp-back').forEach(b=>b.onclick=()=>{ST.step=b.dataset.to;render();});
}

/* ---- step: briefing / focus items ---- */
const FOCUS_DEFAULT=[
 "Do you know who your first aid responders are and where the nearest kit is located?",
 "Slippery conditions — keep tugs under 10 MPH on taxiways, 5 MPH on remote and gates.",
 "Follow SOP, no shortcuts, heighten situational awareness.",
 "Safety is our #1 priority — head out to your assignment early. Do not sit on tows.",
 "Keep the app updated and answer your radio.",
 "Ensure AC are properly secured with chocks and safety cones.",
 "Once AC is secured ensure stairs are 5 feet away from the AC.",
 "Report any challenges or equipment shortages to the supervisor.",
 "Complete web-based training when time allows."];
function loadFocus(){ const d=Store.getJSON("elt.staff.focus",null); return Array.isArray(d)&&d.length?d:FOCUS_DEFAULT.slice(); }
function initBrief(){ if(!ST.brief)ST.brief={weather:"",flight:"",parking:"",safety:"",notes:"",focus:loadFocus()}; }
function rBrief(){
  const b=ST.brief;
  const fa=(id,label,val,ph,rows)=>`<label class="fld-l">${label}</label><textarea id="${id}" class="bf-in" rows="${rows||2}" placeholder="${esc(ph||'')}">${esc(val)}</textarea>`;
  ROOT.innerHTML=card(`
    <h2 class="staff-h">Briefing &amp; focus items</h2>
    <p class="hint" style="margin:0 0 4px">Staffing counts and tug status fill in automatically. Add tonight's info below.</p>
    ${fa("brWeather","Weather",b.weather,"Tonight's forecast…")}
    ${fa("brFlight","Flight activity / ATC",b.flight,"Arrivals 421 / Departures 403 | PBT 55,000")}
    ${fa("brParking","Remote parking",b.parking,"Murphy / remote spot notes…")}
    ${fa("brSafety","Safety tip of the day",b.safety,"")}
    ${fa("brNotes","Notes",b.notes,"e.g. STG 28 GP found damaged again")}
    <label class="fld-l">Focus items</label>
    <div id="focusWrap" class="focus-wrap">${b.focus.map((t,i)=>`<div class="frow"><textarea rows="2" data-fi="${i}">${esc(t)}</textarea><button class="xrem" data-fdel="${i}" title="Remove">✕</button></div>`).join("")}</div>
    <button class="btn ghost" id="focusAdd" style="margin-top:8px">+ Add focus item</button>
    <div class="btnrow" style="margin-top:14px"><button class="btn navy" id="toGen">Generate sheets ›</button></div>
    ${back("assign","Board")}`);
  const save=()=>{ b.weather=$("#brWeather").value;b.flight=$("#brFlight").value;b.parking=$("#brParking").value;b.safety=$("#brSafety").value;b.notes=$("#brNotes").value;
    b.focus=$$("#focusWrap textarea").map(t=>t.value); };
  $("#focusAdd").onclick=()=>{ save(); b.focus.push(""); render(); };
  $$('#staffRoot [data-fdel]').forEach(x=>x.onclick=()=>{ save(); b.focus.splice(+x.dataset.fdel,1); render(); });
  $("#toGen").onclick=()=>{ save(); Store.setJSON("elt.staff.focus",b.focus.filter(s=>s.trim())); ST.step="sheet"; render(); };
  $$('#staffRoot .stp-back').forEach(x=>x.onclick=()=>{ save(); ST.step=x.dataset.to; render(); });
}
function tally(abs){const t={VAC:0,DAT:0,CB:0,SICK:0,OUT:0,OJI:0};abs.forEach(a=>{const c=(a.code||"").toUpperCase();
  if(/VC|VAC/.test(c))t.VAC++;else if(/DAT/.test(c))t.DAT++;else if(/CB/.test(c))t.CB++;else if(/SICK/.test(c))t.SICK++;else if(/OJI|INJ/.test(c))t.OJI++;else t.OUT++;});return t;}
function buildBriefing(){
  const b=ST.brief||{focus:[]};
  const oosT=TUGS.filter(id=>tugState(id).oos), inop=TUGS.filter(id=>tugSt(id)==='inop'), sked=TUGS.filter(id=>tugState(id).running).length;
  const rows=SHIFTS.map(sh=>{const pool=poolFor(sh),t=tally(absentFor(sh));return {sh,n:pool.length,max:Math.floor(pool.length/2),t};});
  const fld=(l,v)=>`<div class="bf-row"><div class="bf-l">${l}</div><div class="bf-v">${v?esc(v).replace(/\n/g,"<br>"):'<span class="bf-em">—</span>'}</div></div>`;
  const date=ST.parsed?ST.parsed.date:"";
  return `<div class="bf">
    <div class="bf-title">DAILY MOVE TEAM SHIFT BRIEFING<span>${esc(date)}</span></div>
    <div class="bf-2col">
      <div class="bf-card"><div class="bf-h">Tonight</div>
        ${fld("Weather",b.weather)}${fld("Flight activity / ATC",b.flight)}${fld("Remote parking",b.parking)}</div>
      <div class="bf-card"><div class="bf-h">Tugs &amp; Equipment</div>
        ${fld("Tugs SKED",sked+" of "+TUGS.length)}
        ${fld("Tugs OOS",oosT.length?oosT.join(", "):"none")}
        ${fld("INOP ground power",inop.length?inop.join(", "):"none")}
        ${fld("Safety tip",b.safety)}</div>
    </div>
    <div class="bf-card"><div class="bf-h">Move Team Staffing Count</div>
      <table class="bf-tbl"><thead><tr><th>Shift</th><th>Available</th><th>Max tugs</th><th>VAC | DAT | CB</th><th>SICK | OUT | OJI</th></tr></thead>
      <tbody>${rows.map(r=>`<tr><td><b>${r.sh}</b></td><td>${r.n}</td><td>${r.max}</td><td>${r.t.VAC} | ${r.t.DAT} | ${r.t.CB}</td><td>${r.t.SICK} | ${r.t.OUT} | ${r.t.OJI}</td></tr>`).join("")}</tbody></table>
      <div class="bf-mgr">MGR <b>${esc(ST.manager||"—")}</b> · ASST <b>${esc(ST.asst.join(", ")||"—")}</b> · SUP <b>${esc(ST.supers.join(", ")||"—")}</b></div>
    </div>
    <div class="bf-card"><div class="bf-h">Briefing Focus Items</div>
      <ol class="bf-focus">${(b.focus||[]).filter(s=>s.trim()).map(s=>`<li>${esc(s)}</li>`).join("")}</ol></div>
    ${b.notes?`<div class="bf-card bf-notes"><div class="bf-h">Notes</div><div>${esc(b.notes).replace(/\n/g,"<br>")}</div></div>`:""}
  </div>`;
}

/* ---- step: generate (staffing sheet + briefing, exports) ---- */
let sheetView="staff";
function rSheet(){
  const html=sheetView==="staff"?buildSheet():buildBriefing();
  ROOT.innerHTML=`
    <div class="card pad no-print" style="padding-bottom:8px">
      <div class="seg-wrap"><button class="seg ${sheetView==='staff'?'on':''}" data-sv="staff">Staffing sheet</button><button class="seg ${sheetView==='brief'?'on':''}" data-sv="brief">Briefing</button></div>
    </div>
    <div class="sheet-scroll"><div id="staffSheet">${html}</div></div>
    <div class="card pad no-print" style="text-align:center">
      <button class="btn good" id="shLog" style="width:100%">✓ Log Manpower</button>
      <p class="hint" style="margin:8px 2px 0">Log this manpower to save it.</p>
      <div class="btnrow" style="margin-top:12px"><button class="btn ghost stp-back" data-to="assign">‹ Edit board</button></div>
    </div>`;
  $$('#staffRoot .seg[data-sv]').forEach(s=>s.onclick=()=>{sheetView=s.dataset.sv;render();});
  $("#shLog").onclick=logManpower;
  $$('#staffRoot .stp-back').forEach(b=>b.onclick=()=>{ST.step=b.dataset.to;render();});
}
function buildSheet(){
  const a=ST.assign, dn=ST.dispatch&&ST.dispatch.name?esc(ST.dispatch.name):'<span class="sb-oos">OPEN</span>';
  const crew=p=>{ if(!p)return ""; const pw=prevWorkLabel(p.emp), fwd=!pw&&worksNext(p.emp);
    return `${esc(p.name)}${fwd?' <b class="sb-db">DBL</b>':''} <span class="sb-t">${esc(p._hours||(p.start+"-"+p.end))}</span>${pw?` <b class="sb-wln">${esc(pw)}</b>`:''}`; };
  const areaBox=k=>{const list=a.areas[k]||[];const ad=AREAS.find(x=>x.key===k);const min=ad&&ad.min?ad.min[ST.shift]:0;
    return `<div class="sb-area"><div class="sb-area-h">${esc(k)}${min?` <span>${list.length}/${min}</span>`:''}</div>
      <div class="sb-area-b">${list.map(p=>`<div>${esc(p.name)}</div>`).join("")||'<div class="sb-empty">—</div>'}</div></div>`;};
  const tugCell=id=>{const t=tugState(id),c=a.tugs[id]||{},ty=tugType(id);
    const bolt=t.gpu==='inop'?`<span class="sb-bolt inop">${BOLT_X}</span>`:`<span class="sb-bolt ok">${BOLT}</span>`;
    return `<div class="sb-tug ${t.oos?'oos':''}"><div class="sb-tug-h">STUG ${id}${ELECTRIC.has(id)?'<b>w</b>':''}${ty?`<u>${ty}</u>`:''} ${t.oos?'':bolt}${t.oos?'<span class="sb-oos">OUT OF SERVICE</span>':''}</div>
      ${t.oos?'<div class="sb-haz"></div>':`<div class="sb-tug-r"><i>DRIVER</i>${crew(c.DRIVER)}</div><div class="sb-tug-r"><i>OBSERVR</i>${crew(c.OBSERVR)}</div>`}</div>`;};
  const groupBlock=g=>{const ids=g.ids.filter(id=>{const t=tugState(id);return t.running||t.oos;});
    return ids.length?`<div class="sb-tgroup"><div class="sb-tg-h">STUG ${g.label}</div><div class="sb-tg-cells">${ids.map(tugCell).join("")}</div></div>`:"";};
  const absent=absentFor(ST.shift);
  const absBlock=absent.length?`<div class="sb-absent"><div class="sb-abs-h">NOT HERE THIS SHIFT — ${absent.length}</div>
    <div class="sb-abs-grid">${absent.map(x=>`<span class="sb-abs"><b>${esc(x.name)}</b><span class="sb-abs-c">${esc(x.code)}</span></span>`).join("")}</div></div>`:"";
  return `<div class="sb">
    <div class="sb-top"><div class="sb-title">EWR AMT STAFFING</div><div class="sb-shift">SHIFT <b>${ST.shift}</b></div></div>
    <div class="sb-band">
      ${AREAS.map(x=>areaBox(x.key)).join("")}
      <div class="sb-area sb-disp"><div class="sb-area-h">DISPATCHER</div><div class="sb-area-b">${dn}</div></div>
      <div class="sb-area"><div class="sb-area-h">SUPERVISORS</div><div class="sb-area-b">${ST.supers.map(esc).map(s=>`<div>${s}</div>`).join("")||'<div class="sb-empty">—</div>'}</div></div>
      <div class="sb-area"><div class="sb-area-h">MANAGERS</div><div class="sb-area-b">${[ST.manager,...ST.asst].filter(Boolean).map(esc).map(s=>`<div>${s}</div>`).join("")||'<div class="sb-empty">—</div>'}</div></div>
    </div>
    <div class="sb-grid"><div class="sb-rail">ALWAYS FOLLOW SOP</div>
      <div class="sb-tugs">${TUG_GROUPS.map(groupBlock).join("")}</div>
      <div class="sb-rail">ALWAYS FOLLOW SOP</div></div>
    ${absBlock}
  </div>`;
}

/* ---- exporters (canvas-drawn — works in Safari/WebKit) ---- */
const FA=s=>s+" -apple-system,Arial,sans-serif";
function drawBolt(ctx,x,y,inop){ // small lightning at (x,y) top-left ~13x15
  ctx.save();ctx.beginPath();ctx.moveTo(x+8,y);ctx.lineTo(x,y+9);ctx.lineTo(x+5,y+9);ctx.lineTo(x+3,y+15);ctx.lineTo(x+11,y+6);ctx.lineTo(x+6,y+6);ctx.closePath();
  ctx.fillStyle=inop?"#c0271e":"#1e7d46";ctx.fill();
  if(inop){ctx.strokeStyle="#c0271e";ctx.lineWidth=1.8;ctx.beginPath();ctx.moveTo(x-1,y-1);ctx.lineTo(x+13,y+16);ctx.stroke();}
  ctx.restore();
}
function renderStaffCanvas(){
  const a=ST.assign,S=2,W=1180,M=26,gap=8;
  const boxes=[];
  AREAS.forEach(x=>{const list=(a.areas[x.key]||[]);boxes.push({t:x.key,n:list.map(p=>p.name),sub:x.min?list.length+"/"+x.min[ST.shift]:"disc"});});
  const dn=ST.dispatch&&ST.dispatch.name?ST.dispatch.name:"";
  boxes.push({t:"DISPATCHER",n:[dn||"OPEN"],navy:true,open:!dn});
  boxes.push({t:"SUPERVISORS",n:ST.supers.slice()});
  boxes.push({t:"MANAGERS",n:[ST.manager,...ST.asst].filter(Boolean)});
  const cols=5,brows=Math.ceil(boxes.length/cols),bandW=W-2*M,bw=(bandW-(cols-1)*gap)/cols;
  const maxN=Math.max(2,...boxes.map(b=>b.n.length)),bh=22+maxN*16+6;
  const railW=24,gx0=M+railW+gap,tgW=W-2*M-2*(railW+gap);
  // tug rows by group (each group is a labeled band of up to 5 cells)
  const tcols=4,tw=(tgW-(tcols-1)*gap)/tcols,th=84,ghH=22;
  const touched=id=>{const t=tugState(id);return t.running||t.oos;};
  const groupIds=TUG_GROUPS.map(g=>g.ids.filter(touched));
  const groupHeights=groupIds.map(ids=>ids.length?ghH+Math.ceil(ids.length/tcols)*(th+gap):0);
  const titleH=44,bandY=M+titleH+10,tugTop=bandY+brows*(bh+gap)+10;
  const tugAreaH=groupHeights.reduce((s,h)=>s+h,0);
  const absent=absentFor(ST.shift), absH=absent.length?28+Math.ceil(absent.length/4)*18+10:0;
  const H=tugTop+tugAreaH+ (absH?absH+8:0) +M;
  const c=document.createElement("canvas");c.width=W*S;c.height=H*S;const ctx=c.getContext("2d");ctx.scale(S,S);
  ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);
  const clip=(t,mw,font)=>{ctx.font=font;t=t||"";if(ctx.measureText(t).width<=mw)return t;while(t.length&&ctx.measureText(t+"…").width>mw)t=t.slice(0,-1);return t+"…";};
  ctx.fillStyle="#10171f";ctx.font=FA("900 30px");ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("EWR AMT STAFFING",W/2,M+titleH/2);
  ctx.font=FA("800 13px");ctx.fillStyle="#5a6772";ctx.textAlign="right";ctx.fillText("SHIFT",W-M-52,M+titleH/2);
  ctx.fillStyle="#0b3d63";ctx.fillRect(W-M-46,M+titleH/2-13,46,26);ctx.fillStyle="#fff";ctx.font=FA("800 14px");ctx.textAlign="center";ctx.fillText(ST.shift,W-M-23,M+titleH/2+1);
  boxes.forEach((bx,i)=>{const col=i%cols,row=Math.floor(i/cols),x=M+col*(bw+gap),by=bandY+row*(bh+gap);
    ctx.fillStyle="#fff";ctx.fillRect(x,by,bw,bh);
    ctx.fillStyle=bx.navy?"#0b3d63":"#f5a623";ctx.fillRect(x,by,bw,20);
    ctx.strokeStyle="#d7dce1";ctx.lineWidth=1;ctx.strokeRect(x+.5,by+.5,bw-1,bh-1);
    ctx.fillStyle=bx.navy?"#fff":"#3a2500";ctx.font=FA("900 11px");ctx.textBaseline="middle";ctx.textAlign="left";ctx.fillText(clip(bx.t.toUpperCase(),bw-40,FA("900 11px")),x+6,by+10);
    if(bx.sub){ctx.textAlign="right";ctx.fillText(bx.sub,x+bw-6,by+10);}
    ctx.font=FA("600 12px");ctx.textAlign="left";
    (bx.n.length?bx.n:["—"]).forEach((nm,j)=>{ctx.fillStyle=bx.open?"#c0271e":(bx.n.length?"#1c2530":"#c2ccd4");ctx.fillText(clip(nm,bw-12,FA("600 12px")),x+6,by+20+12+j*16);});
  });
  // rails
  [M,W-M-railW].forEach(rx=>{ctx.fillStyle="#0b3d63";ctx.fillRect(rx,tugTop,railW,tugAreaH);
    ctx.save();ctx.translate(rx+railW/2,tugTop+tugAreaH/2);ctx.rotate(-Math.PI/2);ctx.fillStyle="#fff";ctx.font=FA("900 12px");ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("ALWAYS FOLLOW SOP",0,0);ctx.restore();});
  // tug groups
  let gy=tugTop;
  TUG_GROUPS.forEach((g,gi)=>{
    const ids=groupIds[gi];if(!ids.length)return;
    ctx.fillStyle="#0b3d63";ctx.font=FA("900 12px");ctx.textAlign="left";ctx.textBaseline="middle";ctx.fillText("STUG "+g.label,gx0,gy+10);
    let ty=gy+ghH;
    ids.forEach((id,i)=>{const col=i%tcols,x=gx0+col*(tw+gap),yy=ty+Math.floor(i/tcols)*(th+gap);
      const t=tugState(id),cr=a.tugs[id]||{},tlbl=tugType(id);
      ctx.fillStyle=t.oos?"#fbeceb":"#fff";ctx.fillRect(x,yy,tw,th);
      ctx.fillStyle="#eef2f5";ctx.fillRect(x,yy,tw,20);
      ctx.strokeStyle="#d7dce1";ctx.lineWidth=1;ctx.strokeRect(x+.5,yy+.5,tw-1,th-1);
      ctx.fillStyle="#0b3d63";ctx.font=FA("900 12px");ctx.textBaseline="middle";ctx.textAlign="left";
      const hd="STUG "+id+(ELECTRIC.has(id)?" w":"");ctx.fillText(hd,x+7,yy+11);
      if(tlbl){const w0=ctx.measureText(hd).width;ctx.fillStyle="#90a0ad";ctx.font=FA("800 8.5px");ctx.fillText(tlbl,x+7+w0+7,yy+11);}
      if(!t.oos)drawBolt(ctx,x+tw-21,yy+3,t.gpu==='inop');
      if(t.oos){ ctx.strokeStyle="#d9342b";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+4,yy+26);ctx.lineTo(x+tw-4,yy+th-4);ctx.moveTo(x+tw-4,yy+26);ctx.lineTo(x+4,yy+th-4);ctx.stroke();
        ctx.fillStyle="#c0271e";ctx.font=FA("800 11px");ctx.textAlign="center";ctx.fillText("OUT OF SERVICE",x+tw/2,yy+th/2+10); }
      else{
        ctx.textAlign="left";
        ["DRIVER","OBSERVR"].forEach((role,k)=>{const yk=yy+42+k*26;
          ctx.font=FA("800 9px");ctx.fillStyle="#90a0ad";ctx.textAlign="left";ctx.fillText(role,x+7,yk);
          const p=cr[role];if(!p){ctx.fillStyle="#cdd5dc";ctx.font=FA("600 12px");ctx.fillText("—",x+62,yk);return;}
          const pw=prevWorkLabel(p.emp), fwd=!pw&&worksNext(p.emp);
          const tag=pw||(fwd?"DBL":"");
          ctx.font=FA("700 13px");const nmw=ctx.measureText(p.name).width;ctx.fillStyle="#1c2530";ctx.fillText(clip(p.name,tw-(tag?180:150),FA("700 13px")),x+62,yk);
          ctx.font=FA("600 10px");ctx.fillStyle="#90a0ad";ctx.fillText(p.start+"-"+p.end,x+62+Math.min(nmw,tw-(tag?182:152))+7,yk);
          if(tag){ctx.font=FA("800 8px");ctx.fillStyle=pw?"#7a3287":"#0b3d63";ctx.textAlign="right";ctx.fillText(tag,x+tw-6,yk);ctx.textAlign="left";} });
      }
    });
    gy+=groupHeights[gi];
  });
  // absent strip
  if(absH){const ay=tugTop+tugAreaH+8;
    ctx.fillStyle="#fbfbfc";ctx.fillRect(M,ay,W-2*M,absH);ctx.strokeStyle="#e2e7eb";ctx.lineWidth=1;ctx.strokeRect(M+.5,ay+.5,W-2*M-1,absH-1);
    ctx.fillStyle="#67727e";ctx.font=FA("800 11px");ctx.textAlign="left";ctx.textBaseline="middle";ctx.fillText("NOT HERE THIS SHIFT — "+absent.length,M+8,ay+13);
    ctx.font=FA("600 12px");const cw=(W-2*M-16)/4;
    absent.forEach((x,i)=>{const col=i%4,row=Math.floor(i/4),px=M+8+col*cw,py=ay+28+row*18;
      ctx.fillStyle="#1c2530";ctx.font=FA("600 12px");ctx.textAlign="left";ctx.fillText(clip(x.name,cw-48,FA("600 12px")),px,py);
      ctx.fillStyle="#c0271e";ctx.font=FA("800 10px");ctx.textAlign="right";ctx.fillText(x.code,px+cw-14,py);ctx.textAlign="left";ctx.font=FA("600 12px"); });
  }
  ctx.strokeStyle="#cfd6dd";ctx.lineWidth=2;ctx.strokeRect(1,1,W-2,H-2);
  return c;
}
function canvasToPng(c){return new Promise(res=>c.toBlob(b=>res(b),"image/png"));}
// trim uniform white margins so the exported image is snipped tight to the content
function autoCropCanvas(src,pad){
  try{ const w=src.width,h=src.height,d=src.getContext("2d").getImageData(0,0,w,h).data;
    let top=h,left=w,right=-1,bottom=-1;const tol=10;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;
      if(d[i+3]>240&&(d[i]<255-tol||d[i+1]<255-tol||d[i+2]<255-tol)){if(x<left)left=x;if(x>right)right=x;if(y<top)top=y;if(y>bottom)bottom=y;}}
    if(right<left||bottom<top)return src;
    pad=pad==null?10:pad;left=Math.max(0,left-pad);top=Math.max(0,top-pad);right=Math.min(w-1,right+pad);bottom=Math.min(h-1,bottom+pad);
    const cw=right-left+1,ch=bottom-top+1,out=document.createElement("canvas");out.width=cw;out.height=ch;
    const o=out.getContext("2d");o.fillStyle="#fff";o.fillRect(0,0,cw,ch);o.drawImage(src,left,top,cw,ch,0,0,cw,ch);return out;
  }catch(_){return src;} }
function exportSheetImage(){ const c=autoCropCanvas(renderStaffCanvas()); c.toBlob(b=>{ if(!b)return alert("Image export failed — use Print."); const name="EWR-AMT-Staffing-"+ST.shift+".jpg"; if(window.showImagePreview)window.showImagePreview(b,name); },"image/jpeg",0.92); }
function renderBriefCanvas(){
  const b=ST.brief||{focus:[]},S=2,W=1100,M=34;
  const oosT=TUGS.filter(id=>tugState(id).oos),inop=TUGS.filter(id=>tugSt(id)==='inop'),sked=TUGS.filter(id=>tugState(id).running).length;
  const rows=SHIFTS.map(sh=>{const pool=poolFor(sh),t=tally(absentFor(sh));return {sh,n:pool.length,max:Math.floor(pool.length/2),t};});
  // pre-measure not needed; compute height by simulating
  const ctx0=document.createElement("canvas").getContext("2d");
  const wrap=(t,mw,font)=>{ctx0.font=font;const words=(t||"").split(/\s+/),lines=[];let cur="";for(const w of words){const test=cur?cur+" "+w:w;if(ctx0.measureText(test).width>mw&&cur){lines.push(cur);cur=w;}else cur=test;}if(cur)lines.push(cur);return lines.length?lines:[""];};
  const fields=[["Weather",b.weather],["Flight activity / ATC",b.flight],["Remote parking",b.parking],["Safety tip",b.safety]];
  let y=M+40;
  const segs=[];
  const addH=(label,lines,fs)=>{segs.push({label,lines,fs});y+=18+lines.length*(fs+4)+6;};
  fields.forEach(([l,v])=>addH(l,wrap(v||"—",W-2*M-150,FA("400 15px")),16));
  addH("Tugs SKED / OOS / INOP GP",[sked+" of "+TUGS.length+"   ·   OOS: "+(oosT.join(", ")||"none")+"   ·   INOP GP: "+(inop.join(", ")||"none")],16);
  const tblY=y+6;y+=30+rows.length*22+14;
  const mgrY=y;y+=24;
  segs.push({focusTitle:true});y+=24;
  const focus=(b.focus||[]).filter(s=>s.trim());
  const focusLines=focus.map(f=>wrap(f,W-2*M-30,FA("400 14px")));
  focusLines.forEach(fl=>y+=fl.length*18+6);
  if(b.notes){y+=10;const nl=wrap(b.notes,W-2*M-20,FA("400 14px"));y+=24+nl.length*18;}
  const H=y+M;
  const c=document.createElement("canvas");c.width=W*S;c.height=H*S;const ctx=c.getContext("2d");ctx.scale(S,S);
  ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);
  ctx.fillStyle="#0b3d63";ctx.fillRect(0,0,W,4);
  ctx.fillStyle="#10171f";ctx.font=FA("900 24px");ctx.textBaseline="alphabetic";ctx.textAlign="left";ctx.fillText("DAILY MOVE TEAM SHIFT BRIEFING",M,M+24);
  ctx.fillStyle="#67727e";ctx.font=FA("600 13px");ctx.textAlign="right";ctx.fillText(ST.parsed?ST.parsed.date:"",W-M,M+24);
  let yy=M+50;
  segs.forEach(s=>{
    if(s.focusTitle){ctx.fillStyle="#0b3d63";ctx.font=FA("800 14px");ctx.textAlign="left";ctx.fillText("BRIEFING FOCUS ITEMS",M,yy+4);yy+=24;
      focus.forEach((f,i)=>{const fl=focusLines[i];ctx.fillStyle="#1c2530";ctx.font=FA("400 14px");
        fl.forEach((ln,k)=>ctx.fillText((k===0?(i+1)+". ":"   ")+ln,M+4,yy+14+k*18));yy+=fl.length*18+6;});return;}
    ctx.fillStyle="#8a939c";ctx.font=FA("800 11px");ctx.textAlign="left";ctx.fillText(s.label.toUpperCase(),M,yy+2);
    ctx.fillStyle="#1c2530";ctx.font=FA("400 15px");s.lines.forEach((ln,k)=>ctx.fillText(ln,M+150,yy+2+k*(s.fs+4)));
    yy+=18+s.lines.length*(s.fs+4)+6;
  });
  // staffing table
  ctx.fillStyle="#0b3d63";ctx.font=FA("800 13px");ctx.textAlign="left";ctx.fillText("MOVE TEAM STAFFING COUNT",M,tblY+2);
  const cols=["Shift","Avail","Max tugs","VAC|DAT|CB","SICK|OUT|OJI"],cx=[M,M+90,M+170,M+290,M+440];
  ctx.font=FA("800 11px");ctx.fillStyle="#67727e";cols.forEach((h,i)=>ctx.fillText(h,cx[i],tblY+22));
  ctx.font=FA("600 13px");
  rows.forEach((r,i)=>{const ry=tblY+22+18+i*22;ctx.fillStyle="#1c2530";
    ctx.fillText(r.sh,cx[0],ry);ctx.fillText(""+r.n,cx[1],ry);ctx.fillText(""+r.max,cx[2],ry);
    ctx.fillText(r.t.VAC+" | "+r.t.DAT+" | "+r.t.CB,cx[3],ry);ctx.fillText(r.t.SICK+" | "+r.t.OUT+" | "+r.t.OJI,cx[4],ry);});
  ctx.fillStyle="#67727e";ctx.font=FA("600 12px");ctx.fillText("MGR "+(ST.manager||"—")+"   ·   ASST "+(ST.asst.join(", ")||"—")+"   ·   SUP "+(ST.supers.join(", ")||"—"),M,mgrY+6);
  if(b.notes){ctx.fillStyle="#0b3d63";ctx.font=FA("800 12px");ctx.fillText("NOTES",M,H-M-((wrap(b.notes,W-2*M-20,FA("400 14px")).length)*18)-2);
    ctx.fillStyle="#1c2530";ctx.font=FA("400 14px");wrap(b.notes,W-2*M-20,FA("400 14px")).forEach((ln,k)=>ctx.fillText(ln,M,H-M-((wrap(b.notes,W-2*M-20,FA("400 14px")).length-1-k)*18)));}
  ctx.strokeStyle="#cfd6dd";ctx.lineWidth=2;ctx.strokeRect(1,1,W-2,H-2);
  return c;
}
function exportBriefImage(){ const c=autoCropCanvas(renderBriefCanvas()); c.toBlob(b=>{ if(!b)return alert("Image export failed."); const name="Daily-Briefing-"+ST.shift+".jpg"; if(window.showImagePreview)window.showImagePreview(b,name); },"image/jpeg",0.92); }
async function shareSheets(){
  try{
    const [s,br]=await Promise.all([canvasToPng(renderStaffCanvas()),canvasToPng(renderBriefCanvas())]);
    const files=[new File([s],"EWR-AMT-Staffing-"+ST.shift+".png",{type:"image/png"}), new File([br],"Daily-Briefing-"+ST.shift+".png",{type:"image/png"})];
    if(navigator.canShare&&navigator.canShare({files})){ await navigator.share({files,title:"EWR Move Team — "+ST.shift,text:"Staffing + Daily Briefing ("+ST.shift+")"}); return; }
    // fallback: download both
    files.forEach(f=>{const u=URL.createObjectURL(f),a=document.createElement("a");a.href=u;a.download=f.name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(u);});
    alert("Sharing isn't supported here — both files were downloaded instead.");
  }catch(err){ if(String(err).indexOf("AbortError")<0)alert("Share failed: "+(err.message||err)); }
}
function exportSheetText(){
  const a=ST.assign,L=[];
  L.push("EWR AMT STAFFING — "+ST.shift);L.push("=".repeat(30));
  L.push("DISPATCHER: "+(ST.dispatch&&ST.dispatch.name?ST.dispatch.name:"OPEN"));
  if(ST.supers.length)L.push("SUPERVISORS: "+ST.supers.join(", "));
  const mgr=[ST.manager,...ST.asst].filter(Boolean);if(mgr.length)L.push("MANAGERS: "+mgr.join(", "));
  L.push("");L.push("AREAS:");
  AREAS.forEach(ar=>{const list=a.areas[ar.key]||[];if(list.length||ar.min)L.push("  "+ar.key+(ar.min?" ("+list.length+"/"+ar.min[ST.shift]+")":"")+": "+(list.map(p=>p.name).join(", ")||"—"));});
  L.push("");L.push("TUGS:");
  TUG_GROUPS.forEach(g=>{const ids=g.ids.filter(id=>{const t=tugState(id);return t.running||t.oos;});if(!ids.length)return;
    L.push(" ["+g.label+"]");ids.forEach(id=>{const t=tugState(id),ty=tugType(id)?" "+tugType(id):"";if(t.oos){L.push("  STUG "+id+ty+": OUT OF SERVICE");return;}
    const cr=a.tugs[id]||{},gp=t.gpu==='inop'?" [GP INOP]":"";
    L.push("  STUG "+id+(ELECTRIC.has(id)?" (E)":"")+ty+gp+": DRIVER "+(cr.DRIVER?cr.DRIVER.name+" "+cr.DRIVER.start+"-"+cr.DRIVER.end:"—")+" / OBSERVR "+(cr.OBSERVR?cr.OBSERVR.name+" "+cr.OBSERVR.start+"-"+cr.OBSERVR.end:"—"));});});
  const ab=absentFor(ST.shift);
  if(ab.length){L.push("");L.push("NOT HERE:");ab.forEach(x=>L.push("  "+x.name+" — "+x.code));}
  const blob=new Blob([L.join("\n")],{type:"text/plain"}),u=URL.createObjectURL(blob),el=document.createElement("a");
  el.href=u;el.download="EWR-AMT-Staffing-"+ST.shift+".txt";document.body.appendChild(el);el.click();el.remove();URL.revokeObjectURL(u);
}

/* ---- manpower log (history) ---- */
function loadLog(){const d=Store.getJSON("elt.staff.log",[]);return Array.isArray(d)?d:[];}
function saveLogList(l){return Store.setJSON("elt.staff.log",l);}
function logManpower(){
  const date=ST.parsed?ST.parsed.date:"",shift=ST.shift,a=ST.assign;
  const running=TUGS.filter(id=>tugState(id).running).length, pool=poolFor(shift).length;
  const areasFilled=AREAS.reduce((s,ar)=>s+((a.areas[ar.key]||[]).length),0);
  const crews=TUGS.filter(id=>tugState(id).running&&(a.tugs[id]&&(a.tugs[id].DRIVER||a.tugs[id].OBSERVR))).length;
  let img="";try{const src=renderStaffCanvas();const w=1000,h=Math.round(src.height/src.width*w);
    const c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(src,0,0,w,h);
    img=c.toDataURL("image/jpeg",0.85);}catch(_){}
  const entry={id:date+"|"+shift,date,shift,pool,running,crews,areasFilled,dispatch:ST.dispatch?ST.dispatch.name:"",by:AUTH?AUTH.name:"",img,snap:snapshot()};
  let l=loadLog().filter(e=>e.id!==entry.id);l.unshift(entry);l=l.slice(0,24);
  if(!saveLogList(l)){ l=l.map((e,i)=>i===0?e:{...e,snap:null}); if(!saveLogList(l)){ l=l.map((e,i)=>i===0?e:{...e,img:""}); l=l.slice(0,12); saveLogList(l); } }
  deleteDraft("D|"+date+"|"+shift);   // finalized — drop the draft
  toast("Logged: "+date+" "+shift);
  logSel=entry.id; ST.step="logs"; render();   // jump to the saved record (image/PDF/share live here)
}
let logSel=null;
function rLogs(){
  const list=loadLog();
  if(logSel){const e=list.find(x=>x.id===logSel);
    if(!e){logSel=null;return rLogs();}
    ROOT.innerHTML=card(`<div class="pool-head"><h2 class="staff-h" style="margin:0">${esc(e.shift)} manpower <span class="ro-badge">read-only</span></h2></div>
      <div class="muted-row">${esc(e.date||'')} · ${e.pool} in pool · ${e.crews||0} tug crews of ${e.running} running · dispatch ${esc(e.dispatch||"OPEN")}${e.by?` · by <b>${esc(e.by)}</b>`:''}</div>
      ${e.img?`<div class="sheet-scroll"><img class="log-img" src="${e.img}" alt="staffing sheet"/></div>`:'<p class="hint">Image not stored for this entry.</p>'}
      ${e.snap?`<div class="btnrow" style="margin-top:10px"><button class="btn good" id="logEdit">✎ Reopen &amp; edit</button></div>
      <div class="btnrow" style="margin-top:8px"><button class="btn navy" id="logShare">Email / Share both ›</button></div>
      <div class="btnrow" style="margin-top:8px"><button class="btn ghost" id="logImg">Save image</button><button class="btn ghost" id="logPdf">PDF / Print</button></div>
      <div class="btnrow" style="margin-top:8px"><button class="btn ghost" id="logTxt">Text</button></div>`:'<p class="hint">This entry has no saved board, so it can\'t be reopened.</p>'}
      <div class="btnrow" style="margin-top:8px"><button class="btn ghost" id="logBack">‹ Back to past</button><button class="btn ghost" id="logDel">Delete</button></div>`);
    $("#logBack").onclick=()=>{logSel=null;render();};
    $("#logDel").onclick=()=>{saveLogList(loadLog().filter(x=>x.id!==logSel));logSel=null;render();};
    $("#logEdit")?.addEventListener("click",()=>{ applySnapshot(e.snap); ST._tugSeeded=true; logSel=null; ST.step="assign"; render(); }); // reopen the saved board to edit (re-log to overwrite)
    $("#logImg")?.addEventListener("click",()=>withSnapshot(e.snap,()=>exportSheetImage()));
    $("#logTxt")?.addEventListener("click",()=>withSnapshot(e.snap,()=>exportSheetText()));
    $("#logShare")?.addEventListener("click",()=>withSnapshot(e.snap,()=>shareSheets()));
    $("#logPdf")?.addEventListener("click",()=>withSnapshot(e.snap,()=>{ $("#printArea").innerHTML=`<div class="sb-print">${buildSheet()}</div><div class="sb-print" style="page-break-before:always">${buildBriefing()}</div>`; window.print(); }));
    return;
  }
  const byDate={};list.forEach(e=>{(byDate[e.date]=byDate[e.date]||[]).push(e);});
  const ord={AM:0,PM:1,NH:2};
  const dates=Object.keys(byDate).sort((a,b)=>{const da=new Date(a),db=new Date(b);return (isNaN(db)?0:db)-(isNaN(da)?0:da);});
  ROOT.innerHTML=card(`<div class="pool-head"><h2 class="staff-h" style="margin:0">Past manpowers</h2><span class="cnt">${list.length}</span></div>
    <p class="hint" style="margin:0 0 8px">Read-only — tap a shift to view its sheet, image &amp; PDF.</p>
    ${list.length?dates.map(d=>`<div class="log-day"><div class="log-date">${esc(d)}</div>
      <div class="log-shifts">${["AM","PM","NH"].map(sh=>{const e=byDate[d].find(x=>x.shift===sh);
        return e?`<button class="log-row shift-${sh}" data-id="${esc(e.id)}"><b>${sh}</b><span>${e.pool} pool · ${e.crews||0}/${e.running} tugs${e.by?' · '+esc(e.by):''}</span></button>`
          :`<div class="log-row empty"><b>${sh}</b><span>not logged</span></div>`;}).join("")}</div>
    </div>`).join(""):'<p class="hint">Nothing logged yet. Generate a board and tap “Log this manpower”.</p>'}
    <div class="btnrow" style="margin-top:12px"><button class="btn ghost stp-back" data-to="menu">‹ Back</button></div>`);
  $$('#staffRoot .log-row[data-id]').forEach(b=>b.onclick=()=>{logSel=b.dataset.id;render();});
  $$('#staffRoot .stp-back').forEach(b=>b.onclick=()=>{ST.step=b.dataset.to;render();});
}

/* ---- standalone Briefing & Focus tab (home) ---- */
let briefTabView="edit";
async function shareBriefOnly(){
  try{ const blob=await canvasToPng(renderBriefCanvas());
    const files=[new File([blob],"Daily-Briefing-"+ST.shift+".png",{type:"image/png"})];
    if(navigator.canShare&&navigator.canShare({files})){ await navigator.share({files,title:"Daily Move Team Briefing",text:"Daily Move Team Shift Briefing"}); return; }
    const u=URL.createObjectURL(files[0]),a=document.createElement("a");a.href=u;a.download=files[0].name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(u);
  }catch(err){ if(String(err).indexOf("AbortError")<0)alert("Share failed: "+(err.message||err)); }
}
function renderBriefTab(){
  const root=document.getElementById("briefRoot"); if(!root) return;
  initBrief();
  if(briefTabView==="sheet"){
    root.innerHTML=`<div class="card pad no-print"><div class="pool-head"><h2 class="staff-h" style="margin:0">Daily Briefing</h2></div></div>
      <div class="sheet-scroll"><div id="staffSheet">${buildBriefing()}</div></div>
      <div class="card pad no-print">
        <div class="btnrow"><button class="btn navy" id="btShare">Share / Email ›</button></div>
        <div class="btnrow" style="margin-top:8px"><button class="btn ghost" id="btImg">Save image</button><button class="btn ghost" id="btPrint">Print / PDF</button></div>
        <div class="btnrow" style="margin-top:8px"><button class="btn ghost" id="btEdit">‹ Edit briefing</button></div>
      </div>`;
    root.querySelector("#btEdit").onclick=()=>{briefTabView="edit";renderBriefTab();};
    root.querySelector("#btImg").onclick=()=>exportBriefImage();
    root.querySelector("#btPrint").onclick=()=>{ document.getElementById("printArea").innerHTML=`<div class="sb-print">${buildBriefing()}</div>`; window.print(); };
    root.querySelector("#btShare").onclick=shareBriefOnly;
    return;
  }
  const b=ST.brief;
  const fa=(id,label,val,ph,rows)=>`<label class="fld-l">${label}</label><textarea id="${id}" class="bf-in" rows="${rows||2}" placeholder="${esc(ph||'')}">${esc(val)}</textarea>`;
  root.innerHTML=card(`<h2 class="staff-h">Briefing &amp; focus items</h2>
    <p class="hint" style="margin:0 0 6px">Prep tonight's briefing. Staffing counts &amp; tug status fill in from the active manpower if one's loaded.</p>
    ${fa("tbWeather","Weather",b.weather,"Tonight's forecast…")}
    ${fa("tbFlight","Flight activity / ATC",b.flight,"Arrivals 421 / Departures 403 | PBT 55,000")}
    ${fa("tbParking","Remote parking",b.parking,"Murphy / remote spot notes…")}
    ${fa("tbSafety","Safety tip of the day",b.safety,"")}
    ${fa("tbNotes","Notes",b.notes,"")}
    <label class="fld-l">Focus items</label>
    <div id="tbFocus" class="focus-wrap">${b.focus.map((t,i)=>`<div class="frow"><textarea rows="2" data-fi="${i}">${esc(t)}</textarea><button class="xrem" data-fdel="${i}" title="Remove">✕</button></div>`).join("")}</div>
    <button class="btn ghost" id="tbAdd" style="margin-top:8px">+ Add focus item</button>
    <div class="btnrow" style="margin-top:14px"><button class="btn navy" id="tbGen">Generate Daily Briefing ›</button></div>`);
  const g=id=>root.querySelector("#"+id);
  const save=()=>{ b.weather=g("tbWeather").value;b.flight=g("tbFlight").value;b.parking=g("tbParking").value;b.safety=g("tbSafety").value;b.notes=g("tbNotes").value;
    b.focus=[...root.querySelectorAll("#tbFocus textarea")].map(t=>t.value); };
  g("tbAdd").onclick=()=>{ save(); b.focus.push(""); renderBriefTab(); };
  root.querySelectorAll("[data-fdel]").forEach(x=>x.onclick=()=>{ save(); b.focus.splice(+x.dataset.fdel,1); renderBriefTab(); });
  g("tbGen").onclick=()=>{ save(); Store.setJSON("elt.staff.focus",b.focus.filter(s=>s.trim())); briefTabView="sheet"; renderBriefTab(); };
}

/* expose entry points */
window.STAFF={
  open:()=>{ loadBids(); if(!AUTH){ ST.step="auth"; authView="pick"; authPick=null; authErr=""; } else { ST.step="menu"; } render(); },
  roster:()=>rosterAll(),
  hasCode:n=>hasCode(n),
  resetCode:n=>{ resetCode(n); },
  removeTempSup:n=>{ saveTempSups(loadTempSups().filter(x=>x.name!==n)); if(AUTH&&AUTH.name===n)AUTH=null; },
  who:()=>AUTH?AUTH.name:""
};
window.BRIEF={ open:()=>{ loadBids(); briefTabView="edit"; renderBriefTab(); } };
})();
