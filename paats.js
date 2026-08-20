/* paats.js — PAATS lightning-hold dispatch. During ramp closures the PAATS guide trucks bring
   aircraft in; today the assignment travels by radio and handwriting. Here SOC sends a structured
   dispatch (gate · aircraft · flight · task) to PAATS 1/2/3; the truck acknowledges with one tap,
   then logs the outcome — Parked, or Couldn't park with a reason. Every dispatch is kept in the
   log, so there is zero loss in translation and a record of what blocked the failures.
   UI-kit module: screens are fn(nav) on a UI.nav stack; storage-event mirror keeps SOC and the
   trucks live across devices with no network. */
(function(){
  const esc=UI.esc;
  const $=(s,r)=>(r||document).querySelector(s);
  const $$=(s,r)=>[...(r||document).querySelectorAll(s)];
  const ROOT=()=>$("#paatsRoot");
  let navApi=null;

  const KEY="elt.paats";
  const TRUCKS=[1,2,3];
  const TASKS=["Park it","Bring it in","Reposition"];
  const CANT_REASONS=["Equipment blocking the gate","Gate occupied","Aircraft not there","Sent to another gate","Called off"];
  const KEEP_DAYS=14;

  const load=()=>{const d=Store.getJSON(KEY,[]);return Array.isArray(d)?d:[];};
  const saveAll=l=>Store.setJSON(KEY,l);
  const purge=()=>{const cut=Date.now()-KEEP_DAYS*86400000;const l=load();const k=l.filter(x=>(x.when||0)>cut);if(k.length!==l.length)saveAll(k);};
  const uid=()=>"p"+Date.now().toString(36)+Math.floor(Math.random()*1e4).toString(36);
  const timeAgo=t=>{const m=Math.max(0,Math.round((Date.now()-t)/60000));return m<1?"just now":m<60?m+"m ago":Math.round(m/60)+"h ago";};
  const hhmm=t=>new Date(t).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});

  // fleet lookup — same source as Requests (aircraft.json: {ship, reg, type})
  let FLEET=null;
  fetch("aircraft.json").then(r=>r.json()).then(d=>{FLEET=(d&&d.aircraft)||[];}).catch(()=>{FLEET=[];});
  const acType=t=>{if(!FLEET||!t)return "";const n=String(t).trim().toUpperCase();
    const hit=FLEET.find(a=>a.reg===n||a.reg.slice(1)===n||a.ship===n||("N"+n)===a.reg);
    return hit?hit.type:"";};
  const shortType=t=>String(t||"").replace(/^(Boeing|Airbus|Embraer|Bombardier)\s*/,"");

  /* ================= home: SOC + the three trucks + the log ================= */
  function homeScreen(nav){
    purge();
    const all=load();
    const openFor=n=>all.filter(x=>x.truck===n&&(x.status==="open"||x.status==="ack"));
    const truckTiles=TRUCKS.map(n=>{const q=openFor(n);const waiting=q.filter(x=>x.status==="open").length;
      return `<button class="ui-tile t-navy pt-truck" data-truck="${n}">
        <span class="ui-tile-t">PAATS ${n}</span>
        <span class="ui-tile-s">${q.length?`${waiting?`<b>${waiting} waiting</b>`:""}${waiting&&q.length-waiting?" · ":""}${q.length-waiting?`${q.length-waiting} on it`:""}`:"clear"}</span>
      </button>`;}).join("");
    const body=`
      ${UI.tile({title:"SOC — dispatch a truck",sub:"gate · aircraft · flight · task, straight to the crew",attr:'data-go="soc"'})}
      <div class="pt-trucks">${truckTiles}</div>
      <div class="ui-group" style="margin-top:12px">
        <button class="ui-row" data-go="log">
          <div class="ui-row__main"><div class="ui-row__title">Log</div>
            <div class="ui-row__sub">Every dispatch — parked or not, and why</div></div>
          <span class="ui-row__value">${all.filter(x=>x.status==="done"||x.status==="unable").length||""}</span>
          <span class="ui-row__chev" aria-hidden="true"></span>
        </button>
      </div>`;
    UI.render(ROOT(),nav,{title:"PAATS",sub:"Lightning-hold dispatch — zero loss in translation.",body,mount:r=>{
      $('[data-go="soc"]',r).onclick=()=>nav.go(socScreen);
      $$(".pt-truck",r).forEach(t=>t.onclick=()=>nav.go(truckScreen(+t.dataset.truck)));
      $('[data-go="log"]',r).onclick=()=>nav.go(logScreen);
    }});
  }

  /* ================= SOC: send a dispatch ================= */
  let d={truck:1,gate:"",aircraft:"",flight:"",task:TASKS[0],note:""};
  function socScreen(nav){
    const sent=load().filter(x=>x.status!=="done"&&x.status!=="unable").sort((a,b)=>b.when-a.when).slice(0,8);
    const sentRows=sent.map(x=>`<div class="ui-row" style="cursor:default">
        <div class="ui-row__main"><div class="ui-row__title">PAATS ${x.truck} &middot; ${esc(x.gate||"—")} &middot; ${esc(x.aircraft||"")}</div>
          <div class="ui-row__sub">${esc(x.task||"")}${x.flight?" · "+esc(x.flight):""} · ${timeAgo(x.when)}</div></div>
        <span class="ui-row__value">${x.status==="ack"?'<span class="pt-st ok">On it</span>':'<span class="pt-st">Sent</span>'}</span>
      </div>`).join("");
    const body=`${UI.card(`
        <span class="ui-flabel">Which truck</span>
        ${UI.chips(TRUCKS.map(n=>({v:String(n),label:"PAATS "+n})),String(d.truck),'data-set="truck" data-v')}
        <div class="rq-two" style="margin-top:12px">
          <div>${UI.field({label:"Gate",id:"ptGate",value:d.gate,placeholder:"e.g. C109"})}</div>
          <div>${UI.field({label:"Flight (optional)",id:"ptFlight",value:d.flight,placeholder:"e.g. UA1234"})}</div>
        </div>
        <div class="ui-ta-wrap" style="margin-top:12px">${UI.field({label:"Aircraft",id:"ptAc",value:d.aircraft,placeholder:"Tail or ship number"})}
          <div class="ui-ta-list" id="ptAcList" hidden></div></div>
        <span class="ui-flabel" style="margin-top:12px">Task</span>
        ${UI.chips(TASKS,d.task,'data-set="task" data-v')}
        ${UI.field({label:"Note (optional)",id:"ptNote",value:d.note,placeholder:"Anything the crew should know…"})}
        <div class="btnrow" style="margin-top:14px"><button class="btn" id="ptSend">Send to PAATS ${d.truck}</button></div>`)}
      ${sent.length?`<div class="rq-sechead" style="margin-top:18px">In flight <b>${sent.length}</b></div><div class="ui-group">${sentRows}</div>`:""}`;
    UI.render(ROOT(),nav,{title:"SOC dispatch",sub:"The crew gets the whole assignment — nothing read over the radio.",body,mount:r=>{
      const sync=()=>{d.gate=$("#ptGate",r).value;d.flight=$("#ptFlight",r).value;d.aircraft=$("#ptAc",r).value;d.note=$("#ptNote",r).value;};
      $$('.ui-chip[data-set="truck"]',r).forEach(b=>b.onclick=()=>{sync();d.truck=+b.dataset.v;nav.refresh();});
      $$('.ui-chip[data-set="task"]',r).forEach(b=>b.onclick=()=>{sync();d.task=b.dataset.v;nav.refresh();});
      const acIn=$("#ptAc",r),acList=$("#ptAcList",r);
      if(acIn&&acList)UI.typeahead(acIn,acList,{min:2,source:q=>{
        if(!FLEET)return [];
        const Q=q.toUpperCase();
        return FLEET.filter(a=>a.reg.includes(Q)||a.ship.startsWith(Q)).slice(0,20)
          .map(a=>({v:a.reg,label:a.reg,cap:(a.ship?"ship "+a.ship+" · ":"")+a.type}));
      },onPick:v=>{d.aircraft=v;}});
      $("#ptSend",r).onclick=()=>{
        sync();
        if(!d.gate.trim()){toast("Enter the gate");$("#ptGate",r).focus();return;}
        if(!d.aircraft.trim()){toast("Enter the aircraft");$("#ptAc",r).focus();return;}
        const l=load();
        l.push({id:uid(),truck:d.truck,gate:d.gate.trim(),aircraft:d.aircraft.trim().toUpperCase(),
          actype:acType(d.aircraft),flight:d.flight.trim().toUpperCase(),task:d.task,note:d.note.trim(),
          by:(window.oosWho&&oosWho())||"SOC",when:Date.now(),status:"open"});
        saveAll(l);
        toast(`Sent to PAATS ${d.truck}`);
        d={truck:d.truck,gate:"",aircraft:"",flight:"",task:d.task,note:""};
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
              <div class="ui-chips" style="margin-top:6px">${CANT_REASONS.map(rr=>`<button class="ui-chip pt-reason" data-id="${esc(x.id)}" data-r="${esc(rr)}">${esc(rr)}</button>`).join("")}</div>
              <div class="rqp-declrow"><input id="ptReasonTxt" placeholder="Or type what happened…" autocomplete="off">
                <button class="btn sm pt-reasonsend" data-id="${esc(x.id)}">Log it</button>
                <button class="btn ghost sm pt-declcancel">Cancel</button></div>
            </div>`
          :x.status==="open"
            ?`<div class="btnrow" style="margin-top:12px"><button class="btn" data-ack="${esc(x.id)}">Acknowledge — on it</button></div>`
            :`<div class="btnrow" style="margin-top:12px">
                <button class="btn green" data-done="${esc(x.id)}">&#10003; Parked</button>
                <button class="btn ghost" data-cant="${esc(x.id)}" style="flex:0 0 44%">Couldn't park</button>
              </div>`;
        return `<div class="ui-card pt-card${x.status==="ack"?" onit":""}">
          <div class="pt-eyebrow">SOC &rarr; PAATS ${n} · ${x.by?esc(x.by)+" · ":""}${timeAgo(x.when)}${x.status==="ack"?' · <b>acknowledged</b>':""}</div>
          <div class="pt-gate">${esc(x.gate)}</div>
          <div class="pt-ac">${esc(x.aircraft)}${x.actype?` <span>${esc(shortType(x.actype))}</span>`:""}${x.flight?` · ${esc(x.flight)}`:""}</div>
          <div class="pt-task">${esc(x.task||"")}</div>
          ${x.note?`<div class="rqp-note" style="margin:10px 0 0"><span class="rqp-dot" aria-hidden="true"></span><span class="rqp-notetext">${esc(x.note)}</span></div>`:""}
          ${acts}
        </div>`;}).join("")
        ||`<p class="rq-empty">Nothing dispatched to PAATS ${n} right now.<br>New assignments from SOC appear here live.</p>`;
      UI.render(ROOT(),nav,{title:`PAATS ${n}`,sub:q.length?`${q.length} assignment${q.length===1?"":"s"} — oldest first.`:"Standing by.",body:cards,mount:r=>{
        const upd=(id,patch)=>{const l=load();const it=l.find(y=>y.id===id);if(it)Object.assign(it,patch);saveAll(l);declining=null;nav.refresh();};
        $$("[data-ack]",r).forEach(b=>b.onclick=()=>upd(b.dataset.ack,{status:"ack",ackAt:Date.now()}));
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
    const body=Object.keys(byDate).map(dk=>`
      <div class="rq-sechead">${esc(dk)}</div>
      <div class="ui-group">${byDate[dk].map(x=>`
        <div class="ui-row" style="cursor:default">
          <div class="ui-row__main">
            <div class="ui-row__title">PAATS ${x.truck} &middot; ${esc(x.gate)} &middot; ${esc(x.aircraft)}${x.actype?` <span style="color:var(--muted);font-size:13px">${esc(shortType(x.actype))}</span>`:""}</div>
            <div class="ui-row__sub">${x.flight?esc(x.flight)+" · ":""}${esc(x.task||"")} · ${hhmm(x.endAt||x.when)}${x.status==="unable"&&x.reason?` · <span style="color:var(--ua-red)">${esc(x.reason)}</span>`:""}</div>
          </div>
          <span class="ui-row__value">${x.status==="done"?'<span class="pt-st ok">&#10003; Parked</span>':'<span class="pt-st bad">&#10005; Not parked</span>'}</span>
        </div>`).join("")}</div>`).join("")
      ||`<p class="rq-empty">No completed dispatches yet.<br>Parked and couldn't-park outcomes land here.</p>`;
    UI.render(ROOT(),nav,{title:"PAATS log",sub:`Every outcome, kept ${KEEP_DAYS} days.`,body,mount:()=>{}});
  }

  /* ---- cross-window mirror: SOC sends here → the truck sees it there, live ---- */
  window.addEventListener("storage",e=>{ if(e.key!==KEY)return; if(navApi&&ROOT())navApi.refresh(); });

  window.PAATS={
    open:()=>{ const r=ROOT(); if(!r)return; navApi=UI.nav(r,{onExit:()=>{try{window.goHome&&window.goHome();}catch(_){}}}); navApi.reset(homeScreen); },
    back:()=>navApi?navApi.back():false,
    refresh:()=>{ if(navApi&&ROOT())navApi.refresh(); }
  };
})();
