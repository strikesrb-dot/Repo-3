/* paats.js — PAATS lightning-hold dispatch + the Ground Board. SOC sends structured dispatches
   (gate · aircraft · flight) to PAATS 1/2/3; the truck acknowledges, then logs Parked or
   Couldn't-park with a reason. NEW: the Ground Board — when lightning approaches, dispatch logs
   every tail currently on the ground (elt.paats.ground, one entry per aircraft instance) on a
   5AM→5AM OPERATIONAL-DAY clock; dispatch outcomes auto-link back to board entries (groundId
   stamped at send, tail-matched at done/unable), so the day report reads "34 on the ground,
   29 parked — 85%" with closures DERIVED from timestamp gaps (GAP_MIN) — nothing for a gloved
   dispatcher to start, name, or end. Frozen day summaries (elt.paats.daysum) outlive the 14-day
   raw purge so the monthly proof survives. The board is never a gate: dispatching straight from
   SOC works byte-for-byte as before.
   UI-kit module: screens are fn(nav) on a UI.nav stack; storage-event mirror keeps SOC and the
   trucks live across devices with no network (guarded so it never eats a half-typed tail). */
(function(){
  const esc=UI.esc;
  const $=(s,r)=>(r||document).querySelector(s);
  const $$=(s,r)=>[...(r||document).querySelectorAll(s)];
  const ROOT=()=>$("#paatsRoot");
  let navApi=null;

  const KEY="elt.paats";
  const GKEY="elt.paats.ground";     // ground-board entries (one per aircraft instance)
  const SKEY="elt.paats.daysum";     // frozen per-ops-day summaries — outlive the raw purge
  const TRUCKS=[1,2,3];
  const CANT_REASONS=["Equipment blocking the gate","Gate occupied","Aircraft not there","Sent to another gate","Called off"];
  const KEEP_DAYS=14;
  const SOC_CODE="0001";             // SOC access code — gates dispatch + the ground board
  let socOk=false;                   // session-cached once entered correctly
  async function requireSoc(cb){
    if(socOk){cb();return;}
    const p=await askPass("SOC access","Enter the SOC code.");
    if(p===null)return;
    if(p!==SOC_CODE){toast("Wrong code");return;}
    socOk=true;cb();
  }

  /* ---- gate fences + live position (the gate-area map) ----
     A fence is captured by standing at the gate once: {gate, lat, lon, r} in elt.paats.gates.
     GPS needs no internet, so the map and the auto-confirm work fully offline; positions are
     per-device (this phone sees its own dot). Equirectangular math — exact enough at ramp scale. */
  const MKEY="elt.paats.gates";
  const mload=()=>{const d=Store.getJSON(MKEY,[]);return Array.isArray(d)?d:[];};
  const msave=l=>Store.setJSON(MKEY,l);
  const gateFence=g=>mload().find(x=>String(x.gate).toUpperCase()===String(g||"").trim().toUpperCase());
  function distM(a,b){const kx=111320*Math.cos((a.lat+b.lat)/2*Math.PI/180),ky=110540;
    return Math.hypot((a.lon-b.lon)*kx,(a.lat-b.lat)*ky);}
  // a fence is a drawn POLYGON ({gate, poly:[{lat,lon},...]}) or a legacy circle ({gate,lat,lon,r}).
  // With a drawn boundary, GPS slop stops mattering — the gate area is far larger than the error.
  function pointInPoly(p,poly){let inn=false;
    for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];
      if(((a.lat>p.lat)!==(b.lat>p.lat))&&(p.lon<(b.lon-a.lon)*(p.lat-a.lat)/(b.lat-a.lat)+a.lon))inn=!inn;}
    return inn;}
  const insideFence=(p,f)=>(f.poly&&f.poly.length>=3)?pointInPoly(p,f.poly):distM(p,f)<=(+f.r||40);
  const fenceCenter=f=>(f.poly&&f.poly.length)?{lat:f.poly.reduce((a,x)=>a+x.lat,0)/f.poly.length,lon:f.poly.reduce((a,x)=>a+x.lon,0)/f.poly.length}:f;
  let mapDraft=null;   // {gate, pts:[{lat,lon}]} being walked/drawn — survives refreshes
  let geoWatch=null,lastPos=null;
  function stopGeo(){ if(geoWatch!=null){try{navigator.geolocation.clearWatch(geoWatch);}catch(_){}geoWatch=null;} }
  function startGeo(onPos){
    if(!("geolocation" in navigator))return false;
    stopGeo();
    geoWatch=navigator.geolocation.watchPosition(
      p=>{lastPos={lat:p.coords.latitude,lon:p.coords.longitude,acc:p.coords.accuracy||0,at:Date.now()};if(onPos)onPos(lastPos);},
      ()=>{},{enableHighAccuracy:true,maximumAge:5000,timeout:15000});
    return true;
  }
  const SUM_KEEP_DAYS=400;           // ~a year of storm summaries, a few KB
  const GAP_MIN=90;                  // ≥90min of silence splits a day into separate closures (derived)

  const load=()=>{const d=Store.getJSON(KEY,[]);return Array.isArray(d)?d:[];};
  const saveAll=l=>{Store.setJSON(KEY,l);updateAttn();};
  const gload=()=>{const d=Store.getJSON(GKEY,[]);return Array.isArray(d)?d:[];};
  const gsave=l=>Store.setJSON(GKEY,l);
  const sload=()=>{const d=Store.getJSON(SKEY,[]);return Array.isArray(d)?d:[];};
  const ssave=l=>Store.setJSON(SKEY,l);
  const pad2=n=>String(n).padStart(2,"0");
  // ops day = 5AM→5AM, LOCAL date components (never toISOString). The fixed 5h subtraction
  // wobbles an hour across DST — irrelevant while the operation is dark 00:00–05:00.
  const opsDay=t=>{const d=new Date(t-5*3600000);return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate());};
  const todayOps=()=>opsDay(Date.now());
  const fmtOpsDay=day=>{const d=new Date(day+"T12:00:00");return isNaN(d)?day:d.toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"});};
  const purge=()=>{
    const cut=Date.now()-KEEP_DAYS*86400000;
    const l=load();const k=l.filter(x=>(x.when||0)>cut);if(k.length!==l.length)saveAll(k);
    // freeze summaries for any completed ops day that never got one, then age out raw + old sums
    const today=todayOps(),sums=sload();
    [...new Set(gload().map(g=>g.day))].forEach(day=>{ if(day<today&&!sums.some(x=>x.day===day))freezeDay(day); });
    const g=gload(),g2=g.filter(x=>(x.addedAt||0)>cut);if(g2.length!==g.length)gsave(g2);
    const s=sload(),s2=s.filter(x=>(Date.now()-(x.frozenAt||0))<SUM_KEEP_DAYS*86400000);if(s2.length!==s.length)ssave(s2);
  };
  const uid=()=>"p"+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36);
  const timeAgo=t=>{const m=Math.max(0,Math.round((Date.now()-t)/60000));return m<1?"just now":m<60?m+"m ago":Math.round(m/60)+"h ago";};
  const hhmm=t=>new Date(t).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});

  // a couldn't-park is a NOTIFICATION back to SOC: it sits in an attention section on the
  // PAATS home and the SOC screen until dismissed, and the home-screen PAATS tile pulses.
  const alerts=()=>load().filter(x=>x.status==="unable"&&!x.socSeen);
  function updateAttn(){
    const t=document.querySelector('.home-tile[data-home="paats"]');if(!t)return;
    t.classList.toggle("rq-attn",alerts().length>0);
  }
  function alertsHTML(){
    const a=alerts().sort((x,y)=>(y.endAt||y.when)-(x.endAt||x.when));
    if(!a.length)return "";
    return `<div class="rq-sechead" style="color:var(--ua-red)">Needs attention <b>${a.length}</b></div>`+
      a.map(x=>`<div class="ui-card pt-alert">
        <div class="pt-eyebrow" style="color:var(--ua-red)">PAATS ${x.truck} couldn't park · ${timeAgo(x.endAt||x.when)}</div>
        <div class="pt-alert-line"><b>${esc(x.aircraft)}</b>${x.flight?" · "+esc(x.flight):""} at <b>${esc(x.gate)}</b></div>
        <div class="pt-alert-reason">${esc(x.reason||"no reason given")}</div>
        <div class="btnrow" style="margin-top:10px">
          <button class="btn sm navy pt-redis" data-id="${esc(x.id)}" style="flex:0 0 auto">Re-dispatch</button>
          <button class="rq-linkbtn pt-dismiss" data-id="${esc(x.id)}">Dismiss</button>
        </div></div>`).join("");
  }
  function wireAlerts(r,nav){
    $$(".pt-dismiss",r).forEach(b=>b.onclick=()=>{const l=load();const it=l.find(y=>y.id===b.dataset.id);
      if(it)it.socSeen=true;saveAll(l);nav.refresh();});
    $$(".pt-redis",r).forEach(b=>b.onclick=()=>{const x=load().find(y=>y.id===b.dataset.id);if(!x)return;
      requireSoc(()=>{
        const l=load();const it=l.find(y=>y.id===b.dataset.id);if(it)it.socSeen=true;saveAll(l);
        d={truck:x.truck,gate:x.gate,aircraft:x.aircraft,flight:x.flight||"",note:x.note||""};
        nav.go(socScreen);});});
  }

  // fleet lookup — same source as Requests (aircraft.json: {ship, reg, type})
  let FLEET=null;
  fetch("aircraft.json").then(r=>r.json()).then(d=>{FLEET=(d&&d.aircraft)||[];}).catch(()=>{FLEET=[];});
  const acType=t=>{if(!FLEET||!t)return "";const n=String(t).trim().toUpperCase();
    const hit=FLEET.find(a=>a.reg===n||a.reg.slice(1)===n||a.ship===n||("N"+n)===a.reg);
    return hit?hit.type:"";};
  // canonical tail for MATCHING — resolved fresh on both sides of every comparison, so "4732",
  // "37502" and "N37502" collide correctly even if the fleet file loaded after an entry was written
  const acReg=t=>{if(!t)return "";const n=String(t).trim().toUpperCase();if(!FLEET)return n;
    const hit=FLEET.find(a=>a.reg===n||a.reg.slice(1)===n||a.ship===n||("N"+n)===a.reg);
    return hit?hit.reg:n;};
  const shortType=t=>String(t||"").replace(/^(Boeing|Airbus|Embraer|Bombardier)\s*/,"");

  /* ================= ground board: data layer ================= */
  // entries are independent records (instance model): a tail towed back out during closure 2
  // legitimately re-enters as a fresh entry; dedupe only blocks a tail that is still OPEN.
  const openGround=day=>gload().filter(g=>g.status==="open"&&(!day||g.day===day));
  function findOpenByTail(tail){
    const R=acReg(tail),now=Date.now(),today=todayOps();
    const all=gload().filter(g=>g.status==="open"&&acReg(g.tail)===R);
    const pick=list=>list.sort((a,b)=>b.addedAt-a.addedAt)[0]||null;
    return pick(all.filter(g=>g.day===today))||pick(all.filter(g=>now-g.addedAt<86400000));
  }
  // a truck's "Parked" credits the board entry it was working (groundId from send, else tail match)
  function linkParked(disp){
    const l=gload();let g=(disp.groundId&&l.find(x=>x.id===disp.groundId))||null;
    if(!g){const f=findOpenByTail(disp.aircraft);if(f)g=l.find(x=>x.id===f.id);}
    if(!g||g.status!=="open")return;
    g.status="parked";g.via="dispatch";g.dispatchId=disp.id;g.endAt=disp.endAt||Date.now();
    gsave(l);
    if(g.day<todayOps()&&sload().some(x=>x.day===g.day))freezeDay(g.day);   // late park re-freezes its day
  }
  // a couldn't-park keeps the entry OPEN (that is the truth) and records the attempt + reason
  function linkAttempt(disp){
    const l=gload();let g=(disp.groundId&&l.find(x=>x.id===disp.groundId))||null;
    if(!g){const f=findOpenByTail(disp.aircraft);if(f)g=l.find(x=>x.id===f.id);}
    if(!g)return;
    (g.attempts=g.attempts||[]).push({dispatchId:disp.id,truck:disp.truck,reason:disp.reason||"",at:Date.now()});
    gsave(l);
  }
  // the metric: parked / (total − departed − removed). Departures were never PAATS's to park;
  // open-never-parked counts against — that is the honest "ran out of trucks" number.
  function dayStats(day){
    const rows=gload().filter(g=>g.day===day);
    const n=st=>rows.filter(g=>g.status===st).length;
    const total=rows.length,parked=n("parked"),departed=n("departed"),removed=n("removed");
    const denom=total-departed-removed;
    return {rows,total,parked,departed,removed,open:n("open"),denom,
      pct:denom?Math.round(parked/denom*100):null};
  }
  // dispatches that parked a tail never logged on the board: an additive footnote, never a
  // fabricated entry — the board alone defines the denominator, so no phantom 100% days
  function unboardedParked(day){
    const boarded=new Set(gload().filter(g=>g.day===day).map(g=>acReg(g.tail)));
    return load().filter(x=>x.status==="done"&&opsDay(x.endAt||x.when)===day
      &&!x.groundId&&!boarded.has(acReg(x.aircraft))).length;
  }
  // closures are DERIVED, never stored: cluster the day's activity, gaps ≥ GAP_MIN split waves
  function wavesFor(day){
    const rows=gload().filter(g=>g.day===day);
    const ids=new Set(rows.map(g=>g.id));
    const ts=[];
    rows.forEach(g=>{ts.push(g.addedAt);if(g.endAt)ts.push(g.endAt);});
    load().forEach(x=>{if(x.groundId&&ids.has(x.groundId)){ts.push(x.when);if(x.endAt)ts.push(x.endAt);}});
    ts.sort((a,b)=>a-b);
    const waves=[];let cur=null;
    ts.forEach(t=>{ if(!cur||t-cur.end>GAP_MIN*60000){cur={start:t,end:t};waves.push(cur);} else cur.end=t; });
    return waves.map(w=>({start:w.start,end:w.end,
      tails:rows.filter(g=>g.addedAt>=w.start&&g.addedAt<=w.end).length,
      parked:rows.filter(g=>g.status==="parked"&&(g.endAt||0)>=w.start&&(g.endAt||0)<=w.end).length}));
  }
  function freezeDay(day){
    const s=dayStats(day);if(!s.total)return;
    const reasons={};
    s.rows.forEach(g=>(g.attempts||[]).forEach(a=>{if(a.reason)reasons[a.reason]=(reasons[a.reason]||0)+1;}));
    const sums=sload().filter(x=>x.day!==day);
    sums.push({day,frozenAt:Date.now(),total:s.total,parked:s.parked,
      parkedDispatch:s.rows.filter(g=>g.via==="dispatch").length,
      parkedManual:s.rows.filter(g=>g.via==="manual").length,
      departed:s.departed,removed:s.removed,notParked:s.open,pct:s.pct,
      unboardedParked:unboardedParked(day),reasons,waves:wavesFor(day)});
    ssave(sums);
  }

  /* ================= home: SOC + the three trucks + the log ================= */
  function homeScreen(nav){
    purge();
    const all=load();
    const openFor=n=>all.filter(x=>x.truck===n&&(x.status==="open"||x.status==="ack"));
    const truckTiles=TRUCKS.map(n=>{const q=openFor(n);const waiting=q.filter(x=>x.status==="open").length;
      return `<button class="ui-tile t-navy pt-truck${waiting?" waiting":""}" data-truck="${n}">
        ${waiting?`<span class="pt-wcount">${waiting}</span>`:""}
        <span class="ui-tile-t">PAATS ${n}</span>
        <span class="ui-tile-s">${q.length?`${waiting?`<b>${waiting} waiting</b>`:""}${waiting&&q.length-waiting?" · ":""}${q.length-waiting?`${q.length-waiting} on it`:""}`:"clear"}</span>
      </button>`;}).join("");
    const body=`
      ${alertsHTML()}
      ${(()=>{const s=dayStats(todayOps());
        return UI.tile({title:"SOC — dispatch & ground board",attr:'data-go="soc"',
          sub:s.total?`${s.open} on ground · ${s.parked} parked${s.pct!=null?" — <b>"+s.pct+"%</b>":""} · code required`
                     :"gate · aircraft · flight, straight to the crew · code required"});})()}
      <div class="pt-trucks">${truckTiles}</div>
      <div class="ui-group" style="margin-top:12px">
        <button class="ui-row" data-go="log">
          <div class="ui-row__main"><div class="ui-row__title">Log</div>
            <div class="ui-row__sub">Every dispatch — parked or not, and why</div></div>
          <span class="ui-row__value">${all.filter(x=>x.status==="done"||x.status==="unable").length||""}</span>
          <span class="ui-row__chev" aria-hidden="true"></span>
        </button>
        <button class="ui-row" data-go="map">
          <div class="ui-row__main"><div class="ui-row__title">Gate map</div>
            <div class="ui-row__sub">${mload().length?mload().length+" gates mapped · live position":"Capture gates from SOC to enable auto at-the-gate"}</div></div>
          <span class="ui-row__chev" aria-hidden="true"></span>
        </button>
        <button class="ui-row" data-go="report">
          <div class="ui-row__main"><div class="ui-row__title">Reports</div>
            <div class="ui-row__sub">${(()=>{const days=[...new Set([...gload().map(g=>g.day),...sload().map(x=>x.day)])].sort().reverse();
              if(!days.length)return "Entered vs parked, day by day";
              const d0=days[0],s=sload().find(x=>x.day===d0),v=(d0===todayOps()||!s)?dayStats(d0):s;
              return `${fmtOpsDay(d0)} — ${v.total} on board · ${v.parked} parked${v.pct!=null?" · "+v.pct+"%":""}`;})()}</div></div>
          <span class="ui-row__chev" aria-hidden="true"></span>
        </button>
      </div>`;
    UI.render(ROOT(),nav,{title:"PAATS",sub:"Lightning-hold dispatch — sent, acknowledged, parked, logged.",body,mount:r=>{
      wireAlerts(r,nav);
      $('[data-go="soc"]',r).onclick=()=>requireSoc(()=>nav.go(socScreen));
      $('[data-go="report"]',r).onclick=()=>nav.go(reportScreen(null));
      $('[data-go="map"]',r).onclick=()=>nav.go(mapScreen(null));
      $$(".pt-truck",r).forEach(t=>t.onclick=()=>nav.go(truckScreen(+t.dataset.truck)));
      $('[data-go="log"]',r).onclick=()=>nav.go(logScreen);
    }});
  }

  /* ================= SOC: send a dispatch ================= */
  let d={truck:1,gate:"",aircraft:"",flight:"",note:""};
  function socScreen(nav){
    const sent=load().filter(x=>x.status!=="done"&&x.status!=="unable").sort((a,b)=>b.when-a.when).slice(0,8);
    const sentRows=sent.map(x=>`<div class="ui-row" style="cursor:default">
        <div class="ui-row__main"><div class="ui-row__title">PAATS ${x.truck} &middot; ${esc(x.gate||"—")} &middot; ${esc(x.aircraft||"")}</div>
          <div class="ui-row__sub">${x.flight?esc(x.flight)+" · ":""}${timeAgo(x.when)}</div></div>
        <span class="ui-row__value">${x.status==="ack"?(x.atGateAt?'<span class="pt-st ok">At the gate</span>':'<span class="pt-st ok">On it</span>'):'<span class="pt-st wait">Waiting</span>'}</span>
        <button class="rq-linkbtn rq-linkbtn--red pt-del" data-id="${esc(x.id)}" aria-label="Delete dispatch">&#10005;</button>
      </div>`).join("");
    const og=openGround(todayOps());
    const body=`${alertsHTML()}
      ${(()=>{const s=dayStats(todayOps());
        return UI.tile({title:"Ground board",tone:"teal",attr:'data-go="board"',
          sub:s.total?`${s.open} on ground · ${s.parked} parked${s.pct!=null?" — <b>"+s.pct+"%</b>":""}`
                     :"Log aircraft on the ground during a hold"});})()}
      <button class="link-more" data-go="map" style="display:inline-block;margin:0 0 8px">Gate map${mload().length?"":" — capture your gates"}</button>
      ${UI.card(`
        ${og.length?`<span class="ui-flabel">On the ground — tap to fill</span>
          <div class="ui-chips" style="margin:6px 0 12px">${og.slice(0,20).map(g=>
            `<button class="ui-chip pt-ogchip${(d.aircraft&&acReg(g.tail)===acReg(d.aircraft))?" on":""}" data-tail="${esc(g.tail)}">${esc(g.tail)}</button>`).join("")}</div>`:""}
        <div class="ui-ta-wrap">${UI.field({label:"Aircraft",id:"ptAc",value:d.aircraft,placeholder:"Tail or ship number"})}
          <div class="ui-ta-list" id="ptAcList" hidden></div></div>
        <div class="rq-two" style="margin-top:12px">
          <div>${UI.field({label:"Gate",id:"ptGate",value:d.gate,placeholder:"e.g. C109"})}</div>
          <div>${UI.field({label:"Flight (optional)",id:"ptFlight",value:d.flight,placeholder:"e.g. UA1234"})}</div>
        </div>
        ${UI.field({label:"Note (optional)",id:"ptNote",value:d.note,placeholder:"Anything the crew should know…"})}
        <span class="ui-flabel" style="margin-top:14px">Which truck</span>
        ${UI.chips(TRUCKS.map(n=>({v:String(n),label:"PAATS "+n})),String(d.truck),'data-set="truck" data-v')}
        <div class="btnrow" style="margin-top:14px"><button class="btn" id="ptSend">Send to PAATS ${d.truck}</button></div>`)}
      ${sent.length?`<div class="rq-sechead" style="margin-top:18px">Out with the trucks <b>${sent.length}</b></div><div class="ui-group">${sentRows}</div>`:""}`;
    UI.render(ROOT(),nav,{title:"SOC dispatch",sub:"The crew gets the whole assignment — nothing read over the radio.",body,mount:r=>{
      const sync=()=>{d.gate=$("#ptGate",r).value;d.flight=$("#ptFlight",r).value;d.aircraft=$("#ptAc",r).value;d.note=$("#ptNote",r).value;};
      $('[data-go="board"]',r).onclick=()=>{sync();nav.go(boardScreen);};
      $('[data-go="map"]',r).onclick=()=>{sync();nav.go(mapScreen(null));};
      $$(".pt-ogchip",r).forEach(b=>b.onclick=()=>{d.aircraft=b.dataset.tail;$("#ptAc",r).value=b.dataset.tail;
        $$(".pt-ogchip",r).forEach(x=>x.classList.toggle("on",x===b));});
      $$('.ui-chip[data-set="truck"]',r).forEach(b=>b.onclick=()=>{sync();d.truck=+b.dataset.v;nav.refresh();});
      const acIn=$("#ptAc",r),acList=$("#ptAcList",r);
      if(acIn&&acList)UI.typeahead(acIn,acList,{min:2,source:q=>{
        if(!FLEET)return [];
        const Q=q.toUpperCase();
        return FLEET.filter(a=>a.reg.includes(Q)||a.ship.startsWith(Q)).slice(0,20)
          .map(a=>({v:a.reg,label:a.reg,cap:(a.ship?"ship "+a.ship+" · ":"")+a.type}));
      },onPick:v=>{d.aircraft=v;}});
      wireAlerts(r,nav);
      $$(".pt-del",r).forEach(b=>b.onclick=()=>{
        if(!confirm("Delete this dispatch? The truck will no longer see it."))return;
        saveAll(load().filter(y=>y.id!==b.dataset.id));toast("Dispatch deleted");nav.refresh();});
      $("#ptSend",r).onclick=()=>{
        sync();
        if(!d.gate.trim()){toast("Enter the gate");$("#ptGate",r).focus();return;}
        if(!d.aircraft.trim()){toast("Enter the aircraft");$("#ptAc",r).focus();return;}
        const l=load();
        const rec={id:uid(),truck:d.truck,gate:d.gate.trim(),aircraft:d.aircraft.trim().toUpperCase(),
          actype:acType(d.aircraft),flight:d.flight.trim().toUpperCase(),note:d.note.trim(),
          by:(window.oosWho&&oosWho())||"SOC",when:Date.now(),status:"open"};
        const g=findOpenByTail(rec.aircraft);
        if(g){rec.groundId=g.id;
          const gl=gload(),ge=gl.find(x=>x.id===g.id);
          if(ge&&ge.gate!==rec.gate){ge.gate=rec.gate;gsave(gl);}}   // board shows where it's being sent
        l.push(rec);
        saveAll(l);
        toast(`Sent to PAATS ${d.truck}`);
        d={truck:d.truck,gate:"",aircraft:"",flight:"",note:""};
        nav.refresh();
      };
    }});
  }

  /* ================= a truck's queue ================= */
  let declining=null;   // dispatch id showing the couldn't-park reason picker
  function truckScreen(n){
    return function(nav){
      const q=load().filter(x=>x.truck===n&&(x.status==="open"||x.status==="ack")).sort((a,b)=>a.when-b.when);
      const cards=q.map(x=>{
        const acts=declining===x.id
          ?`<div class="pt-declpick">
              <span class="ui-flabel">Why couldn't it be parked?</span>
              <div class="pt-reasons">${CANT_REASONS.map(rr=>`<button class="ui-chip pt-reason" data-id="${esc(x.id)}" data-r="${esc(rr)}">${esc(rr)}</button>`).join("")}</div>
              <div class="rqp-declrow" style="margin-top:10px"><input id="ptReasonTxt" placeholder="Or type what happened…" autocomplete="off">
                <button class="btn pt-reasonsend" data-id="${esc(x.id)}" style="width:auto">Log it</button></div>
              <button class="btn ghost sm pt-declcancel" style="margin-top:10px">Cancel</button>
            </div>`
          :x.status==="open"
            ?`<div class="pt-actrow"><button class="btn pt-act" data-ack="${esc(x.id)}">Acknowledge — on it</button></div>`
            :`<div class="pt-actrow">
                ${x.atGateAt?"":`<button class="btn pt-act pt-atgate" data-atgate="${esc(x.id)}">PAATS at the gate</button>`}
                <button class="btn green pt-act" data-done="${esc(x.id)}">&#10003; Parked</button>
                <button class="btn ghost pt-act2" data-cant="${esc(x.id)}">Couldn't park</button>
              </div>`;
        return `<div class="ui-card pt-card${x.status==="ack"?" onit":""}">
          <div class="pt-head">
            <div class="pt-eyebrow">SOC &rarr; PAATS ${n} · ${x.by?esc(x.by)+" · ":""}${timeAgo(x.when)}</div>
            ${x.status==="ack"?(x.atGateAt?`<span class="pt-st ok pt-stbig">At the gate · ${hhmm(x.atGateAt)}</span>`:'<span class="pt-st ok pt-stbig">On it</span>'):'<span class="pt-st new pt-stbig">New</span>'}
          </div>
          <div class="pt-gate">${esc(x.gate)}</div>
          <div class="pt-ac">${esc(x.aircraft)}${x.actype?` <span>${esc(shortType(x.actype))}</span>`:""}${x.flight?` · ${esc(x.flight)}`:""}</div>
          ${(x.gateHist&&x.gateHist.length)?`<div class="pt-task" style="color:var(--ua-amber-text)">Gate changed from ${esc(x.gateHist[x.gateHist.length-1].from||"—")} · ${hhmm(x.gateHist[x.gateHist.length-1].at)}</div>`:""}
          ${gateFence(x.gate)?`<button class="link-more" data-map="${esc(x.gate)}" style="font-size:15px;margin-top:6px">Gate map</button>`:""}
          ${x.note?`<div class="rqp-note" style="margin:10px 0 0"><span class="rqp-dot" aria-hidden="true"></span><span class="rqp-notetext">${esc(x.note)}</span></div>`:""}
          ${acts}
        </div>`;}).join("")
        ||`<p class="rq-empty">Nothing dispatched to PAATS ${n} right now.<br>New assignments from SOC appear here live.</p>`;
      UI.render(ROOT(),nav,{title:`PAATS ${n}`,sub:q.length?`${q.length} assignment${q.length===1?"":"s"} — oldest first.`:"Standing by.",body:cards,mount:r=>{
        const upd=(id,patch)=>{const l=load();const it=l.find(y=>y.id===id);if(it)Object.assign(it,patch);saveAll(l);
          if(it&&patch.status==="done")linkParked(it);        // credit the board entry
          if(it&&patch.status==="unable")linkAttempt(it);     // record the attempt; entry stays open
          declining=null;nav.refresh();};
        $$("[data-ack]",r).forEach(b=>b.onclick=()=>upd(b.dataset.ack,{status:"ack",ackAt:Date.now()}));
        $$("[data-atgate]",r).forEach(b=>b.onclick=()=>{upd(b.dataset.atgate,{atGateAt:Date.now()});toast("SOC sees you at the gate");});
        $$("[data-map]",r).forEach(b=>b.onclick=()=>nav.go(mapScreen(b.dataset.map)));
        // GPS assist: while this truck screen shows an acknowledged card whose gate is fenced,
        // watch position; entering the fence auto-stamps at-the-gate. The manual pulse stays
        // the ground truth — GPS only saves the tap when it agrees.
        const fenced=q.filter(x=>x.status==="ack"&&!x.atGateAt&&gateFence(x.gate));
        if(fenced.length){
          startGeo(pos=>{
            if(!ROOT()||!ROOT().querySelector("[data-atgate]")){stopGeo();return;}   // left the screen
            fenced.forEach(x=>{const f=gateFence(x.gate);if(!f)return;
              const cur=load().find(y=>y.id===x.id);
              if(!cur||cur.status!=="ack"||cur.atGateAt)return;
              if(insideFence(pos,f)){upd(x.id,{atGateAt:Date.now(),atGateBy:"gps"});toast("GPS confirms — at the gate");}});
          });
        }
        $$("[data-done]",r).forEach(b=>b.onclick=()=>{upd(b.dataset.done,{status:"done",endAt:Date.now()});toast("Logged — parked");});
        $$("[data-cant]",r).forEach(b=>b.onclick=()=>{declining=b.dataset.cant;nav.refresh();});
        $$(".pt-declcancel",r).forEach(b=>b.onclick=()=>{declining=null;nav.refresh();});
        $$(".pt-reason",r).forEach(b=>b.onclick=()=>{upd(b.dataset.id,{status:"unable",endAt:Date.now(),reason:b.dataset.r});toast("Logged");});
        $$(".pt-reasonsend",r).forEach(b=>b.onclick=()=>{const t=($("#ptReasonTxt",r)&&$("#ptReasonTxt",r).value||"").trim();
          if(!t){toast("Type what happened");return;}
          upd(b.dataset.id,{status:"unable",endAt:Date.now(),reason:t});toast("Logged");});
      }});
    };
  }

  /* ================= log ================= */
  function logScreen(nav){
    const done=load().filter(x=>x.status==="done"||x.status==="unable").sort((a,b)=>(b.endAt||b.when)-(a.endAt||a.when));
    const byDate={};
    done.forEach(x=>{const k=new Date(x.endAt||x.when).toDateString();(byDate[k]=byDate[k]||[]).push(x);});
    const body=Object.keys(byDate).map(dk=>{
      const od=opsDay(byDate[dk][0].endAt||byDate[dk][0].when);
      const st=(od===todayOps())?dayStats(od):(sload().find(x=>x.day===od)||dayStats(od));
      const chip=(st&&st.total&&st.pct!=null)?`<button class="pt-pctchip" data-day="${esc(od)}">${st.pct}%</button>`:"";
      return `
      <div class="rq-sechead" style="display:flex;align-items:center;gap:8px">${esc(dk)}${chip}</div>
      <div class="ui-group">${byDate[dk].map(x=>`
        <div class="ui-row" style="cursor:default">
          <div class="ui-row__main">
            <div class="ui-row__title">PAATS ${x.truck} &middot; ${esc(x.gate)} &middot; ${esc(x.aircraft)}${x.actype?` <span style="color:var(--muted);font-size:13px">${esc(shortType(x.actype))}</span>`:""}</div>
            <div class="ui-row__sub">${x.flight?esc(x.flight)+" · ":""}${[["sent",x.when],["on it",x.ackAt],["at gate",x.atGateAt],[x.status==="done"?"parked":"logged",x.endAt]].filter(p=>p[1]).map(p=>p[0]+" "+hhmm(p[1])).join(" · ")}${(x.gateHist||[]).map(h=>` · <span style="color:var(--ua-amber-text)">gate ${esc(h.from||"—")}&rarr;${esc(h.to)} ${hhmm(h.at)}</span>`).join("")}${x.status==="unable"&&x.reason?` · <span style="color:var(--ua-red)">${esc(x.reason)}</span>`:""}</div>
          </div>
          <span class="ui-row__value">${x.status==="done"?'<span class="pt-st ok">&#10003; Parked</span>':'<span class="pt-st bad">&#10005; Not parked</span>'}</span>
        </div>`).join("")}</div>`;}).join("")
      ||`<p class="rq-empty">No completed dispatches yet.<br>Parked and couldn't-park outcomes land here.</p>`;
    UI.render(ROOT(),nav,{title:"PAATS log",sub:`Every outcome, kept ${KEEP_DAYS} days.`,body,mount:r=>{
      $$(".pt-pctchip",r).forEach(b=>b.onclick=()=>nav.go(reportScreen(b.dataset.day)));
    }});
  }

  /* ================= ground board: the screen ================= */
  // Entry and live view are ONE screen — zero navigation at the pressure moment. Adds repaint
  // only the list + stat numbers (the input sits outside), so the keyboard never drops.
  function boardScreen(nav){
    purge();
    const day=todayOps();
    const yOpen=gload().filter(g=>g.status==="open"&&g.day<day);
    const body=`
      ${yOpen.length?`<div class="ui-banner ui-banner--warn">${yOpen.length} tail${yOpen.length===1?"":"s"} from an earlier day still open — ${yOpen.slice(0,12).map(g=>esc(g.tail)).join(", ")}. They stay on their own day's report.</div>`:""}
      ${UI.card(`
        <div class="ui-ta-wrap">${UI.field({label:"Aircraft on the ground — tail or ship number",id:"ptgTail",value:"",placeholder:"e.g. 4732 — Enter adds it"})}
          <div class="ui-ta-list" id="ptgTaList" hidden></div></div>
        <div class="btnrow" style="margin-top:10px"><button class="btn" id="ptgAdd">Add to the board</button></div>`)}
      <div class="ptg-stats">
        <div class="ui-stat ptg-stat"><span class="ui-stat__eyebrow">On ground</span><div class="ui-stat__num" id="ptgNOpen">0</div></div>
        <div class="ui-stat ptg-stat"><span class="ui-stat__eyebrow">Parked</span><div class="ui-stat__num" id="ptgNParked">0</div></div>
        <div class="ui-stat ui-stat--royal ptg-stat"><span class="ui-stat__eyebrow">Parked rate</span><div class="ui-stat__num" id="ptgNPct">—</div></div>
      </div>
      <div id="ptgList"></div>`;
    UI.render(ROOT(),nav,{title:"Ground board",sub:fmtOpsDay(day)+" — one board for the whole 5AM-to-5AM ops day.",body,mount:r=>{
      const inp=$("#ptgTail",r);
      function paintBoard(){
        const s=dayStats(day);
        $("#ptgNOpen",r).textContent=s.open;
        $("#ptgNParked",r).textContent=s.parked;
        $("#ptgNPct",r).textContent=s.pct!=null?s.pct+"%":"—";
        const dispFor=g=>load().find(x=>x.groundId===g.id&&(x.status==="open"||x.status==="ack"));
        const rows=s.rows.slice().sort((a,b)=>b.addedAt-a.addedAt);
        const sect=(head,list,html)=>list.length?`<div class="rq-sechead">${head} <b>${list.length}</b></div><div class="ui-group">${list.map(html).join("")}</div>`:"";
        $("#ptgList",r).innerHTML=
          sect("Still on ground",rows.filter(g=>g.status==="open"),g=>{
            const dd=dispFor(g);
            const att=(g.attempts||[]).length;
            return `<div class="ui-row ptg-row" data-gid="${esc(g.id)}" style="cursor:default;flex-wrap:wrap">
              <div class="ui-row__main"><div class="ui-row__title">${esc(g.tail)}${g.actype?` <span class="ptg-type">${esc(shortType(g.actype))}</span>`:""}${g.gate?` <span class="ptg-gate">${esc(g.gate)}</span>`:""}</div>
                <div class="ui-row__sub">added ${hhmm(g.addedAt)}${dd?` · <b>dispatched — PAATS ${dd.truck}</b>`:""}${att?` · <span style="color:var(--ua-red)">${att} failed attempt${att===1?"":"s"}</span>`:""}</div></div>
              <span class="ptg-acts">
                ${dd?"":`<button class="btn sm navy" data-disp="${esc(g.id)}">Dispatch</button>`}
                <button class="rq-linkbtn" data-gate="${esc(g.id)}">Gate</button>
                <button class="rq-linkbtn" data-park="${esc(g.id)}">Parked</button>
                <button class="rq-linkbtn rq-linkbtn--red" data-rm="${esc(g.id)}">&#10005;</button>
              </span></div>`;})
          +sect("Parked",rows.filter(g=>g.status==="parked"),g=>`
            <div class="ui-row" style="cursor:default"><div class="ui-row__main">
              <div class="ui-row__title">${esc(g.tail)}${g.actype?` <span class="ptg-type">${esc(shortType(g.actype))}</span>`:""}</div>
              <div class="ui-row__sub" style="color:var(--ua-green)">&#10003; ${hhmm(g.endAt||g.addedAt)}${g.via==="dispatch"?` · PAATS${(x=>x?" "+x.truck:"")(load().find(y=>y.id===g.dispatchId))}`:" · marked by hand"}</div></div></div>`)
          ||`<p class="rq-empty">Nothing on the board yet.<br>Type the tails currently on the ground — one by one, Enter adds.</p>`;
        // row actions
        $$("[data-disp]",r).forEach(b=>b.onclick=()=>{const g=gload().find(x=>x.id===b.dataset.disp);if(!g)return;
          d.aircraft=g.tail;if(g.gate)d.gate=g.gate;nav.go(socScreen);});
        // gate change: updates the board entry AND any live dispatch — the truck sees it instantly,
        // and the change is kept on the dispatch record (gateHist) so the log tells the whole story
        $$("[data-gate]",r).forEach(b=>b.onclick=()=>{const l=gload(),g=l.find(x=>x.id===b.dataset.gate);if(!g)return;
          const v=(prompt(`Gate for ${g.tail}:`,g.gate||"")||"").trim().toUpperCase();
          if(!v||v===g.gate)return;
          const old=g.gate||"";g.gate=v;gsave(l);
          const dl=load();let moved=0;
          dl.forEach(x=>{ if(x.groundId===g.id&&(x.status==="open"||x.status==="ack")&&x.gate!==v){
            (x.gateHist=x.gateHist||[]).push({from:x.gate,to:v,at:Date.now()});x.gate=v;moved++; }});
          if(moved)saveAll(dl);
          toast(moved?`Gate updated — PAATS sees ${v} now`:`Gate set to ${v}`);
          paintBoard();});
        $$("[data-park]",r).forEach(b=>b.onclick=()=>{const l=gload(),g=l.find(x=>x.id===b.dataset.park);if(!g)return;
          if(!confirm(`Mark ${g.tail} parked by hand? Use this when it was parked without a PAATS dispatch.`))return;
          g.status="parked";g.via="manual";g.endAt=Date.now();gsave(l);paintBoard();});
        $$("[data-rm]",r).forEach(b=>b.onclick=()=>{const l=gload(),g=l.find(x=>x.id===b.dataset.rm);if(!g)return;
          if(!confirm(`Remove ${g.tail} from the board? Only for entries logged in error.`))return;
          g.status="removed";g.endAt=Date.now();gsave(l);paintBoard();});
      }
      const add=v=>{
        const t=String(v==null?inp.value:v).trim().toUpperCase();
        if(!t)return;
        const R=acReg(t);
        const l=gload();
        const dup=l.find(g=>g.status==="open"&&acReg(g.tail)===R);
        if(dup){toast(t+" is already on the board");
          const row=$(`.ptg-row[data-gid="${dup.id}"]`,r);if(row){row.classList.add("flash");setTimeout(()=>row.classList.remove("flash"),650);}
          inp.value="";inp.focus();return;}
        l.push({id:"g"+uid().slice(1),tail:t,reg:R,actype:acType(t),gate:"",day:todayOps(),
          addedAt:Date.now(),by:(window.oosWho&&oosWho())||"SOC",status:"open"});
        gsave(l);
        inp.value="";inp.focus();
        paintBoard();
      };
      UI.typeahead(inp,$("#ptgTaList",r),{min:2,source:q=>{
        if(!FLEET)return [];
        const Q=q.toUpperCase();
        const openRegs=new Set(openGround(day).map(g=>acReg(g.tail)));
        return FLEET.filter(a=>a.reg.includes(Q)||a.ship.startsWith(Q)).slice(0,12)
          .map(a=>({v:a.reg,label:a.reg,cap:(a.ship?"ship "+a.ship+" · ":"")+a.type+(openRegs.has(a.reg)?" · on board":"")}));
      },onPick:v=>add(v)});
      inp.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();add();}};
      $("#ptgAdd",r).onclick=()=>add();
      paintBoard();
      setTimeout(()=>inp.focus(),80);
    }});
  }

  /* ================= reports: the day, its closures, the number ================= */
  function reportScreen(day0){
    return function(nav){
      purge();
      const days=[...new Set([...gload().map(g=>g.day),...sload().map(x=>x.day)])].sort().reverse();
      const day=day0||days[0]||todayOps();
      const frozen=(day!==todayOps())?sload().find(x=>x.day===day):null;
      const live=dayStats(day);
      const useLive=live.total>0;               // raw rows still here → richest view
      const v=useLive?{total:live.total,parked:live.parked,departed:live.departed,removed:live.removed,
          notParked:live.open,pct:live.pct,
          parkedDispatch:live.rows.filter(g=>g.via==="dispatch").length,
          parkedManual:live.rows.filter(g=>g.via==="manual").length,
          unboarded:unboardedParked(day),waves:wavesFor(day),
          reasons:(()=>{const o={};live.rows.forEach(g=>(g.attempts||[]).forEach(a=>{if(a.reason)o[a.reason]=(o[a.reason]||0)+1;}));return o;})()}
        :(frozen?{total:frozen.total,parked:frozen.parked,departed:frozen.departed,removed:frozen.removed,
          notParked:frozen.notParked,pct:frozen.pct,parkedDispatch:frozen.parkedDispatch,
          parkedManual:frozen.parkedManual,unboarded:frozen.unboardedParked,waves:frozen.waves||[],
          reasons:frozen.reasons||{}}:null);
      const chips=days.slice(0,14).map(dd=>({v:dd,label:(dd===todayOps()?"Today":fmtOpsDay(dd))}));
      const waveHTML=(v&&v.waves.length>1)?v.waves.map((w,i)=>`
        <div class="ui-row" style="cursor:default"><div class="ui-row__main">
          <div class="ui-row__title">Closure ${i+1} <span class="ptg-type">${hhmm(w.start)}&ndash;${hhmm(w.end)}</span></div>
          <div class="ui-row__sub">${w.tails} on ground · ${w.parked} parked</div></div></div>`).join(""):"";
      const reasonHTML=v&&Object.keys(v.reasons).length?Object.entries(v.reasons).sort((a,b)=>b[1]-a[1]).map(([t,n])=>`
        <div class="ui-row" style="cursor:default"><div class="ui-row__main"><div class="ui-row__title" style="font-size:15px">${esc(t)}</div></div>
          <span class="ui-row__value">${n}&times;</span></div>`).join(""):"";
      const body=`
        ${days.length>1?`<div class="ui-chips" style="margin-bottom:12px">${chips.map(c=>
          `<button class="ui-chip${c.v===day?" on":""}" data-day="${esc(c.v)}">${esc(c.label)}</button>`).join("")}</div>`:""}
        ${v?`
        <div class="ui-stat ptg-hero"><span class="ui-stat__eyebrow">Parked rate</span>
          <div class="ui-stat__num ptg-heropct">${v.pct!=null?v.pct+"%":"—"}</div>
          <div class="ui-stat__cap ptg-herosub">${v.parked} of ${v.total-v.departed-v.removed} parked</div></div>
        <div class="rq-sechead">The day's numbers</div>
        <div class="ui-group">
          <div class="ui-row" style="cursor:default"><div class="ui-row__main"><div class="ui-row__title">On the board</div></div><span class="ui-row__value">${v.total}</span></div>
          <div class="ui-row" style="cursor:default"><div class="ui-row__main"><div class="ui-row__title">Parked</div></div><span class="ui-row__value">${v.parked}</span></div>
          <div class="ui-row" style="cursor:default"><div class="ui-row__main"><div class="ui-row__title">Not parked</div></div><span class="ui-row__value"${v.notParked?' style="color:var(--ua-red);font-weight:600"':""}>${v.notParked}</span></div>
        </div>
        ${waveHTML?`<div class="rq-sechead">Closures — derived from the day's activity</div><div class="ui-group">${waveHTML}</div>`:""}
        ${reasonHTML?`<div class="rq-sechead" style="color:var(--ua-red)">Couldn't-park reasons</div><div class="ui-group">${reasonHTML}</div>`:""}
        <p class="saf-note">${v.parkedDispatch||0} parked via PAATS dispatch · ${v.parkedManual||0} marked by hand${v.unboarded?` · +${v.unboarded} parked by PAATS that were never on the board`:""}${(!useLive&&frozen)?" · detail rows past the 14-day window — summary preserved":""}</p>`
        :`<p class="rq-empty">No board data yet.<br>During the next hold, log the aircraft on the ground and this report builds itself.</p>`}`;
      UI.render(ROOT(),nav,{title:"PAATS report",sub:fmtOpsDay(day)+" — entered vs parked, closures split automatically.",body,mount:r=>{
        $$(".ui-chip[data-day]",r).forEach(b=>b.onclick=()=>nav.go(reportScreen(b.dataset.day)));
      }});
    };
  }

  /* ================= gate map: drawn boundaries + live position ================= */
  // Hybrid: SOC draws each gate's real boundary — walk the corners with GPS, or tap the map to
  // place/adjust points. Inside/outside is point-in-polygon, so a 10-15 m GPS error is nothing
  // against a gate-sized area. Legacy single-spot circles still work. Diagram, not map tiles —
  // fully offline.
  function mapScreen(focusGate){
    return function(nav){
      const gates=mload();
      const openDisp=load().filter(x=>x.status==="open"||x.status==="ack");
      const hot=new Set(openDisp.map(x=>String(x.gate).toUpperCase()));
      if(focusGate)hot.add(String(focusGate).toUpperCase());
      let proj=null;   // the current meters<->latlon frame, for tap-to-draw inversion
      function allPts(){
        const pts=[];
        gates.forEach(g=>{ if(g.poly&&g.poly.length)g.poly.forEach(p=>pts.push({lat:+p.lat,lon:+p.lon}));
          else pts.push({lat:+g.lat,lon:+g.lon}); });
        if(mapDraft)mapDraft.pts.forEach(p=>pts.push(p));
        if(lastPos)pts.push({lat:lastPos.lat,lon:lastPos.lon});
        return pts;
      }
      function svgHTML(){
        const pts=allPts();
        if(!pts.length)return "";
        const lat0=pts.reduce((a,p)=>a+p.lat,0)/pts.length;
        const kx=111320*Math.cos(lat0*Math.PI/180),ky=110540;
        const xs=pts.map(p=>p.lon*kx),ys=pts.map(p=>p.lat*ky);
        const maxR=Math.max(30,...gates.filter(g=>!g.poly).map(g=>+g.r||40));
        const pad=maxR+30;
        const minX=Math.min(...xs)-pad,maxX=Math.max(...xs)+pad;
        const minY=Math.min(...ys)-pad,maxY=Math.max(...ys)+pad;
        const W=maxX-minX,H=maxY-minY;
        const X=lon=>lon*kx-minX, Y=lat=>maxY-lat*ky;
        proj={kx,ky,minX,maxY,W,H};
        const shapes=gates.map(g=>{
          const isHot=hot.has(String(g.gate).toUpperCase());
          const inR=lastPos&&insideFence(lastPos,g);
          const stroke=inR?"var(--ua-green)":isHot?"var(--ua-action)":"var(--ua-blue)";
          const fill=inR?"rgba(0,128,9,.14)":isHot?"rgba(20,20,210,.10)":"rgba(0,51,160,.06)";
          const c=fenceCenter(g);
          let shape;
          if(g.poly&&g.poly.length>=3){
            const d=g.poly.map((p,i)=>(i?"L":"M")+X(+p.lon)+","+Y(+p.lat)).join(" ")+" Z";
            shape=`<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${isHot||inR?3:1.5}" stroke-linejoin="round"/>`;
          }else{
            shape=`<circle cx="${X(+g.lon)}" cy="${Y(+g.lat)}" r="${+g.r||40}" fill="${fill}" stroke="${stroke}" stroke-width="${isHot||inR?3:1.5}"/>`;
          }
          const fs=Math.max(10,Math.min(26,W*0.05));
          return shape+`<text x="${X(c.lon)}" y="${Y(c.lat)+fs*.35}" text-anchor="middle" font-size="${fs}" font-weight="600"
            fill="${inR?"var(--ua-green)":isHot?"var(--ua-action)":"var(--ua-navy)"}">${esc(g.gate)}</text>`;
        }).join("");
        let draft="";
        if(mapDraft&&mapDraft.pts.length){
          const hr=Math.max(3,W*0.012);
          const d=mapDraft.pts.map((p,i)=>(i?"L":"M")+X(p.lon)+","+Y(p.lat)).join(" ")+(mapDraft.pts.length>2?" Z":"");
          draft=`<path d="${d}" fill="rgba(20,20,210,.08)" stroke="var(--ua-action)" stroke-width="2" stroke-dasharray="6 5" stroke-linejoin="round"/>`
            +mapDraft.pts.map((p,i)=>`<circle cx="${X(p.lon)}" cy="${Y(p.lat)}" r="${hr}" fill="var(--ua-action)" stroke="#fff" stroke-width="${hr*.4}"/>`).join("");
        }
        const me=lastPos?`
          <circle cx="${X(lastPos.lon)}" cy="${Y(lastPos.lat)}" r="${Math.max(6,lastPos.acc)}" fill="rgba(10,31,68,.08)" stroke="var(--ua-navy)" stroke-width="1" stroke-dasharray="4 4"/>
          <circle cx="${X(lastPos.lon)}" cy="${Y(lastPos.lat)}" r="${Math.max(4,W*0.014)}" fill="var(--ua-navy)" stroke="#fff" stroke-width="${Math.max(1.5,W*0.005)}"/>`:"";
        const bar=Math.min(200,Math.round(W/4/10)*10)||50;
        const fs=Math.max(8,W*0.035);
        const scale=`<line x1="12" y1="${H-fs}" x2="${12+bar}" y2="${H-fs}" stroke="var(--ua-navy)" stroke-width="${Math.max(1,W*0.006)}"/>
          <text x="12" y="${H-fs*1.4}" font-size="${fs}" fill="var(--muted)">${bar} m</text>`;
        return `<svg id="ptMapSvg" viewBox="0 0 ${W} ${H}" style="width:100%;display:block" xmlns="http://www.w3.org/2000/svg">${shapes}${draft}${me}${scale}</svg>`;
      }
      const statusLine=()=>{
        if(!gates.length)return "";
        if(!lastPos)return `<p class="saf-note" id="ptMapStatus">Waiting for a GPS fix… allow location when asked.</p>`;
        const scored=gates.map(g=>({g,inn:insideFence(lastPos,g),d:Math.round(distM(lastPos,fenceCenter(g)))}))
          .sort((a,b)=>(a.inn?0:1)-(b.inn?0:1)||a.d-b.d);
        const n=scored[0];
        return `<p class="saf-note" id="ptMapStatus">${n.inn?`<b style="color:var(--ua-green)">Inside ${esc(n.g.gate)}</b>`:`Nearest gate ${esc(n.g.gate)} · ${n.d} m away`} · accuracy ±${Math.round(lastPos.acc)} m</p>`;
      };
      const draftBar=mapDraft?`<div class="ui-banner ui-banner--info" id="ptmDraftBar">Drawing <b>&nbsp;${esc(mapDraft.gate)}&nbsp;</b> — ${mapDraft.pts.length} point${mapDraft.pts.length===1?"":"s"}. Tap the map to add a corner, or use GPS below.</div>`:"";
      const manage=socOk?`
        <div class="rq-sechead">Define a gate area</div>
        ${UI.card(`
          <div class="rq-two">
            <div>${UI.field({label:"Gate",id:"ptmGate",value:mapDraft?mapDraft.gate:"",placeholder:"e.g. C109"})}</div>
            <div>${UI.field({label:"Circle radius (m) — quick mode",id:"ptmR",value:"40",inputmode:"numeric"})}</div>
          </div>
          <div class="btnrow" style="margin-top:12px">
            <button class="btn" id="ptmCorner">${mapDraft?"Add corner here (GPS)":"Start boundary — corner here (GPS)"}</button>
          </div>
          <div class="btnrow" style="margin-top:8px">
            <button class="btn ghost" id="ptmDraw" style="flex:1 1 0">${mapDraft?"Tap map = add point":"Draw on the map"}</button>
            <button class="btn ghost" id="ptmCap" style="flex:1 1 0">Quick circle here</button>
          </div>
          ${mapDraft?`<div class="btnrow" style="margin-top:8px">
            <button class="btn green" id="ptmSave"${mapDraft.pts.length>=3?"":" disabled"}>&#10003; Save ${esc(mapDraft.gate)} (${mapDraft.pts.length})</button>
            <button class="btn ghost sm" id="ptmUndo" style="flex:0 0 auto">Undo</button>
            <button class="btn ghost sm" id="ptmClear" style="flex:0 0 auto">Discard</button>
          </div>`:""}
          <p class="hint" id="ptmMsg" style="margin:8px 0 0">${mapDraft?"Walk the perimeter and add a corner at each turn — or tap corners straight onto the map. 3+ points make the area.":"Boundaries beat circles: walk the gate's corners (or tap them on the map) and GPS slop stops mattering — the area is way bigger than the error."}</p>`)}
        ${gates.length?`<div class="ui-group" style="margin-top:12px">${gates.map((g,i)=>`
          <div class="ui-row" style="cursor:default">
            <div class="ui-row__main"><div class="ui-row__title">${esc(g.gate)}</div>
              <div class="ui-row__sub">${g.poly?g.poly.length+" corners drawn":"circle · radius "+(+g.r||40)+" m"}${lastPos?` · ${Math.round(distM(lastPos,fenceCenter(g)))} m from you`:""}</div></div>
            <button class="rq-linkbtn" data-medit="${i}">Redraw</button>
            <button class="rq-linkbtn rq-linkbtn--red" data-mrm="${i}">&#10005;</button>
          </div>`).join("")}</div>`:""}`:"";
      const body=`
        ${draftBar}
        ${(gates.length||mapDraft)
          ?`<div class="ui-card ptm-wrap" id="ptMapBox">${svgHTML()||'<p class="rq-empty">Waiting for a GPS fix to anchor the map…</p>'}</div>${statusLine()}`
          :`<p class="rq-empty">No gate areas yet.${socOk?"<br>Walk a gate's corners with the GPS button, or start a boundary and tap it onto the map.":"<br>SOC defines the gate areas (code required); then trucks get auto at-the-gate."}</p>`}
        ${manage}`;
      UI.render(nav.el||ROOT(),nav,{title:"Gate map",sub:"Drawn gate boundaries and your live position — works offline.",body,mount:r=>{
        startGeo(()=>{
          const box=$("#ptMapBox",r);
          if(!box){ if(!ROOT()||!$("#ptmCorner",r))stopGeo(); return; }
          box.innerHTML=svgHTML()||box.innerHTML;
          const st=$("#ptMapStatus",r);const tmp=document.createElement("div");tmp.innerHTML=statusLine();
          if(st&&tmp.firstElementChild)st.replaceWith(tmp.firstElementChild);
        });
        const gateName=()=>(($("#ptmGate",r)&&$("#ptmGate",r).value)||"").trim().toUpperCase();
        const needName=()=>{const n=gateName();if(!n){toast("Enter the gate name first");const i=$("#ptmGate",r);i&&i.focus();}return n;};
        const ensureDraft=n=>{ if(!mapDraft)mapDraft={gate:n,pts:[]}; else mapDraft.gate=n; };
        // tap the map to place a corner (only while a draft is active, SOC only)
        const box=$("#ptMapBox",r);
        if(box&&socOk)box.onclick=e=>{
          if(!mapDraft||!proj)return;
          const svg=$("#ptMapSvg",r);if(!svg)return;
          const rc=svg.getBoundingClientRect();
          const x=(e.clientX-rc.left)/rc.width*proj.W, y=(e.clientY-rc.top)/rc.height*proj.H;
          mapDraft.pts.push({lat:(proj.maxY-y)/proj.ky, lon:(x+proj.minX)/proj.kx});
          nav.refresh();
        };
        const corner=$("#ptmCorner",r);
        if(corner)corner.onclick=()=>{
          const n=needName();if(!n)return;
          if(!("geolocation" in navigator)){toast("No location services on this device");return;}
          const msg=$("#ptmMsg",r);if(msg)msg.textContent="Getting a GPS fix…";
          navigator.geolocation.getCurrentPosition(p=>{
            ensureDraft(n);
            mapDraft.pts.push({lat:p.coords.latitude,lon:p.coords.longitude});
            toast(`Corner ${mapDraft.pts.length} set (±${Math.round(p.coords.accuracy||0)} m)`);
            nav.refresh();
          },()=>{if(msg)msg.textContent="Couldn't get a fix — try in the open.";},
          {enableHighAccuracy:true,timeout:20000,maximumAge:5000});
        };
        const draw=$("#ptmDraw",r);
        if(draw)draw.onclick=()=>{
          const n=needName();if(!n)return;
          if(!mapDraft){ ensureDraft(n);
            if(!gates.length&&!lastPos){toast("Need a GPS fix or an existing gate to anchor the map");mapDraft=null;return;}
            toast("Now tap the map to place corners");nav.refresh(); }
        };
        const cap=$("#ptmCap",r);
        if(cap)cap.onclick=()=>{
          const n=needName();if(!n)return;
          const rad=Math.max(15,Math.min(200,parseInt($("#ptmR",r).value)||40));
          if(!("geolocation" in navigator)){toast("No location services on this device");return;}
          const msg=$("#ptmMsg",r);if(msg)msg.textContent="Getting a GPS fix…";
          navigator.geolocation.getCurrentPosition(p=>{
            const l=mload().filter(x=>String(x.gate).toUpperCase()!==n);
            l.push({gate:n,lat:p.coords.latitude,lon:p.coords.longitude,r:rad,at:Date.now()});
            msave(l);mapDraft=null;toast(`${n} captured (±${Math.round(p.coords.accuracy||0)} m)`);nav.refresh();
          },()=>{if(msg)msg.textContent="Couldn't get a fix — try in the open.";},
          {enableHighAccuracy:true,timeout:20000,maximumAge:5000});
        };
        const sv=$("#ptmSave",r);
        if(sv)sv.onclick=()=>{
          if(!mapDraft||mapDraft.pts.length<3)return;
          const l=mload().filter(x=>String(x.gate).toUpperCase()!==mapDraft.gate);
          l.push({gate:mapDraft.gate,poly:mapDraft.pts,at:Date.now()});
          msave(l);toast(`${mapDraft.gate} boundary saved — ${mapDraft.pts.length} corners`);mapDraft=null;nav.refresh();
        };
        const un=$("#ptmUndo",r);if(un)un.onclick=()=>{mapDraft.pts.pop();nav.refresh();};
        const cl=$("#ptmClear",r);if(cl)cl.onclick=()=>{mapDraft=null;nav.refresh();};
        $$("[data-medit]",r).forEach(b=>b.onclick=()=>{const g=mload()[+b.dataset.medit];if(!g)return;
          mapDraft={gate:String(g.gate).toUpperCase(),pts:(g.poly||[]).map(p=>({lat:+p.lat,lon:+p.lon}))};
          toast(`Redrawing ${g.gate} — tap the map or add GPS corners, then Save`);nav.refresh();});
        $$("[data-mrm]",r).forEach(b=>b.onclick=()=>{const l=mload();const g=l[+b.dataset.mrm];
          if(!g||!confirm(`Remove the area for ${g.gate}?`))return;
          l.splice(+b.dataset.mrm,1);msave(l);nav.refresh();});
      }});
    };
  }

  /* ---- cross-window mirror: SOC sends here → the truck sees it there, live ---- */
  // guarded: while SOC is mid-word in any PAATS input (tail entry!), a truck's write must NOT
  // repaint the screen and eat the keystrokes — hold the refresh and flush it on blur.
  let pendingRefresh=false;
  window.addEventListener("storage",e=>{
    if(e.key!==KEY&&e.key!==GKEY&&e.key!==SKEY&&e.key!==MKEY)return;
    updateAttn();
    if(!navApi||!ROOT())return;
    const ae=document.activeElement;
    if(ae&&ae.tagName==="INPUT"&&ROOT().contains(ae)){pendingRefresh=true;return;}
    navApi.refresh();
  });
  updateAttn();   // set the home-tile pulse on load

  window.PAATS={
    open:()=>{ const r=ROOT(); if(!r)return;
      if(!r._ptFlush){r._ptFlush=true;
        r.addEventListener("focusout",()=>{ if(pendingRefresh){pendingRefresh=false;setTimeout(()=>{if(navApi&&ROOT())navApi.refresh();},120);} });}
      navApi=UI.nav(r,{onExit:()=>{try{window.goHome&&window.goHome();}catch(_){}}}); navApi.reset(homeScreen); },
    back:()=>navApi?navApi.back():false,
    refresh:()=>{ if(navApi&&ROOT())navApi.refresh(); }
  };
})();
