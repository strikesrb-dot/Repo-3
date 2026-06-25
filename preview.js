/* ===== Preview: curated design variants @ phone / iPad / desktop ===== */
(function(){
"use strict";
const $=(s,el=document)=>el.querySelector(s);
const $$=(s,el=document)=>[...el.querySelectorAll(s)];
const esc=s=>(s==null?"":String(s)).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const DEV={phone:{w:390,l:"Phone"},ipad:{w:834,l:"iPad"},desktop:{w:1180,l:"Desktop"}};
const TUGS=[1,3,4,10,17,18,19,20,21,22,23,24,25,26,27,28,29,51];
const E=new Set([20,25,26,28,29]), OOS=new Set([20,24,27]), INOP=new Set([21,23]);
const CREW={1:["Marmol Pete","Day, Hakim"],3:["Clark, Lawrence","Cutting, Lisa"],4:["Maria, Franklin",""]};
const POOL=[["Marmol Pete","05:00-13:00","AM","04:00-12:00 · Off Wed, Thu"],["Clark, Lawrence","05:00-13:00","AM","05:00-13:00 · Off Sun, Sat"],
  ["Sambilay, Daniel","13:00-05:00","Double","13:00-21:00 · Off Fri, Sat"],["Day, Hakim","05:00-21:00","Double","05:00-13:00 · Off Tue, Wed"],
  ["Mbacke, Murtalla","21:00-05:00","NH","21:00-05:00 · Off Sun, Mon"],["Maria, Franklin","05:00-13:00","AM","05:00-13:00 · Off Sat, Sun"]];

let kind="tug", dev="phone", v=1;
const COUNTS={tug:6, asg:5, pool:4};

/* ---------- tug-selection variants ---------- */
function tugVariant(n){
  const st=id=>OOS.has(id)?"oos":INOP.has(id)?"inop":"ok";
  if(n===1) return `<div class="pvg pvg1">${TUGS.map(id=>`<div class="pc1 ${st(id)}"><span>STUG ${id}${E.has(id)?" ⚡E":""}</span><b>${OOS.has(id)?"OOS":INOP.has(id)?"GP✕":"GP✓"}</b></div>`).join("")}</div>`;
  if(n===2) return `<div class="pvlist">${TUGS.map(id=>`<div class="pr2 ${st(id)}"><span class="dot"></span>STUG ${id}<i>${E.has(id)?"Electric":"Diesel"}</i><b>${OOS.has(id)?"Out of service":INOP.has(id)?"GPU inop":"Ready"}</b></div>`).join("")}</div>`;
  if(n===3) return `<div class="pvg pvg3">${TUGS.map(id=>`<div class="pc3 ${st(id)}"><div class="n">${id}</div><div class="s">${OOS.has(id)?"OOS":"STUG"}</div>${E.has(id)?'<span class="e">E</span>':""}</div>`).join("")}</div>`;
  if(n===4) return `<div class="pvg pvg4">${TUGS.map(id=>`<button class="pc4 ${st(id)}">STUG ${id}${E.has(id)?'<u>E</u>':""}<span class="bolt">${INOP.has(id)?"⚡̸":"⚡"}</span></button>`).join("")}</div>`;
  if(n===5) return `<div class="pvg pvg5">${TUGS.map(id=>`<div class="pc5 ${st(id)}"><div class="hd">STUG ${id}</div><div class="tg"><span class="${OOS.has(id)?'off':'on'}"></span>${OOS.has(id)?"OOS":"In svc"}</div><div class="gp">${INOP.has(id)?"GP inop":"GP ok"}</div></div>`).join("")}</div>`;
  return `<div class="pvg pvg6">${TUGS.map(id=>`<div class="pc6 ${st(id)}"><b>${id}</b><small>${E.has(id)?"⚡ ELEC":"STUG"}</small><em>${OOS.has(id)?"OOS":INOP.has(id)?"NO GP":"GO"}</em></div>`).join("")}</div>`;
}
/* ---------- assignment variants ---------- */
function tcrew(id){const c=CREW[id]||[];return `<div class="x-dr">DRIVER <b>${esc(c[0]||"—")}</b></div><div class="x-ob">OBSERVR <b>${esc(c[1]||"—")}</b></div>`;}
function asgVariant(n){
  const poolChips=POOL.map(p=>`<span class="ac-chip">${esc(p[0])}${p[2]==="Double"?'<i>DBL</i>':""}<small>${esc(p[1])}</small></span>`).join("");
  const tugCells=TUGS.slice(0,9).map(id=>`<div class="x-tug ${OOS.has(id)?"oos":""}"><div class="x-h">STUG ${id}</div>${OOS.has(id)?'<div class="x-oos">OOS</div>':tcrew(id)}</div>`).join("");
  if(n===1) return `<div class="av1"><div class="pool-top">${poolChips}</div><div class="av1-grid">${tugCells}</div></div>`;
  if(n===2) return `<div class="av2"><div class="av2-pool"><h5>Pool</h5>${POOL.map(p=>`<div class="av2-row">${esc(p[0])}<small>${esc(p[1])}</small></div>`).join("")}</div><div class="av2-board">${tugCells}</div></div>`;
  if(n===3) return `<div class="av3"><div class="pool-top">${poolChips}</div><div class="av3-cols"><div class="av3-col"><h5>Dispatch</h5><div class="av3-slot">Castro, Alex</div></div><div class="av3-col"><h5>Tugs</h5>${TUGS.slice(0,6).map(id=>`<div class="av3-slot ${OOS.has(id)?"oos":""}">STUG ${id} · ${(CREW[id]||[])[0]||"open"}</div>`).join("")}</div><div class="av3-col"><h5>Areas</h5>${["Ballpark","South","APU"].map(a=>`<div class="av3-slot">${a}</div>`).join("")}</div></div></div>`;
  if(n===4) return `<div class="av4"><div class="pool-top">${poolChips}</div><div class="av4-list">${TUGS.slice(0,8).map(id=>`<div class="av4-row ${OOS.has(id)?"oos":""}"><b>STUG ${id}</b><span>${(CREW[id]||[]).filter(Boolean).join(" / ")||"— tap to assign —"}</span></div>`).join("")}</div></div>`;
  return `<div class="av5"><div class="av5-side">${POOL.map(p=>`<span class="ac-chip sm">${esc(p[0].split(",")[0])}</span>`).join("")}</div><div class="av5-grid">${TUGS.slice(0,12).map(id=>`<div class="av5-cell ${OOS.has(id)?"oos":""}">${id}<small>${(CREW[id]||[])[0]?"✓✓":"··"}</small></div>`).join("")}</div></div>`;
}
/* ---------- pool screen variants (Preview 2) ---------- */
function poolVariant(n){
  if(n===1) return `<div class="pl1">${POOL.map(p=>`<div class="pl1-row"><div><b>${esc(p[0])}</b> <small>${esc(p[1])}</small> ${p[2]==="Double"?'<i class="db">Double</i>':""}</div><div class="pl1-bid">Bid ${esc(p[3])}</div></div>`).join("")}</div>`;
  if(n===2){const g={AM:[],PM:[],NH:[],Double:[]};POOL.forEach(p=>g[p[2]]?g[p[2]].push(p):0);
    return `<div class="pl2">${Object.entries(g).filter(([k,v])=>v.length).map(([k,v])=>`<div class="pl2-grp"><h5>${k} (${v.length})</h5>${v.map(p=>`<div class="pl2-card"><span class="av">${esc(p[0][0])}</span>${esc(p[0])}<small>${esc(p[1])}</small></div>`).join("")}</div>`).join("")}</div>`;}
  if(n===3) return `<table class="pl3"><thead><tr><th>Name</th><th>Hours</th><th>Shift</th><th>Off</th></tr></thead><tbody>${POOL.map(p=>`<tr><td><b>${esc(p[0])}</b></td><td>${esc(p[1])}</td><td>${esc(p[2])}</td><td>${esc((p[3].split("Off ")[1]||""))}</td></tr>`).join("")}</tbody></table>`;
  return `<div class="pl4">${POOL.map(p=>`<button class="pl4-tile"><b>${esc(p[0].split(",")[0])}</b><span>${esc(p[1])}</span>${p[2]==="Double"?'<i>DBL</i>':`<em>${esc(p[2])}</em>`}</button>`).join("")}</div>`;
}

function render2(which){ // which: 'preview' or 'preview2'
  const root=$(which==="preview"?"#previewRoot":"#preview2Root");if(!root)return;
  const isP2=which==="preview2";
  const max=isP2?COUNTS.pool:(kind==="tug"?COUNTS.tug:COUNTS.asg);
  if(v>max)v=1;
  const devBtns=Object.entries(DEV).map(([k,d])=>`<button class="pv-seg ${dev===k?"on":""}" data-dev="${k}">${d.l}</button>`).join("");
  const kindBtns=isP2?"":`<div class="pv-kind"><button class="pv-seg ${kind==="tug"?"on":""}" data-kind="tug">Tug selection</button><button class="pv-seg ${kind==="asg"?"on":""}" data-kind="asg">Assignment</button></div>`;
  const vBtns=Array.from({length:max},(_,i)=>`<button class="pv-vnum ${v===i+1?"on":""}" data-v="${i+1}">${i+1}</button>`).join("");
  const body=isP2?poolVariant(v):(kind==="tug"?tugVariant(v):asgVariant(v));
  root.innerHTML=`<div class="card pad pv-ctrl">
      <h2 class="staff-h" style="margin:0 0 8px">${isP2?"Pool screen designs":"Screen designs"}</h2>
      ${kindBtns}
      <div class="pv-row"><span class="pv-lbl">Device</span><div class="pv-segs">${devBtns}</div></div>
      <div class="pv-row"><span class="pv-lbl">Variant</span><div class="pv-segs">${vBtns}</div></div>
    </div>
    <div class="pv-stage"><div class="pv-dev pv-${dev}"><div class="pv-frame" style="width:${DEV[dev].w}px"><div class="pv-screen">${body}</div></div><div class="pv-cap">${DEV[dev].l} · ${DEV[dev].w}px — variant ${v}</div></div></div>`;
  $$(`#${root.id} .pv-seg[data-dev]`).forEach(b=>b.onclick=()=>{dev=b.dataset.dev;render2(which);});
  $$(`#${root.id} .pv-seg[data-kind]`).forEach(b=>b.onclick=()=>{kind=b.dataset.kind;v=1;render2(which);});
  $$(`#${root.id} .pv-vnum`).forEach(b=>b.onclick=()=>{v=+b.dataset.v;render2(which);});
}
window.PREVIEW={ open:()=>{v=1;render2("preview");}, open2:()=>{v=1;render2("preview2");} };
})();
