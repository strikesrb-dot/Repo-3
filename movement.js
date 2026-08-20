/* movement.js — the movement log as a UI-kit screen on the GSE nav stack. Read-only view over
   data.movements (written by logMove in the shell), plus the passcode-gated wipe. */
(function(){
  const esc=UI.esc;
  const $=(s,r)=>(r||document).querySelector(s);
  const $$=(s,r)=>[...(r||document).querySelectorAll(s)];
  const ROOT=()=>$("#gseRoot");
  let MQ="";   // search survives refreshes (incl. the cross-window mirror)

  function movementScreen(nav){
    const body=`
      <div class="ui-card">
        <span class="ui-flabel">Search</span>
        <input id="mv2Q" type="search" placeholder="Tag, location…" autocomplete="off" value="${esc(MQ)}"
          style="width:100%;font:400 17px/1.3 var(--font);padding:12px 14px;border:1px solid var(--field-border);border-radius:var(--r-md);background:rgba(255,255,255,.85)">
      </div>
      <div id="mv2List" style="margin-top:12px"></div>
      <div class="btnrow no-print" style="margin-top:14px"><button class="btn ghost" id="mv2Wipe">Wipe log (passcode)</button></div>`;
    UI.render(ROOT(),nav,{title:"Movement log",sub:"Every location change — inventory counts, edits, quick moves.",body,mount:r=>{
      const q=$("#mv2Q",r);
      q.oninput=()=>{MQ=q.value;paint(r);};              // pure DOM repaint — focus survives
      $("#mv2Wipe",r).onclick=async()=>{
        if(!data.movements.length){toast("Nothing to wipe");return;}
        const pass=await askPass("Wipe movement log","Enter the settings passcode.");
        if(pass===null)return;
        if(pass!==curPass()){toast("Wrong passcode");return;}
        if(!confirm(`Permanently wipe all ${data.movements.length} logged movement(s)? This cannot be undone.`))return;
        data.movements.forEach(m=>{if(m.id)tombstone(m.id,"emove");});   // tombstone so the wipe sticks across devices
        data.movements=[];save();toast("Movement log wiped");nav.refresh();
      };
      paint(r);
    }});
  }
  function paint(r){
    const box=$("#mv2List",r);if(!box)return;
    const q=MQ.trim().toLowerCase();
    let mv=data.movements.slice().reverse();
    if(q)mv=mv.filter(m=>[m.tag,m.type,m.from,m.to].some(v=>(v||"").toLowerCase().includes(q)));
    if(!data.movements.length){box.innerHTML=`<p class="rq-empty">No movements logged yet.<br>Counting equipment during inventory records location changes here.</p>`;return;}
    if(!mv.length){box.innerHTML=`<p class="rq-empty">Nothing matches your search.</p>`;return;}
    const row=m=>{
      const det=invDetail(m.spot,m.nose);
      const samePlace=m.from&&m.from===m.to&&(m.fromSpot||"")===(m.spot||"");
      const path=samePlace
        ? `<b>${esc(m.to)}</b>${det?` <span class="mv-det">${esc(det)}</span>`:""} · <span class="${m.oos?'mv-reason':''}">${m.oos?'marked out of service':'back in service'}</span>`
        : `${(m.from?esc(m.from):'<span class="mv-none">unassigned</span>')+(m.fromSpot?` <span class="mv-fs">${esc(m.fromSpot)}</span>`:"")} <span class="mv-arrow">&rarr;</span> ${m.to?esc(m.to):'<span class="mv-none">unassigned</span>'}${det?`<span class="mv-det">${esc(det)}</span>`:""}`;
      const tag=SRCLBL[m.source]?`<span class="mv-src">${SRCLBL[m.source]}</span>`:"";
      const meta=[m.by?"by "+esc(nm(m.by)):"",(m.reason&&!samePlace)?'<span class="mv-reason">'+esc(m.reason)+'</span>':(m.reason&&samePlace?esc(m.reason):"")].filter(Boolean).join(" · ");
      return `<li class="mv-row"><div class="mv-main"><span class="mv-tag">${esc(m.tag)}</span>${m.type?`<span class="mv-type">${esc(m.type)}</span>`:""}${m.oos&&!samePlace?'<span class="mv-oos">OOS</span>':""}${tag}</div>
        <div class="mv-path">${path}</div>${meta?`<div class="mv-who">${meta}</div>`:""}</li>`;};
    const byDate={};mv.forEach(m=>{(byDate[m.date]=byDate[m.date]||[]).push(m);});
    box.innerHTML=Object.keys(byDate).map(d=>{
      const map={},order=[];
      byDate[d].forEach(m=>{const sh=moveShift(m);if(!map[sh]){map[sh]=[];order.push(sh);}map[sh].push(m);});
      const sections=order.map(sh=>`<div class="mv-shift ${moveShiftKey(sh)}">${sh}</div><ul class="mv-list">${map[sh].map(row).join("")}</ul>`).join("");
      return `<div class="mv-date">${esc(fmtDate(d))}</div>${sections}`;
    }).join("");
  }

  window.MOVE={movementScreen,refresh:()=>{ if(window.GSE)GSE.refresh(); }};
})();
