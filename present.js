/* present.js — the built-in pitch deck. A full-screen overlay of hand-written slides (fresh
   content, not the PowerPoint) so the pitch can run straight from the product: boot the site,
   tap Presentation, talk. Tap right/left (or arrow keys) to move; X or Escape exits.
   No motion — slides swap instantly, per the house rules. */
(function(){
  const esc=UI.esc;
  const KEY="elt.present";   // edited deck lives here; the built-in slides are the fallback

  const S=[
    {kicker:"Move Team · Newark (EWR)",title:"OPERATIONAL SUCCESS",lines:["Built on the ramp, for the ramp.","A working app — live on real shifts today."],cls:"title"},
    {kicker:"The problem",title:"Ground ops runs on radio, paper, and memory",lines:[
      "Requests get radioed, written on a glove, done twice — or never.",
      "Equipment dies quietly. GSE finds out days later. No photo, no clock.",
      "Inventories come back as promises. Nothing says what was NOT found.",
      "Lightning holds: tail numbers read over the radio at the worst possible hour."]},
    {kicker:"What I built",title:"One app. Five tools. All working.",lines:[
      "Move Team Hub — staffing board, fatigue flags, shift reports, fleet lookup.",
      "Requests — structured cross-department asks with live outcomes.",
      "GSE — the equipment home: list, inventory, movement, out-of-service.",
      "Safety — stop marks and gate hazards.",
      "PAATS — lightning-hold dispatch, zero read-backs."],},
    {kicker:"Requests",title:"Who → What → Where. Provable.",lines:[
      "A request reads in one sweep — department colors, the need, gate and aircraft.",
      "Receivers tap Done or Can't-do with a reason. The sender sees it live.",
      "Ask twice: amber. Ask three times: red, and the tile pulses.",
      "“Nobody heard the radio call” is over."]},
    {kicker:"GSE",title:"Out of service in seconds. Seen live.",lines:[
      "Mark it down → reason chips → the camera opens itself.",
      "GSE sees tag, reason, location, photo — oldest unacknowledged first, with a clock.",
      "One tap back: “Picked up — on our way.”",
      "A tug that's been dead nine days is capacity you paid for and don't have."]},
    {kicker:"Inventory",title:"Proof, not promises",lines:[
      "Gloves-first counting: tap once here, twice out-of-service, three times clear.",
      "One area, or a complete inventory with coverage tracking.",
      "Every sheet stamped: counted by whom, when, COMPLETE (6/6) or PARTIAL.",
      "NOT SEEN: every unit a complete count didn't find — with its last known location."]},
    {kicker:"PAATS",title:"Lightning-hold dispatch, zero loss in translation",lines:[
      "SOC picks the truck. Gate, aircraft, flight — the type resolves itself.",
      "The crew sees the whole card instantly. They tap “On it.”",
      "Parked — or couldn't park, with the reason, straight back to SOC.",
      "Every dispatch is a permanent record."]},
    {kicker:"The numbers — sourced",title:"$98 a minute",lines:[
      "Direct operating cost of aircraft time (Airlines for America 2025, DOT Form 41).",
      "EWR 2025: 70% on-time — 2nd worst of the 30 busiest US airports (DOT/BTS).",
      "~4 in 10 EWR delays are carrier-side or the late aircraft they knock over.",
      "One avoided 15-minute delay per day at one station ≈ $540K a year."],cls:"nums"},
    {kicker:"The ask",title:"One station. One quarter. Measured.",lines:[
      "Pilot it where it was built — EWR.",
      "Crew iPads + a feedback loop with SOC, GSE, and Ramp.",
      "Measure delay minutes and equipment downtime, before vs. after.",
      "Decide on numbers, not opinions."]},
    {kicker:"Where this goes",title:"United Next — for our processes",lines:[
      "This app is step one.",
      "Digitize and centralize every process we run — inventory, people, requests, reports, resource planning.",
      "A small team walks each department, process by process, and fine-tunes it into one platform.",
      "Digital Technology integrates it into United's systems and secures it.",
      "We did United Next for the airplanes. This is United Next for how we work."],cls:"title"},
  ];

  const slides=()=>{const d=Store.getJSON(KEY,null);return (Array.isArray(d)&&d.length)?d:S;};
  const saveSlides=l=>Store.setJSON(KEY,l);
  let idx=0,ov=null,editing=false;
  function draw(){
    if(!ov)return;
    const L=slides();
    if(idx>=L.length)idx=L.length-1;
    const s=L[idx];
    if(editing){drawEdit(L,s);return;}
    ov.innerHTML=`
      <button class="pr-x" aria-label="Exit presentation">&#10005;</button>
      <button class="pr-edit">Edit</button>
      <div class="pr-slide ${s.cls||""}">
        <div class="pr-kicker">${esc(s.kicker)}</div>
        <div class="pr-title">${esc(s.title)}</div>
        <div class="pr-lines">${s.lines.map(l=>`<div class="pr-line">${esc(l)}</div>`).join("")}</div>
      </div>
      <div class="pr-foot"><span>${idx+1} / ${L.length}</span><span class="pr-hint">tap right to advance · left to go back</span></div>
      <button class="pr-zone left" aria-label="Previous slide"></button>
      <button class="pr-zone right" aria-label="Next slide"></button>`;
    ov.querySelector(".pr-x").onclick=close;
    ov.querySelector(".pr-edit").onclick=()=>{editing=true;draw();};
    ov.querySelector(".pr-zone.left").onclick=()=>{ if(idx>0){idx--;draw();} };
    ov.querySelector(".pr-zone.right").onclick=()=>{ if(idx<L.length-1){idx++;draw();} else close(); };
  }
  /* edit mode: plain fields for the current slide + add / delete / reorder / reset */
  function drawEdit(L,s){
    ov.innerHTML=`
      <button class="pr-x" aria-label="Exit presentation">&#10005;</button>
      <div class="pr-editbox">
        <div class="pr-ehead">Editing slide ${idx+1} of ${L.length}</div>
        <label class="pr-elabel">Kicker (small line on top)</label>
        <input id="prKicker" class="pr-ein" value="${esc(s.kicker||"")}" autocomplete="off">
        <label class="pr-elabel">Title</label>
        <input id="prTitle" class="pr-ein" value="${esc(s.title||"")}" autocomplete="off">
        <label class="pr-elabel">Lines — one per row</label>
        <textarea id="prLines" class="pr-eta">${esc((s.lines||[]).join("\n"))}</textarea>
        <label class="pr-elabel">Style</label>
        <div class="pr-echips">${[["","Standard"],["title","Big title"],["nums","Numbers"]].map(([v,l])=>
          `<button class="pr-echip${(s.cls||"")===v?" on":""}" data-cls="${v}">${l}</button>`).join("")}</div>
        <div class="pr-erow">
          <button class="pr-ebtn primary" id="prSave">Save</button>
          <button class="pr-ebtn" id="prCancel">Done</button>
        </div>
        <div class="pr-erow">
          <button class="pr-ebtn" id="prBefore">&#8249; Move</button>
          <button class="pr-ebtn" id="prAfter">Move &#8250;</button>
          <button class="pr-ebtn" id="prAdd">+ Slide after</button>
          <button class="pr-ebtn danger" id="prDel">Delete</button>
        </div>
        <div class="pr-erow"><button class="pr-ebtn" id="prReset">Reset whole deck to original</button></div>
      </div>`;
    let cls=s.cls||"";
    const read=()=>({kicker:ov.querySelector("#prKicker").value.trim(),
      title:ov.querySelector("#prTitle").value.trim(),
      lines:ov.querySelector("#prLines").value.split("\n").map(x=>x.trim()).filter(Boolean),
      ...(cls?{cls}:{})});
    ov.querySelector(".pr-x").onclick=close;
    ov.querySelectorAll(".pr-echip").forEach(b=>b.onclick=()=>{cls=b.dataset.cls;
      ov.querySelectorAll(".pr-echip").forEach(x=>x.classList.toggle("on",x===b));});
    ov.querySelector("#prSave").onclick=()=>{const l=slides().slice();l[idx]=read();saveSlides(l);toast&&toast("Slide saved");};
    ov.querySelector("#prCancel").onclick=()=>{editing=false;draw();};
    ov.querySelector("#prAdd").onclick=()=>{const l=slides().slice();l[idx]=read();l.splice(idx+1,0,{kicker:"",title:"New slide",lines:[]});saveSlides(l);idx++;draw();};
    ov.querySelector("#prDel").onclick=()=>{if(!confirm("Delete this slide?"))return;
      const l=slides().slice();l.splice(idx,1);if(!l.length)l.push({kicker:"",title:"New slide",lines:[]});
      saveSlides(l);if(idx>=l.length)idx=l.length-1;draw();};
    ov.querySelector("#prBefore").onclick=()=>{if(idx===0)return;const l=slides().slice();l[idx]=read();
      [l[idx-1],l[idx]]=[l[idx],l[idx-1]];saveSlides(l);idx--;draw();};
    ov.querySelector("#prAfter").onclick=()=>{const l=slides().slice();if(idx>=l.length-1)return;l[idx]=read();
      [l[idx+1],l[idx]]=[l[idx],l[idx+1]];saveSlides(l);idx++;draw();};
    ov.querySelector("#prReset").onclick=()=>{if(!confirm("Reset the whole deck to the built-in slides? Your edits will be lost."))return;
      try{Store.del(KEY);}catch(_){}editing=false;idx=0;draw();};
  }
  function onKey(e){
    if(!ov)return;
    if(editing){ if(e.key==="Escape"){editing=false;draw();} return; }   // typing must not flip slides
    if(e.key==="Escape")close();
    else if(e.key==="ArrowRight"||e.key===" "||e.key==="PageDown"){ if(idx<slides().length-1){idx++;draw();} }
    else if(e.key==="ArrowLeft"||e.key==="PageUp"){ if(idx>0){idx--;draw();} }
  }
  function open(){
    if(ov)return;
    idx=0;editing=false;
    ov=document.createElement("div");ov.className="pr-ov";
    document.body.appendChild(ov);
    document.addEventListener("keydown",onKey);
    draw();
  }
  function close(){ if(!ov)return; ov.remove(); ov=null; document.removeEventListener("keydown",onKey); }

  window.PRESENT={open,close};
})();
