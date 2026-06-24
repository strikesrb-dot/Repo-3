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
const ELECTRIC=new Set([20,25,26,28,29]);
const AREAS=[ // min staffing per shift; null = supervisor discretion
  {key:"Ballpark",  min:{AM:3,PM:3,NH:3}},
  {key:"WestPark",  min:{AM:2,PM:2,NH:2}},
  {key:"South Team",min:{AM:2,PM:2,NH:2}},
  {key:"Terminal B",min:{AM:1,PM:2,NH:1}},
  {key:"APU",       min:{AM:1,PM:1,NH:1}},
  {key:"Support",   min:null},
  {key:"C4",        min:null},
];
const SUPERVISORS=["Sheldon","Paulia","Qua","Mark","Stephanie","Denroy","Earl","John"];
const MANAGERS=["Steve"];
const ASSTMGRS=["Jay","Tito"];
const EXCLUDE_DEFAULT=["Bonet, Christopher","Vizcaino, Angel","Dickey, Todd","Mendes","Stephens, Kevin"];
const OUT_CODES=new Set(["VC","OUT","DTO","HOLT","DATV","DO","SICK","SICK ","CB","SKU","SKUS","Partial DTO","Shift Trade","HOLF","HOLM","JD","MD","DATC","DAT3","C4D","HODV"]);
const WORKED_CODES=new Set(["DTW","HWP","HWFT"]);

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
  step:"upload",
  files:{mp:null,ot:null,co:null},
  parsed:null,           // {mpRecs, otRecs, coRows, date}
  shift:"AM",
  numTugs:8,
  prompts:{},            // name -> bool (trainees + exclusions availability)
  supers:[], manager:MANAGERS[0]||"", asst:[],
  oos:{},                // tugId -> true
  bodies:null,           // built pool bodies (all shifts)
  assign:null,           // {dispatch, tugs:{id:{DRIVER,OBSERVR}}, areas:{key:[...]}}
};
function excludeList(){ try{ const d=JSON.parse(localStorage.getItem("elt.staff.exclude")||"null"); return Array.isArray(d)?d:EXCLUDE_DEFAULT.slice(); }catch(_){ return EXCLUDE_DEFAULT.slice(); } }

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

/* per-shift pool (deduped by emp within shift) */
function poolFor(shift){
  const out=[],seen=new Set();
  for(const b of ST.bodies){
    const sh=shiftsFor(b).find(x=>x.sh===shift);
    if(!sh)continue;
    if(b.emp&&seen.has(b.emp))continue; if(b.emp)seen.add(b.emp);
    out.push({...b,prim:sh.prim,ov:sh.ov});
  }
  // primary first, then by name
  out.sort((a,b)=>(a.prim===b.prim?normName(a.name).localeCompare(normName(b.name)):a.prim?-1:1));
  return out;
}
/* dispatch candidate for the shift from the DISPATCH section */
function dispatchCandidates(shift){
  const {mpRecs}=ST.parsed;
  return mpRecs.filter(r=>r.sec==="DISPATCH"&&r.start).map(r=>({...r,avail:!r.code||WORKED_CODES.has(r.code),sh:primaryShift(r.start)}))
    .filter(d=>d.sh===shift);
}

