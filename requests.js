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
      $$(".rq-copy",r).forEach(b=>b.onclick=()=>copyReq(b.dataset.id));
      $$(".rq-done",r).forEach(b=>b.onclick=()=>{const l=load();const it=l.find(x=>x.id===b.dataset.id);if(it)it.status="done";saveAll(l);nav.refresh();});
    }});
  }
  function reqCard(x){
    const mine=x.to===myDept();
    return `<div class="rq-item ${mine?"mine":""} ${x.status==="done"?"done":""}">
      <div class="rqi-top"><span class="rqi-from">From <b>${esc(x.from)}</b>${x.by?` · ${esc(x.by)}`:""}</span><span class="rqi-arrow">→</span><span class="rqi-to">${esc(x.to)}</span><span class="rqi-time">${timeAgo(x.when)}</span></div>
      <div class="rqi-need">NEED ${esc(String(x.type).toUpperCase())}</div>
      <div class="rqi-meta">${x.gate?`Gate <b>${esc(x.gate)}</b>`:""}${x.gate&&x.aircraft?" · ":""}${x.aircraft?`<b>${esc(x.aircraft)}</b>`:""}</div>
      ${x.note?`<div class="rqi-note">${esc(x.note)}</div>`:""}
      <div class="rqi-acts"><button class="btn ghost sm rq-copy" data-id="${esc(x.id)}">Copy for Teams</button>${x.status==="done"?'<span class="rqi-doneflag">✓ Done</span>':`<button class="btn good sm rq-done" data-id="${esc(x.id)}">Mark done</button>`}</div>
    </div>`;
  }
  function timeAgo(t){const s=Math.max(0,Math.round((Date.now()-t)/1000));if(s<60)return "just now";const m=Math.round(s/60);if(m<60)return m+"m ago";const h=Math.round(m/60);if(h<24)return h+"h ago";return Math.round(h/24)+"d ago";}

  /* ---- copy a request as a small image for Teams ---- */
  function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
  function clip(ctx,t,maxW){t=String(t||"");if(ctx.measureText(t).width<=maxW)return t;while(t.length>1&&ctx.measureText(t+"…").width>maxW)t=t.slice(0,-1);return t+"…";}
  function reqCanvas(x){
    const W=540,H=286,S=2,FA="-apple-system,Segoe UI,Roboto,Arial,sans-serif";
    const c=document.createElement("canvas");c.width=W*S;c.height=H*S;const ctx=c.getContext("2d");ctx.scale(S,S);
    ctx.fillStyle="#eef2f6";ctx.fillRect(0,0,W,H);
    ctx.fillStyle="#ffffff";roundRect(ctx,14,14,W-28,H-28,20);ctx.fill();
    ctx.fillStyle="#0b3d63";roundRect(ctx,14,14,W-28,66,20);ctx.fill();ctx.fillRect(14,54,W-28,26);
    ctx.fillStyle="#ffffff";ctx.textAlign="left";ctx.font="800 16px "+FA;ctx.fillText("REQUEST",36,52);
    ctx.textAlign="right";ctx.font="700 15px "+FA;ctx.fillText("from "+x.from+(x.by?" · "+x.by:""),W-36,52);
    ctx.textAlign="left";ctx.fillStyle="#0b3d63";ctx.font="900 42px "+FA;ctx.fillText(clip(ctx,"NEED "+String(x.type).toUpperCase(),W-72),36,142);
    const ga=[x.gate?("Gate "+x.gate):"",x.aircraft].filter(Boolean).join("      ");
    ctx.fillStyle="#12202c";ctx.font="800 24px "+FA;ctx.fillText(ga||"—",36,188);
    ctx.fillStyle="#41505c";ctx.font="700 17px "+FA;ctx.fillText("To:  "+x.to,36,224);
    if(x.note){ctx.fillStyle="#8a4a44";ctx.font="600 15px "+FA;ctx.fillText(clip(ctx,x.note,W-72),36,250);}
    ctx.fillStyle="#9aa5b1";ctx.textAlign="right";ctx.font="600 12px "+FA;ctx.fillText(new Date(x.when).toLocaleString(),W-36,H-30);
    return c;
  }
  function copyReq(id){
    const x=load().find(r=>r.id===id);if(!x)return;
    const canvas=reqCanvas(x);
    canvas.toBlob(blob=>{
      if(blob&&navigator.clipboard&&window.ClipboardItem){
        navigator.clipboard.write([new ClipboardItem({"image/png":blob})]).then(()=>toast("Copied — paste into Teams")).catch(()=>showImage(canvas));
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
