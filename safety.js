/* safety.js — the Safety tile: Stop Mark Lookup (rebuilt on the UI kit from the legacy park view)
   and the Gate Hazards reference (showcase data — three example gates with per-role hazards).
   Screens are fn(nav) on one UI.nav stack; the parking DATA stays in the shell (PARK, parkLookup,
   crossFor, UNITED_PARK, ACLABEL). */
(function(){
  const esc=UI.esc;
  const $=(s,r)=>(r||document).querySelector(s);
  const $$=(s,r)=>[...(r||document).querySelectorAll(s)];
  const ROOT=()=>$("#safetyRoot");
  let navApi=null;

  /* ---- gate hazards (showcase / examples only — what a station rollout would populate) ---- */
  const GATES={
    "101":{accepts:["All 737s","All A320-family","CRJs","ERJs"],hazards:[
      ["Ramp","Fuel pit cluster sits forward of the stop line — verify pit covers before marshaling in."],
      ["Move Team","Tight wingtip clearance to the Gate 100 pad when both are occupied."]]},
    "102":{accepts:["All 737s","All 757s","All 767s","787-8","787-9","777-200","CRJs","ERJs"],hazards:[
      ["Ramp","Pushing off this gate puts the tail in close proximity to Gate 120 — extra caution and a wing walker on every push."],
      ["Move Team","Bringing an aircraft in: the service road crosses the lead-in line — watch for vehicles crossing during the turn."],
      ["Customer Service","Jet bridge is newly installed and jerks on extension — brace passengers and pause before docking."]]},
    "103":{accepts:["All 737s","757-200","CRJs","ERJs"],hazards:[
      ["Ramp","Bag-cart staging encroaches on the safety envelope at bank times — clear before arrival."],
      ["Move Team","Short lead-in from the alley — commit early; no swing room once past the service road."]]}
  };

  /* ---- screen: safety home ---- */
  function homeScreen(nav){
    const gateRows=Object.keys(GATES).map(g=>`
      <button class="ui-row" data-gate="${esc(g)}">
        <div class="ui-row__main"><div class="ui-row__title">Gate ${esc(g)}</div>
          <div class="ui-row__sub">${GATES[g].hazards.length} hazard${GATES[g].hazards.length===1?"":"s"} · ${GATES[g].accepts.length} type groups accepted</div></div>
        <span class="ui-row__chev" aria-hidden="true"></span>
      </button>`).join("");
    const body=`
      <div class="ui-group">
        <button class="ui-row" data-open="park">
          <div class="ui-row__main"><div class="ui-row__title">Stop Mark Lookup</div>
            <div class="ui-row__sub">Hardstand · spot · aircraft — stop line &amp; restrictions</div></div>
          <span class="ui-row__chev" aria-hidden="true"></span>
        </button>
      </div>
      <div class="rq-sechead">Gate hazards <b>${Object.keys(GATES).length}</b></div>
      <div class="ui-group">${gateRows}</div>
      <p class="saf-note">Gate hazards are showcase examples — a station rollout populates every gate.</p>`;
    UI.render(ROOT(),nav,{title:"Safety",sub:"Doing it right the first time — stop marks, gate hazards.",body,mount:r=>{
      $('[data-open="park"]',r).onclick=()=>nav.go(areaScreen);
      $$("[data-gate]",r).forEach(b=>b.onclick=()=>nav.go(gateScreen(b.dataset.gate)));
    }});
  }

  /* ---- screen: one gate's hazards ---- */
  function gateScreen(g){
    return function(nav){
      const gate=GATES[g];if(!gate){nav.back();return;}
      const rows=gate.hazards.map(([role,txt])=>`
        <div class="ui-row" style="cursor:default"><div class="ui-row__main">
          <div class="ui-row__sub" style="font-weight:600;letter-spacing:.06em;text-transform:uppercase">${esc(role)}</div>
          <div class="ui-row__title" style="white-space:normal">${esc(txt)}</div></div></div>`).join("");
      const body=`
        ${UI.card(`<span class="ui-flabel">Accepts</span>
          <div class="ui-chips" style="margin-top:6px">${gate.accepts.map(a=>`<span class="ui-chip" style="cursor:default">${esc(a)}</span>`).join("")}</div>`)}
        <div class="rq-sechead">Hazards by role</div>
        <div class="ui-group">${rows}</div>
        <p class="saf-note">Showcase example — verify against official gate documentation.</p>`;
      UI.render(ROOT(),nav,{title:`Gate ${esc(g)}`,sub:"What it takes, and what to watch for.",body,mount:()=>{}});
    };
  }

  /* ================= stop mark lookup (kit port of the legacy park view) ================= */
  function areaScreen(nav){
    const rows=Object.keys(PARK).map(a=>`
      <button class="ui-row" data-a="${esc(a)}">
        <div class="ui-row__main"><div class="ui-row__title">${esc(a)}</div>
          <div class="ui-row__sub">${PARK[a].order.length} spots</div></div>
        <span class="ui-row__chev" aria-hidden="true"></span></button>`).join("");
    UI.render(ROOT(),nav,{title:"Stop Mark Lookup",sub:"Pick the hardstand, then the spot and aircraft — it tells you the stop line and restrictions.",
      body:`<div class="ui-group">${rows}</div>`,mount:r=>{
        $$("[data-a]",r).forEach(b=>b.onclick=()=>nav.go(spotScreen(b.dataset.a)));
      }});
  }
  function spotScreen(area){
    return function(nav){
      const sp=PARK[area].spots,ord=PARK[area].order;
      const sortN=a=>a.slice().sort((x,y)=>x.localeCompare(y,undefined,{numeric:true}));
      const std=sortN(ord.filter(s=>sp[s].adg===3)),wb=sortN(ord.filter(s=>sp[s].adg!==3));
      const grid=arr=>`<div class="ui-chips" style="margin-top:6px">${arr.map(s=>`<button class="ui-chip" data-s="${esc(s)}">${esc(s)}</button>`).join("")}</div>`;
      const body=UI.card(`
        ${std.length?`<span class="ui-flabel">Standard spots (ADG III)</span>${grid(std)}`:""}
        ${wb.length?`<span class="ui-flabel" style="margin-top:14px">Widebody spots · A (ADG IV/V)</span>${grid(wb)}`:""}`);
      UI.render(ROOT(),nav,{title:esc(area),sub:"Pick a spot.",body,mount:r=>{
        $$(".ui-chip[data-s]",r).forEach(c=>c.onclick=()=>nav.go(acScreen(area,c.dataset.s)));
      }});
    };
  }
  function acScreen(area,spot){
    return function(nav){
      const groups=UNITED_PARK.map(g=>`
        <span class="ui-flabel" style="margin-top:14px">${esc(g.mfr)}</span>
        <div class="ui-chips" style="margin-top:6px">${g.items.map(([k,l])=>{
          const ok=parkLookup(area,spot,k).ok;
          return `<button class="ui-chip${ok?"":" saf-no"}" data-k="${esc(k)}" data-l="${esc(l)}">${esc(l)}${ok?"":" &#8856;"}</button>`;}).join("")}</div>`).join("");
      UI.render(ROOT(),nav,{title:`Spot ${esc(spot)}`,sub:`${esc(area)} · all United types — dimmed means not allowed here; tap to see why.`,
        body:UI.card(groups),mount:r=>{
          $$(".ui-chip[data-k]",r).forEach(c=>c.onclick=()=>nav.go(resultScreen(area,spot,c.dataset.k,c.dataset.l)));
        }});
    };
  }
  function resultScreen(area,spot,ac,acLabel){
    return function(nav){
      const res=parkLookup(area,spot,ac),rc=PARK[area].ramp[spot],cross=crossFor(area,spot);
      const label=acLabel||ACLABEL[ac]||ac;
      const rampHtml=`<div class="saf-ramp">${rc?`Contact <b>${esc(rc[0])}</b> · ${esc(rc[1])} · Enter/exit via ${esc(rc[2])}`:"Coordinate with Ramp Control (verify frequency on the chart)"}</div>`;
      let body;
      if(res.ok){
        body=`<div class="saf-verdict ok" id="safVerdict">&#10003; Park on <b>STOP LINE ${esc(res.line)}</b></div>
          <p class="saf-meta">Spot ${esc(spot)} · ${esc(label)} · ADG ${esc(String(res.adg))}</p>${rampHtml}`;
        if(cross.length){
          body+=cross.map((c,i)=>`<div class="saf-cross"><b>&#9888; Restriction:</b> Spot ${esc(spot)} can't be used if a widebody is on ${c.wb.map(esc).join(" or ")}.
            <div class="ui-chips" style="margin-top:8px">
              <button class="ui-chip saf-crossbtn" data-i="${i}" data-v="1">Yes, occupied</button>
              <button class="ui-chip saf-crossbtn" data-i="${i}" data-v="0">No, clear</button></div>
            <div id="safCrossR${i}"></div></div>`).join("");
        }
      } else if(res.excluded){
        body=`<div class="saf-verdict no">&#8856; Aircraft not allowed to be parked<br><span>${esc(label)} is specifically restricted from spot ${esc(spot)}.</span></div>${rampHtml}`;
      } else {
        body=`<div class="saf-verdict no">&#8856; Aircraft not allowed to be parked<br><span>${esc(label)} doesn't have a stop line on spot ${esc(spot)}${res.adg?` (ADG ${esc(String(res.adg))} spot)`:""}.</span></div>${rampHtml}`;
      }
      body=UI.card(body)+`<p class="saf-note">&#9888; Always verify against the official Hardstand ${esc(area)} chart before parking.</p>
        <div class="btnrow" style="margin-top:12px"><button class="btn ghost" id="safAgain">New lookup</button><button class="btn navy" id="safChange" style="flex:2">Change aircraft</button></div>`;
      UI.render(ROOT(),nav,{title:`${esc(label)}`,sub:`${esc(area)} · Spot ${esc(spot)}`,body,mount:r=>{
        $("#safAgain",r).onclick=()=>{nav.back();nav.back();nav.back();};   // pop result+ac+spot -> area picker
        $("#safChange",r).onclick=()=>nav.back();
        const crossState={};
        $$(".saf-crossbtn",r).forEach(b=>b.onclick=()=>{
          const i=b.dataset.i,occ=b.dataset.v==="1";
          crossState[i]=occ;
          $$(".saf-crossbtn",r).forEach(x=>{if(x.dataset.i===i)x.classList.toggle("on",x===b);});
          $("#safCrossR"+i,r).innerHTML=occ?`<div class="saf-verdict no" style="margin-top:8px">&#8856; Spot ${esc(spot)} cannot be used while that widebody is parked.</div>`
            :`<div class="saf-verdict ok" style="margin-top:8px">&#10003; Clear — spot ${esc(spot)} is usable.</div>`;
          const blocked=Object.values(crossState).some(v=>v===true),vEl=$("#safVerdict",r);
          if(vEl){
            if(blocked){vEl.className="saf-verdict no";vEl.innerHTML=`&#8856; Do NOT park — Spot ${esc(spot)} is blocked while a widebody occupies the restricted spot.`;}
            else{vEl.className="saf-verdict ok";vEl.innerHTML=`&#10003; Park on <b>STOP LINE ${esc(res.line)}</b>`;}
          }
        });
      }});
    };
  }

  window.SAFETY={
    open:()=>{ const r=ROOT(); if(!r)return; navApi=UI.nav(r,{onExit:()=>{try{window.goHome&&window.goHome();}catch(_){}}}); navApi.reset(homeScreen); },
    back:()=>navApi?navApi.back():false,
    refresh:()=>{ if(navApi&&ROOT())navApi.refresh(); },
    // the hub's Stop Mark Lookup tile lands here: open the module, push the lookup
    openSub:name=>{ SAFETY.open(); if(name==="park")navApi.go(areaScreen); }
  };
})();