/* =====================  RENDER  ===================== */
let ROOT=null;
function render(){
  ROOT=$("#staffRoot");if(!ROOT)return;
  ({upload:rUpload,setup:rSetup,pool:rPool,assign:rAssign,sheet:rSheet}[ST.step]||rUpload)();
}
function card(inner){return `<div class="card pad">${inner}</div>`;}
function back(toStep,label){return `<button class="btn ghost stp-back" data-to="${toStep}" style="margin-top:10px">‹ ${label}</button>`;}

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
    <div class="btnrow" style="margin-top:6px"><button class="btn navy" id="upBuild" ${f.mp?"":"disabled"}>Read files &amp; build pool ›</button></div>`);
  $$('#staffRoot input[type=file]').forEach(inp=>inp.addEventListener("change",e=>{
    const k=inp.dataset.k,file=inp.files[0];if(!file)return;ST.files[k]=file;render();}));
  $("#upBuild")?.addEventListener("click",doBuild);
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
    <label class="fld-l">Supervisor(s) on shift</label><div class="chips">${chip(SUPERVISORS,ST.supers,'data-sup')}</div>
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
  $("#toPool").onclick=()=>{ ST.bodies=buildBodies(); ST.step="pool"; render(); };
  $$('#staffRoot .stp-back').forEach(b=>b.onclick=()=>{ST.step=b.dataset.to;render();});
}

/* ---- step: pool review ---- */
function rPool(){
  const pool=poolFor(ST.shift);
  const disp=dispatchCandidates(ST.shift);
  const dispLine=disp.length?disp.map(d=>`${esc(d.name)}${d.avail?'':' <span class="bad">('+esc(d.code)+')</span>'}`).join(" · "):'<span class="bad">none on shift</span>';
  const rows=pool.map(b=>`<div class="prow"><div><b>${esc(b.name)}</b> <span class="hint">${esc(b.start)}-${esc(b.end)}</span>
      ${b.src==='OT'?'<span class="tag ot">OT</span>':''}${b.src==='cover'?'<span class="tag cv">cover</span>':''}${b.src==='train'?'<span class="tag tr">OJT</span>':''}${!b.prim?`<span class="tag ov">+${(b.ov/60).toFixed(1).replace('.0','')}h</span>`:''}</div>
      <button class="xrem" data-emp="${esc(b.emp)}" data-name="${esc(b.name)}" title="Remove">✕</button></div>`).join("");
  ROOT.innerHTML=card(`
    <div class="pool-head"><h2 class="staff-h" style="margin:0">${ST.shift} pool</h2><span class="cnt">${pool.length}</span></div>
    <div class="muted-row">Dispatcher candidate: ${dispLine}</div>
    <div class="prow-wrap">${rows||'<p class="hint">No one in this shift.</p>'}</div>
    <div class="btnrow" style="margin-top:12px"><button class="btn navy" id="toAssign">Assign the board ›</button></div>
    ${back("setup","Setup")}`);
  $$('#staffRoot .xrem').forEach(b=>b.onclick=()=>{ const emp=b.dataset.emp,nm=b.dataset.name;
    ST.bodies=ST.bodies.filter(x=>!(x.emp===emp&&x.name===nm)); render(); });
  $("#toAssign").onclick=()=>{ initAssign(); ST.step="assign"; render(); };
  $$('#staffRoot .stp-back').forEach(b=>b.onclick=()=>{ST.step=b.dataset.to;render();});
}

/* ---- step: assign ---- */
let SEL=null; // selected pool entry key
function initAssign(){
  const disp=dispatchCandidates(ST.shift).find(d=>d.avail);
  ST.assign={ dispatch:disp?{name:disp.name,emp:disp.emp}:null, tugs:{}, areas:{} };
  AREAS.forEach(a=>ST.assign.areas[a.key]=[]);
  ST.oos={};
  TUGS.slice(ST.numTugs).forEach(id=>ST.oos[id]=true); // beyond target = OOS (adjustable)
}
function assignedEmps(){
  const s=new Set();const a=ST.assign;
  if(a.dispatch&&a.dispatch.emp)s.add(a.dispatch.emp);
  Object.values(a.tugs).forEach(t=>["DRIVER","OBSERVR"].forEach(r=>t[r]&&s.add(t[r].emp)));
  Object.values(a.areas).forEach(list=>list.forEach(p=>s.add(p.emp)));
  return s;
}
function rAssign(){
  const pool=poolFor(ST.shift);
  const used=assignedEmps();
  const avail=pool.filter(b=>!used.has(b.emp));
  const chip=b=>`<button class="abody ${SEL===b.emp?'sel':''}" data-emp="${esc(b.emp)}">${esc(b.name)}<span>${esc(b.start)}-${esc(b.end)}${b.prim?'':' +'+(b.ov/60).toFixed(1).replace('.0','')+'h'}</span></button>`;
  const slotName=p=>p?`<span class="slot-name">${esc(p.name)}</span>`:`<span class="slot-empty">tap to fill</span>`;
  // dispatch
  const dispSlot=`<div class="slot disp ${ST.assign.dispatch?'full':''}" data-slot="disp">DISPATCH ${slotName(ST.assign.dispatch)}</div>`;
  // areas
  const areaCards=AREAS.map(a=>{
    const list=ST.assign.areas[a.key],min=a.min?a.min[ST.shift]:0;
    const need=min&&list.length<min;
    return `<div class="acard ${need?'need':''}"><div class="ahdr">${esc(a.key)} ${min?`<span class="amin ${need?'bad':''}">${list.length}/${min}</span>`:'<span class="amin disc">disc</span>'}</div>
      <div class="aslots">${list.map((p,i)=>`<span class="slot-chip" data-area="${esc(a.key)}" data-i="${i}">${esc(p.name)} ✕</span>`).join("")}
        <button class="aadd" data-areaadd="${esc(a.key)}">+ add</button></div></div>`;
  }).join("");
  // tugs
  const tugCards=TUGS.map(id=>{
    const oos=ST.oos[id],t=ST.assign.tugs[id]||{};
    return `<div class="tcard ${oos?'oos':''}">
      <div class="thdr"><span>STUG ${id}${ELECTRIC.has(id)?'<i>E</i>':''}</span>
        <button class="toos" data-oos="${id}">${oos?'OOS':'on'}</button></div>
      ${oos?`<div class="oosbar">OUT OF SERVICE</div>`:
        `<div class="trow ${t.DRIVER?'full':''}" data-tug="${id}" data-role="DRIVER"><i>DRIVER</i>${slotName(t.DRIVER)}</div>
         <div class="trow ${t.OBSERVR?'full':''}" data-tug="${id}" data-role="OBSERVR"><i>OBSERVR</i>${slotName(t.OBSERVR)}</div>`}
    </div>`;
  }).join("");
  ROOT.innerHTML=`
    <div class="card pad assign-top">
      <div class="pool-head"><h2 class="staff-h" style="margin:0">Assign ${ST.shift}</h2><span class="cnt">${avail.length} left</span></div>
      <p class="hint" style="margin:2px 0 8px">Tap a name, then tap a slot. Priority: Dispatch → Tugs → areas.</p>
      <div class="abody-wrap">${avail.map(chip).join("")||'<span class="hint">All assigned.</span>'}</div>
    </div>
    <div class="card pad"><div class="seg-section">DISPATCH</div>${dispSlot}</div>
    <div class="card pad"><div class="seg-section">TUGS (${TUGS.length-Object.values(ST.oos).filter(Boolean).length} running)</div><div class="tug-grid">${tugCards}</div></div>
    <div class="card pad"><div class="seg-section">AREAS</div><div class="area-grid">${areaCards}</div></div>
    <div class="btnrow"><button class="btn navy" id="toSheet">Generate staffing sheet ›</button></div>
    ${back("pool","Pool")}`;
  $$('#staffRoot .abody').forEach(b=>b.onclick=()=>{ SEL=(SEL===b.dataset.emp?null:b.dataset.emp); render(); });
  const place=(setter)=>{ if(!SEL)return; const b=poolFor(ST.shift).find(x=>x.emp===SEL); if(!b)return; setter({name:b.name,emp:b.emp,start:b.start,end:b.end}); SEL=null; render(); };
  $('#staffRoot .slot.disp')?.addEventListener("click",()=>{ if(ST.assign.dispatch){ST.assign.dispatch=null;render();return;} place(p=>ST.assign.dispatch=p); });
  $$('#staffRoot .trow').forEach(s=>s.onclick=()=>{ const id=s.dataset.tug,role=s.dataset.role,t=ST.assign.tugs[id]=ST.assign.tugs[id]||{};
    if(t[role]){t[role]=null;render();return;} place(p=>{ST.assign.tugs[id]=ST.assign.tugs[id]||{};ST.assign.tugs[id][role]=p;}); });
  $$('#staffRoot .toos').forEach(b=>b.onclick=()=>{ const id=b.dataset.oos; ST.oos[id]=!ST.oos[id]; if(ST.oos[id])delete ST.assign.tugs[id]; render(); });
  $$('#staffRoot .aadd').forEach(b=>b.onclick=()=>{ const k=b.dataset.areaadd; place(p=>ST.assign.areas[k].push(p)); });
  $$('#staffRoot .slot-chip').forEach(c=>c.onclick=()=>{ const k=c.dataset.area,i=+c.dataset.i; ST.assign.areas[k].splice(i,1); render(); });
  $("#toSheet").onclick=()=>{ST.step="sheet";render();};
  $$('#staffRoot .stp-back').forEach(b=>b.onclick=()=>{ST.step=b.dataset.to;render();});
}

/* ---- step: sheet ---- */
function rSheet(){
  ROOT.innerHTML=`<div class="sheet-scroll"><div id="staffSheet">${buildSheet()}</div></div>
    <div class="card pad no-print"><div class="btnrow"><button class="btn navy" id="shPrint">Print / Save as PDF</button></div>
    <div class="btnrow" style="margin-top:8px"><button class="btn ghost" id="shImg">Image</button><button class="btn ghost" id="shTxt">Text</button></div>
    <div class="btnrow" style="margin-top:8px"><button class="btn ghost stp-back" data-to="assign">‹ Edit board</button><button class="btn ghost" id="shNew">New sheet</button></div></div>`;
  $("#shPrint").onclick=()=>{ $("#printArea").innerHTML=`<div class="sb-print">${buildSheet()}</div>`; window.print(); };
  $("#shImg").onclick=exportSheetImage;
  $("#shTxt").onclick=exportSheetText;
  $("#shNew")?.addEventListener("click",()=>{ ST.step="upload"; ST.bodies=null; ST.assign=null; render(); });
  $$('#staffRoot .stp-back').forEach(b=>b.onclick=()=>{ST.step=b.dataset.to;render();});
}
function buildSheet(){
  const a=ST.assign;
  const nm=p=>p?esc(p.name):"";
  const areaBox=k=>{const list=a.areas[k]||[];const ad=AREAS.find(x=>x.key===k);const min=ad&&ad.min?ad.min[ST.shift]:0;
    return `<div class="sb-area"><div class="sb-area-h">${esc(k)}${min?` <span>${list.length}/${min}</span>`:''}</div>
      <div class="sb-area-b">${list.map(p=>`<div>${esc(p.name)}</div>`).join("")||'<div class="sb-empty">—</div>'}</div></div>`;};
  const tugCol=ids=>ids.map(id=>{const oos=ST.oos[id],t=a.tugs[id]||{};
    return `<div class="sb-tug ${oos?'oos':''}"><div class="sb-tug-h">STUG ${id}${ELECTRIC.has(id)?'<b>w</b>':''}${oos?'<span class="sb-oos">OUT OF SERVICE</span>':''}</div>
      ${oos?'':`<div class="sb-tug-r"><i>DRIVER</i>${nm(t.DRIVER)}</div><div class="sb-tug-r"><i>OBSERVR</i>${nm(t.OBSERVR)}</div>`}</div>`;}).join("");
  const third=Math.ceil(TUGS.length/3);
  const cols=[TUGS.slice(0,third),TUGS.slice(third,third*2),TUGS.slice(third*2)];
  return `<div class="sb">
    <div class="sb-top"><div class="sb-title">EWR AMT STAFFING</div><div class="sb-shift">SHIFT <b>${ST.shift}</b></div></div>
    <div class="sb-band">
      ${AREAS.map(x=>areaBox(x.key)).join("")}
      <div class="sb-area sb-disp"><div class="sb-area-h">DISPATCHER</div><div class="sb-area-b">${nm(a.dispatch)||'<span class="sb-oos">OPEN</span>'}</div></div>
      <div class="sb-area"><div class="sb-area-h">SUPERVISORS</div><div class="sb-area-b">${ST.supers.map(esc).map(s=>`<div>${s}</div>`).join("")||'<div class="sb-empty">—</div>'}</div></div>
      <div class="sb-area"><div class="sb-area-h">MANAGERS</div><div class="sb-area-b">${[ST.manager,...ST.asst].filter(Boolean).map(esc).map(s=>`<div>${s}</div>`).join("")||'<div class="sb-empty">—</div>'}</div></div>
    </div>
    <div class="sb-grid"><div class="sb-rail">ALWAYS FOLLOW SOP</div>
      <div class="sb-tugs">${cols.map(c=>`<div class="sb-tcol">${tugCol(c)}</div>`).join("")}</div>
      <div class="sb-rail">ALWAYS FOLLOW SOP</div></div>
  </div>`;
}

/* ---- exporters (canvas-drawn — works in Safari/WebKit) ---- */
function exportSheetImage(){
  const a=ST.assign,S=2,W=1360,M=26,gap=8,F=s=>s+" -apple-system,Arial,sans-serif";
  // area boxes
  const boxes=[];
  AREAS.forEach(x=>{const list=(a.areas[x.key]||[]);boxes.push({t:x.key,n:list.map(p=>p.name),sub:x.min?list.length+"/"+x.min[ST.shift]:"disc"});});
  boxes.push({t:"DISPATCHER",n:[a.dispatch?a.dispatch.name:"OPEN"],navy:true,open:!a.dispatch});
  boxes.push({t:"SUPERVISORS",n:ST.supers.slice()});
  boxes.push({t:"MANAGERS",n:[ST.manager,...ST.asst].filter(Boolean)});
  const cols=5,brows=Math.ceil(boxes.length/cols),bandW=W-2*M,bw=(bandW-(cols-1)*gap)/cols;
  const maxN=Math.max(2,...boxes.map(b=>b.n.length)),bh=22+maxN*16+6;
  const railW=24,tcols=3,trows=Math.ceil(TUGS.length/tcols);
  const tgW=W-2*M-2*(railW+gap),tw=(tgW-(tcols-1)*gap)/tcols,th=58;
  const titleH=44,tugTop=M+titleH+10+brows*(bh+gap)+10;
  const H=tugTop+trows*(th+gap)-gap+M;
  const c=document.createElement("canvas");c.width=W*S;c.height=H*S;const ctx=c.getContext("2d");ctx.scale(S,S);
  ctx.fillStyle="#fff";ctx.fillRect(0,0,W,H);
  const clip=(t,mw,font)=>{ctx.font=font;t=t||"";if(ctx.measureText(t).width<=mw)return t;while(t.length&&ctx.measureText(t+"…").width>mw)t=t.slice(0,-1);return t+"…";};
  // title + shift
  ctx.fillStyle="#10171f";ctx.font=F("900 30px");ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("EWR AMT STAFFING",W/2,M+titleH/2);
  ctx.font=F("800 13px");ctx.fillStyle="#5a6772";ctx.textAlign="right";ctx.fillText("SHIFT",W-M-52,M+titleH/2);
  ctx.fillStyle="#0b3d63";ctx.fillRect(W-M-46,M+titleH/2-13,46,26);ctx.fillStyle="#fff";ctx.font=F("800 14px");ctx.textAlign="center";ctx.fillText(ST.shift,W-M-23,M+titleH/2+1);
  // area band
  const bandY=M+titleH+10;
  boxes.forEach((bx,i)=>{const col=i%cols,row=Math.floor(i/cols),x=M+col*(bw+gap),by=bandY+row*(bh+gap);
    ctx.fillStyle="#fff";ctx.fillRect(x,by,bw,bh);
    ctx.fillStyle=bx.navy?"#0b3d63":"#f5a623";ctx.fillRect(x,by,bw,20);
    ctx.strokeStyle="#d7dce1";ctx.lineWidth=1;ctx.strokeRect(x+.5,by+.5,bw-1,bh-1);
    ctx.fillStyle=bx.navy?"#fff":"#3a2500";ctx.font=F("900 11px");ctx.textBaseline="middle";ctx.textAlign="left";ctx.fillText(clip(bx.t.toUpperCase(),bw-40,F("900 11px")),x+6,by+10);
    if(bx.sub){ctx.textAlign="right";ctx.fillText(bx.sub,x+bw-6,by+10);}
    ctx.font=F("600 12px");ctx.textAlign="left";
    (bx.n.length?bx.n:["—"]).forEach((nm,j)=>{ctx.fillStyle=bx.open?"#c0271e":(bx.n.length?"#1c2530":"#c2ccd4");ctx.fillText(clip(nm,bw-12,F("600 12px")),x+6,by+20+12+j*16);});
  });
  // SOP rails
  const tugGridH=trows*(th+gap)-gap;
  [M,W-M-railW].forEach(rx=>{ctx.fillStyle="#0b3d63";ctx.fillRect(rx,tugTop,railW,tugGridH);
    ctx.save();ctx.translate(rx+railW/2,tugTop+tugGridH/2);ctx.rotate(-Math.PI/2);ctx.fillStyle="#fff";ctx.font=F("900 12px");ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText("ALWAYS FOLLOW SOP",0,0);ctx.restore();});
  // tug grid
  const gx0=M+railW+gap;
  TUGS.forEach((id,i)=>{const col=i%tcols,row=Math.floor(i/tcols),x=gx0+col*(tw+gap),ty=tugTop+row*(th+gap);
    const oos=!!ST.oos[id],t=a.tugs[id]||{};
    ctx.fillStyle=oos?"#fbeceb":"#fff";ctx.fillRect(x,ty,tw,th);
    ctx.fillStyle="#eef2f5";ctx.fillRect(x,ty,tw,20);
    ctx.strokeStyle="#d7dce1";ctx.lineWidth=1;ctx.strokeRect(x+.5,ty+.5,tw-1,th-1);
    ctx.fillStyle="#0b3d63";ctx.font=F("900 11px");ctx.textBaseline="middle";ctx.textAlign="left";ctx.fillText("STUG "+id+(ELECTRIC.has(id)?" (E)":""),x+6,ty+10);
    if(oos){ctx.fillStyle="#c0271e";ctx.font=F("800 10px");ctx.textAlign="right";ctx.fillText("OUT OF SERVICE",x+tw-6,ty+10);}
    else{
      ctx.font=F("800 9px");ctx.textAlign="left";ctx.fillStyle="#90a0ad";ctx.fillText("DRIVER",x+6,ty+32);ctx.fillText("OBSERVR",x+6,ty+48);
      ctx.font=F("600 12px");ctx.fillStyle="#1c2530";
      ctx.fillText(clip((t.DRIVER&&t.DRIVER.name)||"",tw-58,F("600 12px")),x+54,ty+32);
      ctx.fillText(clip((t.OBSERVR&&t.OBSERVR.name)||"",tw-58,F("600 12px")),x+54,ty+48);
    }
  });
  ctx.strokeStyle="#cfd6dd";ctx.lineWidth=2;ctx.strokeRect(1,1,W-2,H-2);
  c.toBlob(b=>{ if(!b){alert("Image export failed — use Print / Save as PDF.");return;}
    const name="EWR-AMT-Staffing-"+ST.shift+".png";
    if(window.showImagePreview)window.showImagePreview(b,name);
    else{const u=URL.createObjectURL(b),el=document.createElement("a");el.href=u;el.download=name;document.body.appendChild(el);el.click();el.remove();URL.revokeObjectURL(u);}
  },"image/png");
}
function exportSheetText(){
  const a=ST.assign,L=[];
  L.push("EWR AMT STAFFING — "+ST.shift);
  L.push("=".repeat(30));
  L.push("DISPATCHER: "+(a.dispatch?a.dispatch.name:"OPEN"));
  if(ST.supers.length)L.push("SUPERVISORS: "+ST.supers.join(", "));
  const mgr=[ST.manager,...ST.asst].filter(Boolean);if(mgr.length)L.push("MANAGERS: "+mgr.join(", "));
  L.push("");L.push("AREAS:");
  AREAS.forEach(ar=>{const list=a.areas[ar.key]||[];if(list.length||ar.min)L.push("  "+ar.key+(ar.min?" ("+list.length+"/"+ar.min[ST.shift]+")":"")+": "+(list.map(p=>p.name).join(", ")||"—"));});
  L.push("");L.push("TUGS:");
  TUGS.forEach(id=>{ if(ST.oos[id]){L.push("  STUG "+id+": OUT OF SERVICE");return;}
    const t=a.tugs[id]||{};L.push("  STUG "+id+(ELECTRIC.has(id)?" (E)":"")+": DRIVER "+(t.DRIVER?t.DRIVER.name:"—")+" / OBSERVR "+(t.OBSERVR?t.OBSERVR.name:"—"));});
  const blob=new Blob([L.join("\n")],{type:"text/plain"}),u=URL.createObjectURL(blob),el=document.createElement("a");
  el.href=u;el.download="EWR-AMT-Staffing-"+ST.shift+".txt";document.body.appendChild(el);el.click();el.remove();URL.revokeObjectURL(u);
}

/* expose entry point */
window.STAFF={ open:()=>{ render(); } };
})();
