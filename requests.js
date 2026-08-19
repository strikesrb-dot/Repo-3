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

  const DEPTS=["Move Team","UGE","Customer Service","Ramp"];
  const TYPES=["Ground Power","Air","Lights","Pushback","Water / Lav","Bag Runner","Other"];
  const KEY="elt.requests", MYDEPT_KEY="elt.requests.dept", MYNAME_KEY="elt.requests.name";

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
    draft=draft||{to:others[0]||"Ramp",type:"Ground Power",gate:"",aircraft:"",note:""};
    const d=draft;
    const body=UI.card(`
      <span class="ui-flabel">From</span>
      <div class="rq-fromlock">${esc(myDept())} · ${esc(myName())}</div>
      <span class="ui-flabel" style="margin-top:12px">To</span>${UI.chips(others,d.to,'data-set="to" data-v')}
      <span class="ui-flabel" style="margin-top:12px">Need</span>${UI.chips(TYPES,d.type,'data-set="type" data-v')}
      <div class="rq-two" style="margin-top:12px">
        <div>${UI.field({label:"Gate",id:"rqGate",value:d.gate,placeholder:"e.g. 109",inputmode:"numeric"})}</div>
        <div>${UI.field({label:"Aircraft",id:"rqAc",value:d.aircraft,placeholder:"e.g. N762YX"})}</div>
      </div>
      ${UI.field({label:"Note (optional)",id:"rqNote",value:d.note,placeholder:"Anything else…"})}
      <div class="btnrow" style="margin-top:14px"><button class="btn" id="rqSend">Send request</button></div>`);
    UI.render(ROOT(),nav,{title:"New request",body,mount:r=>{
      $$(".ui-chip",r).forEach(b=>b.onclick=()=>{syncInputs();d[b.dataset.set]=b.dataset.v;nav.refresh();});
      $("#rqSend",r).onclick=()=>{
        syncInputs();
        if(!d.to||d.to===myDept()){toast("Pick a department to send to");return;}
        if(!d.gate&&!d.aircraft){toast("Add a gate or an aircraft");return;}
        const req={id:"R"+Date.now()+"-"+Math.floor(Math.random()*1e4),from:myDept(),by:myName(),to:d.to,type:d.type,
          gate:d.gate.trim(),aircraft:d.aircraft.trim().toUpperCase(),note:d.note.trim(),when:Date.now(),status:"open"};
        const l=load();l.unshift(req);saveAll(l);
        draft=null;toast("Request sent to "+req.to);
        nav.back(); nav.go(receiveScreen);   // pop the send screen, show receive
      };
    }});
  }
  function syncInputs(){if(!draft)return;const g=$("#rqGate"),a=$("#rqAc"),n=$("#rqNote");if(g)draft.gate=g.value;if(a)draft.aircraft=a.value;if(n)draft.note=n.value;}

  /* ---- screen: receive ---- */
  function receiveScreen(nav){
    const list=load().slice().sort((a,b)=>b.when-a.when);
    const body=list.length?list.map(reqCard).join(""):'<p class="rq-empty">No requests yet.<br>Send one from the Send screen — or from another device/window — and it appears here live.</p>';
    UI.render(ROOT(),nav,{title:"Incoming requests",sub:`Addressed to <b>${esc(myDept())}</b> are highlighted.`,body,mount:r=>{
      $$(".rq-copy",r).forEach(b=>b.onclick=()=>copyReq(b.dataset.id,b));
      $$(".rq-done",r).forEach(b=>b.onclick=()=>{const l=load();const it=l.find(x=>x.id===b.dataset.id);if(it)it.status="done";saveAll(l);nav.refresh();});
    }});
  }
  /* "Priority Surface" card (design-tournament winner): requests addressed to YOUR department are
     the only dark objects in the list — surface + FOR YOU pill + wording = three "mine" channels.
     Gate/aircraft always render (— when empty) so the figures sit in the same x-position card to
     card. Done cards return to white and recede — finished work leaves the priority surface. */
  function reqCard(x){
    const mine=x.to===myDept(), done=x.status==="done";
    return `
    <div class="rq-item rqp${mine?" mine":""}${done?" done":""}" data-id="${esc(x.id)}">
      <div class="rqp-route">
        <span class="rqp-path">${esc(x.from)} <span class="rqp-arr" aria-hidden="true">&rarr;</span> ${esc(x.to)}</span>
        ${mine&&!done?`<span class="rqp-foryou">For you</span>`:""}
        <span class="rqp-who">${x.by?esc(x.by)+" &middot; ":""}${done?"&#10003; ":""}${timeAgo(x.when)}</span>
      </div>
      <div class="rqp-need">${esc(x.type)}</div>
      <div class="rqp-where">
        <span class="rqp-cell"><span class="rqp-lbl">Gate</span><span class="rqp-fig">${esc(x.gate||"—")}</span></span>
        <span class="rqp-cell"><span class="rqp-lbl">Aircraft</span><span class="rqp-fig">${x.aircraft?esc(x.aircraft):"—"}</span></span>
      </div>
      ${x.note?`<div class="rqp-note"><span class="rqp-dot" aria-hidden="true"></span><span class="rqp-notetext">${esc(x.note)}</span></div>`:""}
      <div class="rqp-acts">
        <button class="btn ghost sm rq-copy" data-id="${esc(x.id)}">Copy for Teams</button>
        ${done?`<span class="rqp-doneflag" role="status">&#10003; Done</span>`:`<button class="btn sm rq-done" data-id="${esc(x.id)}" aria-label="Mark request done">Mark done</button>`}
      </div>
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
    ctx.fillStyle="#f7f4f0";ctx.fillRect(0,0,W,H);
    ctx.fillStyle="#ffffff";roundRect(ctx,14,14,W-28,H-28,18);ctx.fill();
    ctx.fillStyle="#0a1f44";roundRect(ctx,14,14,W-28,66,18);ctx.fill();ctx.fillRect(14,54,W-28,26);
    ctx.fillStyle="#ffffff";ctx.textAlign="left";ctx.font="600 16px "+FA;ctx.fillText("REQUEST · "+x.from.toUpperCase()+"  →  "+x.to.toUpperCase(),36,52);
    ctx.textAlign="right";ctx.fillStyle="#a6e3f5";ctx.font="600 14px "+FA;if(x.by)ctx.fillText(x.by,W-36,52);
    ctx.textAlign="left";ctx.fillStyle="#0033a0";ctx.font="600 38px "+FA;ctx.fillText(clip(ctx,"NEED "+String(x.type).toUpperCase(),W-72),36,136);
    // labeled figures — GATE | AIRCRAFT
    ctx.fillStyle="#5c6470";ctx.font="600 12px "+FA;
    ctx.fillText("GATE",36,170);ctx.fillText("AIRCRAFT",216,170);
    ctx.fillStyle="#0a1f44";ctx.font="600 30px "+FA;
    ctx.fillText(clip(ctx,x.gate||"—",160),36,202);ctx.fillText(clip(ctx,x.aircraft||"—",260),216,202);
    if(x.note){ctx.fillStyle="#5c6470";ctx.font="400 15px "+FA;ctx.fillText(clip(ctx,x.note,W-72),36,240);}
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
  window.REQUESTS={
    open:()=>{ const r=ROOT(); if(!r)return; navApi=UI.nav(r,{onExit:()=>{try{window.goHome&&window.goHome();}catch(_){}}});
      navApi.reset(hasIdentity()?menuScreen:identityScreen); },
    back:()=>navApi?navApi.back():false
  };
})();
