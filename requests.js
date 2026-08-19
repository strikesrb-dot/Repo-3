/* requests.js — cross-department Send/Receive request client.
   Built on the UI kit (ui.js): every screen is a function fn(nav) that calls UI.render(...), so all
   three screens share one look and always have a working back button. Requests live in localStorage
   (elt.requests) and mirror across windows via the 'storage' event (Send here → Receive there, no
   network — the pitch demo). Uses the global Store + toast. */
(function(){
  const esc=UI.esc;
  const $=(s,r)=>(r||document).querySelector(s);
  const $$=(s,r)=>[...(r||document).querySelectorAll(s)];
  const toast=m=>{try{if(window.toast)window.toast(m);}catch(_){}}
  const ROOT=()=>$("#requestsRoot");

  const DEPTS=["Move Team","UGE","Tech Ops","Ramp","SOC","Customer Service"];
  const TYPES=["Ground Power","Air","Lights","Pushback","Water / Lav","Bag Runner","Other"];
  /* Sender identity — every department has a brand color so a card reads "who's asking" at a
     glance. Text pairings are AA on each band. Unknown/legacy departments fall back to United blue. */
  const DEPT_BRAND={
    "UGE":              {bg:"#141414", fg:"#ff8a1e", edge:"#ff8a1e"},   // United Ground Express: black + orange
    "Tech Ops":         {bg:"#f97316", fg:"#221100"},                    // straight orange
    "Move Team":        {bg:"#fc4c4e", fg:"#3f0a10"},                    // watermelon red
    "Ramp":             {bg:"#cbf22c", fg:"#1a2000"},                    // neon green-yellow
    "SOC":              {bg:"#000000", fg:"#ffffff"},                    // straight black
    "Customer Service": {bg:"#0033a0", fg:"#ffffff"}                     // United blue
  };
  const brandOf=d=>DEPT_BRAND[d]||{bg:"#0033a0",fg:"#ffffff"};
  const DECLINE_REASONS=["Already has power","Already done","MX hold","No equipment available","Wrong department"];
  const ARCHIVE_DAYS=7;   // completed/declined requests auto-purge after a week
  const KEY="elt.requests", MYDEPT_KEY="elt.requests.dept", MYNAME_KEY="elt.requests.name";

  // fleet lookup (aircraft.json: {ship, reg, type}) — resolves a tail or ship number to the type
  let FLEET=null;
  fetch("aircraft.json").then(r=>r.json()).then(d=>{FLEET=(d&&d.aircraft)||[];if(navApi&&ROOT())navApi.refresh();}).catch(()=>{FLEET=[];});
  function acType(t){
    if(!FLEET||!t)return "";
    const n=String(t).trim().toUpperCase();
    const hit=FLEET.find(a=>a.reg===n||a.reg.slice(1)===n||a.ship===n||("N"+n)===a.reg);
    return hit?hit.type:"";
  }

  const load=()=>{const d=Store.getJSON(KEY,[]);return Array.isArray(d)?d:[];};
  const saveAll=l=>Store.setJSON(KEY,l);
  const myDept=()=>Store.getJSON(MYDEPT_KEY,"");
  const myName=()=>Store.getJSON(MYNAME_KEY,"");
  const hasIdentity=()=>!!(myDept()&&myName());

  let navApi=null, draft=null;

  /* ---- screen: identity (who's working) — gate before the module opens ------------------------
     Department + name are set HERE, deliberately, and lock the From side of every request.
     No inline switcher elsewhere: changing identity means coming back through this screen. */
  let idPick=null;
  function identityScreen(nav){
    idPick=idPick||myDept()||null;
    const body=UI.card(`
      <span class="ui-flabel">Your department</span>${UI.chips(DEPTS,idPick,'data-dept')}
      ${UI.field({label:"Your name",id:"idName",value:myName(),placeholder:"First name or initials"})}
      <div class="btnrow" style="margin-top:14px"><button class="btn" id="idGo">Continue</button></div>`);
    UI.render(ROOT(),nav,{title:"Who's working?",sub:"Requests you send are signed with this. Your department decides what's highlighted for you.",body,mount:r=>{
      $$(".ui-chip",r).forEach(b=>b.onclick=()=>{idPick=b.dataset.dept;nav.refresh();});
      $("#idGo",r).onclick=()=>{
        const nm=($("#idName").value||"").trim();
        if(!idPick){toast("Pick your department");return;}
        if(!nm){toast("Enter your name");return;}
        Store.setJSON(MYDEPT_KEY,idPick);Store.setJSON(MYNAME_KEY,nm);
        idPick=null;nav.reset(menuScreen);
      };
    }});
  }

  /* ---- screen: menu ---- */
  function menuScreen(nav){
    const mine=load().filter(x=>x.to===myDept()&&x.status!=="done").length;
    const body=`
      <div class="rq-idrow"><span>Working as <b>${esc(myName())}</b> · ${esc(myDept())}</span>
        <button class="link-more" id="rqSwitch" style="font-size:14px">Switch</button></div>
      <div class="rq-tiles">
        ${UI.tile({icon:'<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7Z"/></svg>',title:"Send",sub:"Make a request to another department",attr:'data-v="send"'})}
        ${UI.tile({icon:'<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',title:"Receive",sub:`Requests sent to you${mine?` · <b>${mine} new</b>`:""}`,tone:"navy",attr:'data-v="receive"'})}
      </div>`;
    UI.render(ROOT(),nav,{title:"Requests",sub:"Structured requests between departments — no more digging through chat threads.",body,mount:r=>{
      $("#rqSwitch",r).onclick=()=>{ if(confirm("Switch department or name? Requests you send are signed with your identity."))nav.go(identityScreen); };
      $$(".ui-tile",r).forEach(b=>b.onclick=()=>nav.go(b.dataset.v==="send"?sendScreen:receiveScreen));
    }});
  }

  /* ---- screen: send ---- */
  function sendScreen(nav){
    const others=DEPTS.filter(x=>x!==myDept());
    draft=draft||{to:others[0]||"Ramp",type:"Ground Power",loc:"",aircraft:"",note:""};
    const d=draft;
    const body=UI.card(`
      <span class="ui-flabel">From</span>
      <div class="rq-fromlock">${esc(myDept())} · ${esc(myName())}</div>
      <span class="ui-flabel" style="margin-top:12px">To</span>${UI.chips(others,d.to,'data-set="to" data-v')}
      <span class="ui-flabel" style="margin-top:12px">Need</span>${UI.chips(TYPES,d.type,'data-set="type" data-v')}
      <div class="rq-two" style="margin-top:12px">
        <div>${UI.field({label:"Location",id:"rqLoc",value:d.loc,placeholder:"Gate 109 · Spot 12 · pad"})}</div>
        <div>${UI.field({label:"Aircraft",id:"rqAc",value:d.aircraft,placeholder:"Tail or ship number"})}</div>
      </div>
      ${UI.field({label:"Note (optional)",id:"rqNote",value:d.note,placeholder:"Anything else…"})}
      <div class="btnrow" style="margin-top:14px"><button class="btn" id="rqSend">Send request</button></div>`);
    UI.render(ROOT(),nav,{title:"New request",body,mount:r=>{
      $$(".ui-chip",r).forEach(b=>b.onclick=()=>{syncInputs();d[b.dataset.set]=b.dataset.v;nav.refresh();});
      $("#rqSend",r).onclick=()=>{
        syncInputs();
        if(!d.to||d.to===myDept()){toast("Pick a department to send to");return;}
        if(!d.loc&&!d.aircraft){toast("Add a location or an aircraft");return;}
        const req={id:"R"+Date.now()+"-"+Math.floor(Math.random()*1e4),from:myDept(),by:myName(),to:d.to,type:d.type,
          loc:d.loc.trim(),aircraft:d.aircraft.trim().toUpperCase(),note:d.note.trim(),when:Date.now(),status:"open"};
        const l=load();l.unshift(req);saveAll(l);
        draft=null;toast("Request sent to "+req.to);
        nav.back(); nav.go(receiveScreen);   // pop the send screen, show receive
      };
    }});
  }
  function syncInputs(){if(!draft)return;const g=$("#rqLoc"),a=$("#rqAc"),n=$("#rqNote");if(g)draft.loc=g.value;if(a)draft.aircraft=a.value;if(n)draft.note=n.value;}

  /* ---- screen: receive (open inbox + archive) ----------------------------------------------------
     Lifecycle: open → done (one tap) or declined (reason chips: "Already has power", "MX hold"…).
     The sender sees the outcome + feedback on their card, live. Completed/declined requests move to
     the Archive section and auto-purge after ARCHIVE_DAYS — no manual deletion. */
  let showArchive=false, declining=null;   // declining = id of the card showing the reason picker
  function receiveScreen(nav){
    const all=load().slice().sort((a,b)=>b.when-a.when);
    const open=all.filter(x=>x.status==="open"), arch=all.filter(x=>x.status!=="open");
    const body=`
      ${open.length?open.map(reqCard).join(""):'<p class="rq-empty">No open requests.<br>Send one from the Send screen — or from another device/window — and it appears here live.</p>'}
      ${arch.length?`<div class="rq-archrow"><button class="link-more" id="rqArch">${showArchive?"Hide archive":"Archive ("+arch.length+")"}</button>
        <span class="rq-archhint">Completed requests clear after ${ARCHIVE_DAYS} days.</span></div>`:""}
      ${showArchive?arch.map(reqCard).join(""):""}`;
    UI.render(ROOT(),nav,{title:"Incoming requests",sub:`Addressed to <b>${esc(myDept())}</b> are highlighted.`,body,mount:r=>{
      $("#rqArch",r)&&($("#rqArch").onclick=()=>{showArchive=!showArchive;nav.refresh();});
      $$(".rq-copy",r).forEach(b=>b.onclick=()=>copyReq(b.dataset.id,b));
      $$(".rq-done",r).forEach(b=>b.onclick=()=>{const l=load();const it=l.find(x=>x.id===b.dataset.id);
        if(it){it.status="done";it.fb={by:myName(),dept:myDept(),when:Date.now(),text:""};}saveAll(l);declining=null;nav.refresh();});
      $$(".rq-reopen",r).forEach(b=>b.onclick=()=>{const l=load();const it=l.find(x=>x.id===b.dataset.id);
        if(it){it.status="open";delete it.fb;}saveAll(l);toast("Request reopened");nav.refresh();});
      $$(".rq-cant",r).forEach(b=>b.onclick=()=>{declining=b.dataset.id;nav.refresh();});
      $$(".rq-declcancel",r).forEach(b=>b.onclick=()=>{declining=null;nav.refresh();});
      $$(".rq-reason",r).forEach(b=>b.onclick=()=>declineReq(b.dataset.id,b.dataset.r,nav));
      $$(".rq-reasonsend",r).forEach(b=>b.onclick=()=>{const t=($("#rqReasonTxt")&&$("#rqReasonTxt").value||"").trim();
        if(!t){toast("Type a reason");return;}declineReq(b.dataset.id,t,nav);});
    }});
  }
  function declineReq(id,reason,nav){
    const l=load();const it=l.find(x=>x.id===id);if(!it)return;
    it.status="declined";it.fb={by:myName(),dept:myDept(),when:Date.now(),text:reason};
    saveAll(l);declining=null;toast("Reply sent to "+it.from);nav.refresh();
  }
  /* "Priority Surface" card (design-tournament winner): requests addressed to YOUR department are
     the only dark objects in the list — surface + FOR YOU pill + wording = three "mine" channels.
     Gate/aircraft always render (— when empty) so the figures sit in the same x-position card to
     card. Done cards return to white and recede — finished work leaves the priority surface. */
  function reqCard(x){
    const mine=x.to===myDept(), done=x.status==="done", decl=x.status==="declined", closed=done||decl;
    const loc=x.loc||x.gate||"";                      // old records stored the field as "gate"
    const type=acType(x.aircraft);
    const fb=x.fb||null;
    const actions = declining===x.id
      ? `<div class="rqp-declpick">
           <span class="rqp-lbl" style="margin-bottom:6px">Why can't it be completed?</span>
           <div class="ui-chips">${DECLINE_REASONS.map(rr=>`<button class="ui-chip rq-reason" data-id="${esc(x.id)}" data-r="${esc(rr)}">${esc(rr)}</button>`).join("")}</div>
           <div class="rqp-declrow"><input id="rqReasonTxt" placeholder="Or type a reason…" autocomplete="off">
             <button class="btn sm rq-reasonsend" data-id="${esc(x.id)}">Send</button>
             <button class="btn ghost sm rq-declcancel">Cancel</button></div>
         </div>`
      : `<div class="rqp-acts">
           <button class="btn ghost sm rq-copy" data-id="${esc(x.id)}">Copy for Teams</button>
           ${closed?`<button class="link-more rq-reopen" data-id="${esc(x.id)}" style="font-size:14px">Reopen</button>`:""}
           ${done?`<span class="rqp-doneflag" role="status">&#10003; Done${fb&&fb.by?" &middot; "+esc(fb.by):""}</span>`
             :decl?`<span class="rqp-declflag" role="status">&#10005; Can't complete</span>`
             :`<button class="btn ghost sm rq-cant" data-id="${esc(x.id)}">Can't do</button>
                <button class="btn sm rq-done" data-id="${esc(x.id)}" aria-label="Mark request done">Mark done</button>`}
         </div>`;
    const br=brandOf(x.from);
    return `
    <div class="rq-item rqp${mine&&!closed?" mine":""}${closed?" done":""}" data-id="${esc(x.id)}">
      <div class="rqp-band" style="background:${br.bg};color:${br.fg};${br.edge?`box-shadow:inset 0 -3px 0 ${br.edge};`:""}">
        <span class="rqp-bandfrom">${esc(x.from)} is requesting</span>
        <span class="rqp-bandto">&rarr; ${esc(x.to)}</span>
        ${mine&&!closed?`<span class="rqp-foryou">For you</span>`:""}
        <span class="rqp-bandwho">${x.by?esc(x.by)+" &middot; ":""}${done?"&#10003; ":""}${timeAgo(x.when)}</span>
      </div>
      <div class="rqp-need">${esc(x.type)}</div>
      <div class="rqp-where">
        <span class="rqp-cell"><span class="rqp-lbl">Location</span><span class="rqp-fig">${esc(loc||"—")}</span></span>
        <span class="rqp-cell"><span class="rqp-lbl">Aircraft</span><span class="rqp-fig">${x.aircraft?esc(x.aircraft):"—"}</span>
          ${type?`<span class="rqp-type">${esc(type)}</span>`:""}</span>
      </div>
      ${x.note?`<div class="rqp-note"><span class="rqp-dot" aria-hidden="true"></span><span class="rqp-notetext">${esc(x.note)}</span></div>`:""}
      ${fb&&fb.text?`<div class="rqp-fb"><span class="rqp-lbl">Reply from ${esc(fb.dept||"")}${fb.by?" &middot; "+esc(fb.by):""}</span><span class="rqp-fbtext">${esc(fb.text)}</span></div>`:""}
      ${actions}
    </div>`;
  }
  function timeAgo(t){const s=Math.max(0,Math.round((Date.now()-t)/1000));if(s<60)return "just now";const m=Math.round(s/60);if(m<60)return m+"m ago";const h=Math.round(m/60);if(h<24)return h+"h ago";return Math.round(h/24)+"d ago";}

  /* ---- copy a request as a small image for Teams ---- */
  function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
  function clip(ctx,t,maxW){t=String(t||"");if(ctx.measureText(t).width<=maxW)return t;while(t.length>1&&ctx.measureText(t+"…").width>maxW)t=t.slice(0,-1);return t+"…";}
  // Teams PNG mirrors the card's read order: navy band (from/to), need in caps, then GATE and
  // AIRCRAFT as big labeled figures — what lands in chat is recognizably the same object.
  function reqCanvas(x){
    const W=540,H=300,S=2,FA="-apple-system,Segoe UI,Roboto,Arial,sans-serif";
    const c=document.createElement("canvas");c.width=W*S;c.height=H*S;const ctx=c.getContext("2d");ctx.scale(S,S);
    const br=brandOf(x.from);
    ctx.fillStyle="#f7f4f0";ctx.fillRect(0,0,W,H);
    ctx.fillStyle="#ffffff";roundRect(ctx,14,14,W-28,H-28,18);ctx.fill();
    ctx.fillStyle=br.bg;roundRect(ctx,14,14,W-28,66,18);ctx.fill();ctx.fillRect(14,54,W-28,26);
    if(br.edge){ctx.fillStyle=br.edge;ctx.fillRect(14,77,W-28,3);}
    ctx.fillStyle=br.fg;ctx.textAlign="left";ctx.font="600 15px "+FA;
    ctx.fillText(clip(ctx,x.from.toUpperCase()+" IS REQUESTING  →  "+x.to.toUpperCase(),W-170),36,52);
    ctx.textAlign="right";ctx.font="600 13px "+FA;if(x.by)ctx.fillText(x.by,W-36,52);
    ctx.textAlign="left";ctx.fillStyle="#0033a0";ctx.font="600 38px "+FA;ctx.fillText(clip(ctx,"NEED "+String(x.type).toUpperCase(),W-72),36,136);
    // labeled figures — LOCATION | AIRCRAFT (+ type from the fleet database)
    ctx.fillStyle="#5c6470";ctx.font="600 12px "+FA;
    ctx.fillText("LOCATION",36,170);ctx.fillText("AIRCRAFT",256,170);
    ctx.fillStyle="#0a1f44";ctx.font="600 30px "+FA;
    ctx.fillText(clip(ctx,(x.loc||x.gate||"—"),200),36,202);ctx.fillText(clip(ctx,x.aircraft||"—",220),256,202);
    const ty=acType(x.aircraft);
    if(ty){ctx.fillStyle="#5c6470";ctx.font="400 13px "+FA;ctx.fillText(clip(ctx,ty,220),256,222);}
    if(x.note){ctx.fillStyle="#5c6470";ctx.font="400 15px "+FA;ctx.fillText(clip(ctx,x.note,W-72),36,244);}
    ctx.fillStyle="#8d8983";ctx.textAlign="right";ctx.font="400 12px "+FA;ctx.fillText(new Date(x.when).toLocaleString(),W-36,H-30);
    return c;
  }
  function copyReq(id,btn){
    const x=load().find(r=>r.id===id);if(!x)return;
    const canvas=reqCanvas(x);
    canvas.toBlob(blob=>{
      if(blob&&navigator.clipboard&&window.ClipboardItem){
        navigator.clipboard.write([new ClipboardItem({"image/png":blob})]).then(()=>{
          if(btn){btn.classList.add("is-copied");btn.textContent="Copied ✓";
            setTimeout(()=>{btn.classList.remove("is-copied");btn.textContent="Copy for Teams";},1200);}
          else toast("Copied — paste into Teams");
        }).catch(()=>showImage(canvas));
      }else showImage(canvas);
    },"image/png");
  }
  function showImage(canvas){
    const back=document.createElement("div");back.className="rq-imgback";
    back.innerHTML=`<div class="rq-imgbox"><img src="${canvas.toDataURL("image/png")}" alt="request"><p class="rq-imghint">Long-press the image to copy or save, then paste into Teams.</p><button class="btn ghost" id="rqImgClose">Close</button></div>`;
    back.onclick=e=>{if(e.target===back||e.target.id==="rqImgClose")back.remove();};
    document.body.appendChild(back);
  }

  /* ---- cross-window mirror (Send here → Receive there, no network) ---- */
  window.addEventListener("storage",e=>{ if(e.key!==KEY)return; if(navApi&&ROOT())navApi.refresh(); });

  /* ---- module entry ---- */
  // archive hygiene: completed/declined requests older than ARCHIVE_DAYS purge on open
  function purgeArchive(){
    const cut=Date.now()-ARCHIVE_DAYS*86400000;
    const l=load();const kept=l.filter(x=>x.status==="open"||((x.fb&&x.fb.when)||x.when)>cut);
    if(kept.length!==l.length)saveAll(kept);
  }
  window.REQUESTS={
    open:()=>{ const r=ROOT(); if(!r)return; purgeArchive(); navApi=UI.nav(r,{onExit:()=>{try{window.goHome&&window.goHome();}catch(_){}}});
      navApi.reset(hasIdentity()?menuScreen:identityScreen); },
    back:()=>navApi?navApi.back():false
  };
})();
