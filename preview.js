/* ===== Preview: curated REVIEW-POOL & ASSIGN-BOARD designs @ phone / iPad / desktop ===== */
(function(){
"use strict";
const $=(s,el=document)=>el.querySelector(s);
const $$=(s,el=document)=>[...el.querySelectorAll(s)];
const esc=s=>(s==null?"":String(s)).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const DEV={phone:{w:390,l:"Phone"},ipad:{w:1032,l:'iPad 13"'},desktop:{w:1280,l:"Desktop"}};

/* sample data */
const POOL=[
  {n:"Marmol, Pete",h:"05:00-13:00",bid:"04:00-12:00",off:"Wed, Thu",t:["AM"]},
  {n:"Clark, Lawrence",h:"05:00-13:00",bid:"05:00-13:00",off:"Sun, Sat",t:["AM"]},
  {n:"Maria, Franklin",h:"05:00-13:00",bid:"05:00-13:00",off:"Sat, Sun",t:["AM"]},
  {n:"Day, Hakim",h:"05:00-21:00",bid:"05:00-13:00",off:"Tue, Wed",t:["DBL"]},
  {n:"Sambilay, Daniel",h:"04:00-12:00",bid:"04:00-12:00",off:"Fri, Sat",t:["Daytrade"]},
  {n:"Mbacke, Murtalla",h:"05:00-13:00",bid:"21:00-05:00",off:"Wed, Thu",t:["OT","Worked last night"]},
  {n:"Roach, Rehaem",h:"04:00-12:00",bid:"04:00-12:00",off:"Sun, Mon",t:["AM"]},
  {n:"Cutting, Lisa",h:"05:00-13:00",bid:"05:00-13:00",off:"Thu, Fri",t:["OJT"]},
];
const TUGS=[1,3,4,10,17,18,19,20,21,22,23,24,25,26,27,28,29,51];
const TYPE=id=>[1,3,4].includes(id)?"TBL-400":id>=10&&id<=19?"TBL-280":id>=20&&id<=29?"GOLDHOFER":id===51?"Kalmar":"";
const OOS=new Set([24,27]),INOP=new Set([21]);
const CREW={1:["Marmol, Pete","Day, Hakim"],3:["Clark, Lawrence","Cutting, Lisa"],4:["Maria, Franklin",""],10:["Roach, Rehaem",""]};
const AREAS=[["Ballpark",3],["WestPark",2],["South Team",2],["Terminal B",1],["APU",1],["Support",0],["C4",0]];

let kind="pool", dev="phone", v=1;
const COUNT={pool:5, board:5};

function byHours(){const g={};POOL.forEach(p=>{(g[p.h]=g[p.h]||[]).push(p);});return Object.entries(g).sort((a,b)=>a[0].localeCompare(b[0]));}
const tag=t=>`<i class="pvtag ${/Worked/.test(t)?'pw':t==='DBL'?'db':t==='OT'?'ot':t==='Daytrade'?'dt':t==='OJT'?'oj':'sh'}">${esc(t)}</i>`;

/* ---------------- REVIEW POOL variants ---------------- */
function poolVariant(n){
  if(n===1){
    const NH=[["Bonet, C.","VAC"],["Stephens, K.","DTO"],["Dickey, T.","SICK"],["Vizcaino, A.","CB"]];
    return `<div class="rp-h">AM pool review <span>${POOL.length} working</span></div>
      <div class="rp-dual">
        <div class="rp-col"><h5>Working</h5>${POOL.map(p=>`<div class="rp-li"><b>${esc(p.n)}</b><span>${esc(p.h)}</span>${p.t.map(tag).join("")}</div>`).join("")}</div>
        <div class="rp-col not"><h5>Not here</h5>${NH.map(x=>`<div class="rp-li out"><b>${esc(x[0])}</b><span class="code">${esc(x[1])}</span></div>`).join("")}</div>
      </div>`;
  }
  if(n===2){
    return `<div class="rp-h">AM pool review <span>${POOL.length} working</span></div>
      <div class="rp-grid">${POOL.map(p=>`<div class="rp-card"><b>${esc(p.n)}</b><span class="hrs">${esc(p.h)}</span>
        <div class="rp-bid">Bid ${esc(p.bid)} · Off ${esc(p.off)}</div><div class="rp-tags">${p.t.map(tag).join("")}</div></div>`).join("")}</div>`;
  }
  if(n===3){
    return `<div class="rp-h">AM pool review <span>${POOL.length} working</span></div>
      ${byHours().map(([h,list])=>`<div class="rp-sh"><div class="rp-sh-h">${esc(h)}<span>${list.length}</span></div>
        ${list.map(p=>`<div class="rp-li"><b>${esc(p.n)}</b>${p.t.map(tag).join("")}</div>`).join("")}</div>`).join("")}`;
  }
  if(n===4){
    return `<div class="rp-h">AM pool review <span>${POOL.length} working</span></div>
      <table class="rp-tbl"><thead><tr><th>Name</th><th>Hours</th><th>Bid</th><th>Off</th><th></th></tr></thead>
      <tbody>${POOL.map(p=>`<tr><td><b>${esc(p.n)}</b></td><td>${esc(p.h)}</td><td>${esc(p.bid)}</td><td>${esc(p.off)}</td><td>${p.t.map(tag).join("")}</td></tr>`).join("")}</tbody></table>`;
  }
  return `<div class="rp-h">AM pool review <span>${POOL.length} working</span></div>
    <div class="rp-md"><div class="rp-md-list">${POOL.map((p,i)=>`<div class="rp-md-li ${i===3?'on':''}"><b>${esc(p.n)}</b><span>${esc(p.h)}</span></div>`).join("")}</div>
      <div class="rp-md-detail"><div class="md-name">Day, Hakim</div><div class="md-sub">05:00-21:00 · Double</div>
        <div class="md-row"><span>Bid hours</span><b>05:00-13:00</b></div><div class="md-row"><span>Days off</span><b>Tue, Wed</b></div>
        <div class="md-row"><span>Status</span><b>Working a double</b></div><div class="rp-tags">${["DBL"].map(tag).join("")}</div></div></div>`;
}

/* ---------------- ASSIGN BOARD variants ---------------- */
const poolDock=cls=>`<div class="${cls}">${POOL.slice(0,7).map(p=>`<button class="pp ${p.t.includes('DBL')?'db':''}">${esc(p.n.split(",")[0])}<small>${esc(p.h)}</small></button>`).join("")}</div>`;
const tcrew=id=>{const c=CREW[id]||[];return `<div class="bt-dr">DRV <b>${esc((c[0]||"—").split(",")[0])}</b></div><div class="bt-dr">OBS <b>${esc((c[1]||"").split(",")[0]||"—")}</b></div>`;};
const tugMini=id=>`<div class="bt ${OOS.has(id)?'oos':''} ${INOP.has(id)?'inop':''}"><div class="bt-h">STUG ${id}<u>${TYPE(id)}</u></div>${OOS.has(id)?'<div class="bt-oos">Out of Service</div>':tcrew(id)}</div>`;
const areaMini=([k,m])=>`<div class="ba"><div class="ba-h">${esc(k)}${m?`<span>0/${m}</span>`:''}</div><div class="ba-b">tap to add</div></div>`;

function boardVariant(n){
  const tugs=TUGS.filter(id=>id!==51).slice(0,9);
  if(n===1){
    return `<div class="bd1"><div class="bd1-pool"><h5>Staff · 7 left</h5>${poolDock("bd1-dock")}</div>
      <div class="bd1-board"><div class="bd-sec">DISPATCH</div><div class="ba disp"><div class="ba-h">Dispatcher</div><div class="ba-b">Castro, Alex</div></div>
        <div class="bd-sec">TUGS</div><div class="bt-grid">${tugs.map(tugMini).join("")}</div>
        <div class="bd-sec">AREAS</div><div class="ba-grid">${AREAS.map(areaMini).join("")}</div></div></div>`;
  }
  if(n===2){
    return `<div class="bd2"><div class="bd2-staff">${poolDock("bd1-dock")}</div>
      <div class="bd2-tabs"><span class="on">Tugs</span><span>Areas</span><span>Dispatch</span></div>
      <div class="bt-grid">${tugs.map(tugMini).join("")}</div></div>`;
  }
  if(n===3){
    return `<div class="bd3"><div class="bd3-scroll"><div class="bd-sec">DISPATCH</div><div class="ba disp"><div class="ba-h">Dispatcher</div><div class="ba-b">Castro, Alex</div></div>
      <div class="bd-sec">TUGS</div><div class="bt-grid">${tugs.map(tugMini).join("")}</div>
      <div class="bd-sec">AREAS</div><div class="ba-grid">${AREAS.map(areaMini).join("")}</div></div>
      <div class="bd3-dock"><div class="bd3-dock-h">Tap a name → tap a slot</div>${poolDock("bd1-dock")}</div></div>`;
  }
  if(n===4){
    return `<div class="bd4"><div class="bd4-staff">${poolDock("bd1-dock")}</div>
      <div class="bd4-acc open"><div class="acc-h">DISPATCH <i>Castro, Alex</i><b>▾</b></div><div class="acc-b"><div class="ba disp"><div class="ba-h">Dispatcher</div><div class="ba-b">Castro, Alex</div></div></div></div>
      <div class="bd4-acc open"><div class="acc-h">TUGS <i>7 running</i><b>▾</b></div><div class="acc-b"><div class="bt-grid">${tugs.slice(0,6).map(tugMini).join("")}</div></div></div>
      <div class="bd4-acc"><div class="acc-h">AREAS <i>0/9 filled</i><b>▸</b></div></div></div>`;
  }
  return `<div class="bd5"><div class="bd5-rail"><h5>Staff</h5>${POOL.slice(0,7).map(p=>`<button class="pp v">${esc(p.n.split(",")[0])}<small>${esc(p.h)}</small></button>`).join("")}</div>
    <div class="bd5-grid"><div class="ba disp"><div class="ba-h">Dispatch</div><div class="ba-b">Castro, Alex</div></div>
      ${tugs.map(tugMini).join("")}${AREAS.map(areaMini).join("")}</div></div>`;
}

/* ---------------- shell ---------------- */
function render(){
  const root=$("#previewRoot");if(!root)return;
  const max=COUNT[kind]; if(v>max)v=1;
  const kindBtns=`<div class="pv-kind">
    <button class="pv-seg ${kind==='pool'?'on':''}" data-kind="pool">Review pool</button>
    <button class="pv-seg ${kind==='board'?'on':''}" data-kind="board">Assign board</button></div>`;
  const devBtns=Object.entries(DEV).map(([k,d])=>`<button class="pv-seg ${dev===k?"on":""}" data-dev="${k}">${d.l}</button>`).join("");
  const vBtns=Array.from({length:max},(_,i)=>`<button class="pv-vnum ${v===i+1?"on":""}" data-v="${i+1}">${i+1}</button>`).join("");
  const body=kind==="pool"?poolVariant(v):boardVariant(v);
  const note=kind==="board"?'<p class="pv-note">Each layout keeps the staff list within reach so you’re not scrolling up to grab a name and back down to Ballpark.</p>':'<p class="pv-note">Dual-list and grid takes on the shift-pool review.</p>';
  root.innerHTML=`<div class="card pad pv-ctrl">
      <h2 class="staff-h" style="margin:0 0 8px">Screen designs</h2>
      ${kindBtns}
      <div class="pv-row"><span class="pv-lbl">Device</span><div class="pv-segs">${devBtns}</div></div>
      <div class="pv-row"><span class="pv-lbl">Variant</span><div class="pv-segs">${vBtns}</div></div>
      ${note}
    </div>
    <div class="pv-stage"><div class="pv-dev pv-${dev}"><div class="pv-frame" style="width:${DEV[dev].w}px"><div class="pv-screen pv-k-${kind}">${body}</div></div><div class="pv-cap">${DEV[dev].l} · ${DEV[dev].w}px — variant ${v}</div></div></div>`;
  $$('#previewRoot .pv-seg[data-dev]').forEach(b=>b.onclick=()=>{dev=b.dataset.dev;render();});
  $$('#previewRoot .pv-seg[data-kind]').forEach(b=>b.onclick=()=>{kind=b.dataset.kind;v=1;render();});
  $$('#previewRoot .pv-vnum').forEach(b=>b.onclick=()=>{v=+b.dataset.v;render();});
}
/* =========================================================================
   PREVIEW 2 — 5 concepts for the ASSIGN-BOARD tug card, colored by status
   (green = ready + good GPU, yellow = GPU inop but ready, red = out of service)
   ========================================================================= */
let dev2="phone", v2=1;
const CT=[
  {id:1, type:"TBL-400",  st:"ready", dr:"Scott, J.",  ob:"Pete, M.",      h:"05:00-13:00"},
  {id:17,type:"TBL-280",  st:"ready", dr:"Kull, Fred", ob:"Marmol, Pete",  h:"05:00-13:00"},
  {id:20,type:"GOLDHOFER",elec:true, st:"inop",  dr:"Torres, Lenny", ob:"Walsh, Kenny", h:"05:00-13:00"},
  {id:24,type:"GOLDHOFER",st:"oos"},
  {id:10,type:"TBL-280",  st:"ready", dr:"Matthews, S.",ob:"Mbacke, M.",   h:"05:00-13:00"},
  {id:21,type:"GOLDHOFER",st:"inop",  dr:"Williams, T.",ob:"—",            h:"05:00-13:00"},
];
const STLBL={ready:"Good GPU",inop:"GPU Inop · still ready",oos:"Out of Service"};
function concept(n){
  const t=CT;
  // 1 — colored header bar
  if(n===1) return `<div class="c-grid">${t.map(x=>`<div class="c1 ${x.st}"><div class="c1-h">STUG ${x.id}${x.elec?' ⚡':''}<u>${x.type}</u><b>${x.st==='ready'?'✓ Good GPU':x.st==='inop'?'GPU Inop':'OOS'}</b></div>
    ${x.st==='oos'?'<div class="c-oos">Out of Service</div>':`<div class="c-r"><i>DRV</i>${x.dr} <s>${x.h}</s></div><div class="c-r"><i>OBS</i>${x.ob} <s>${x.h}</s></div>`}</div>`).join("")}</div>`;
  // 2 — left status stripe
  if(n===2) return `<div class="c-grid">${t.map(x=>`<div class="c2 ${x.st}"><div class="c2-h">STUG ${x.id}${x.elec?' ⚡':''} <u>${x.type}</u><span class="c2-dot"></span></div>
    ${x.st==='oos'?'<div class="c-oos">Out of Service</div>':`<div class="c-r"><i>DRV</i>${x.dr}</div><div class="c-r"><i>OBS</i>${x.ob}</div><div class="c2-gpu">${STLBL[x.st]}</div>`}</div>`).join("")}</div>`;
  // 3 — status number tile + crew
  if(n===3) return `<div class="c-grid">${t.map(x=>`<div class="c3 ${x.st}"><div class="c3-tile"><b>${x.id}</b><small>${x.elec?'⚡ ':''}${x.type}</small></div>
    <div class="c3-b">${x.st==='oos'?'<div class="c-oos">Out of Service</div>':`<div class="c-r"><i>DRV</i>${x.dr}</div><div class="c-r"><i>OBS</i>${x.ob}</div><div class="c3-gpu">${STLBL[x.st]}</div>`}</div></div>`).join("")}</div>`;
  // 4 — full soft tint
  if(n===4) return `<div class="c-grid">${t.map(x=>`<div class="c4 ${x.st}"><div class="c4-h"><span class="c4-n">${x.id}</span><span class="c4-ty">${x.elec?'⚡ ':''}${x.type}</span><span class="c4-pill">${x.st==='ready'?'GPU ✓':x.st==='inop'?'GPU ✕':'OOS'}</span></div>
    ${x.st==='oos'?'<div class="c-oos">Out of Service</div>':`<div class="c-r"><i>DRV</i>${x.dr} <s>${x.h}</s></div><div class="c-r"><i>OBS</i>${x.ob} <s>${x.h}</s></div>`}</div>`).join("")}</div>`;
  // 5 — top accent + gpu pill
  return `<div class="c-grid">${t.map(x=>`<div class="c5 ${x.st}"><div class="c5-top"></div><div class="c5-h">STUG ${x.id}${x.elec?' ⚡':''}<u>${x.type}</u></div>
    ${x.st==='oos'?'<div class="c-oos">Out of Service</div>':`<div class="c-r"><i>DRV</i>${x.dr}</div><div class="c-r"><i>OBS</i>${x.ob}</div><div class="c5-pill ${x.st}">${STLBL[x.st]}</div>`}</div>`).join("")}</div>`;
}
function render2(){
  const root=$("#preview2Root");if(!root)return;
  if(v2>5)v2=1;
  const devBtns=Object.entries(DEV).map(([k,d])=>`<button class="pv-seg ${dev2===k?"on":""}" data-dev="${k}">${d.l}</button>`).join("");
  const vBtns=Array.from({length:5},(_,i)=>`<button class="pv-vnum ${v2===i+1?"on":""}" data-v="${i+1}">${i+1}</button>`).join("");
  root.innerHTML=`<div class="card pad pv-ctrl">
      <h2 class="staff-h" style="margin:0 0 8px">Tug-card concepts</h2>
      <p class="pv-note" style="margin:0 0 6px">Assign-board tug cards colored by status — <b class="rk g">green</b> ready/good GPU, <b class="rk y">yellow</b> GPU inop, <b class="rk r">red</b> out of service. Pick one and I'll make it the real board.</p>
      <div class="pv-row"><span class="pv-lbl">Device</span><div class="pv-segs">${devBtns}</div></div>
      <div class="pv-row"><span class="pv-lbl">Concept</span><div class="pv-segs">${vBtns}</div></div>
    </div>
    <div class="pv-stage"><div class="pv-dev pv-${dev2}"><div class="pv-frame" style="width:${DEV[dev2].w}px"><div class="pv-screen pv-c2">${concept(v2)}</div></div><div class="pv-cap">${DEV[dev2].l} · ${DEV[dev2].w}px — concept ${v2}</div></div></div>`;
  $$('#preview2Root .pv-seg[data-dev]').forEach(b=>b.onclick=()=>{dev2=b.dataset.dev;render2();});
  $$('#preview2Root .pv-vnum').forEach(b=>b.onclick=()=>{v2=+b.dataset.v;render2();});
}
window.PREVIEW={ open:()=>{ v=1; render(); }, open2:()=>{ v2=1; render2(); } };
})();
