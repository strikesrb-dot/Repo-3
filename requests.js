/* requests.js — cross-department Send/Receive request client.
   Self-contained module: renders into #requestsRoot, stores requests in localStorage (elt.requests),
   and mirrors across windows via the 'storage' event (so a Send in one window appears in Receive in
   another — the pitch demo). Matches the site's navy/card design. Uses the global Store + toast. */
(function(){
  const $=(s,r)=>(r||document).querySelector(s);
  const $$=(s,r)=>[...(r||document).querySelectorAll(s)];
  const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const toast=m=>{try{if(window.toast)window.toast(m);}catch(_){}}
  const ROOT=()=>$("#requestsRoot");

  const DEPTS=["Move Team","UGE","Customer Service","Ramp"];
  const TYPES=[{k:"Power",ic:"⚡"},{k:"Air",ic:"❄"},{k:"Pushback",ic:"🛫"},{k:"Water / Lav",ic:"💧"},{k:"Bag Runner",ic:"🧳"},{k:"Other",ic:"•"}];
  const KEY="elt.requests", MYDEPT_KEY="elt.requests.dept";

  const load=()=>{const d=Store.getJSON(KEY,[]);return Array.isArray(d)?d:[];};
  const saveAll=l=>Store.setJSON(KEY,l);
  const myDept=()=>Store.getJSON(MYDEPT_KEY,"Move Team");
  const setMyDept=d=>Store.setJSON(MYDEPT_KEY,d);

  let view="menu";   // menu | send | receive
  let draft=null;    // in-progress send form

  function render(){const r=ROOT();if(!r)return;
    if(view==="send")return renderSend(r);
    if(view==="receive")return renderReceive(r);
    return renderMenu(r);}

  /* ---- menu ---- */
  function renderMenu(r){
    const mine=load().filter(x=>x.to===myDept()&&x.status!=="done").length;
    r.innerHTML=`<div class="rq-wrap">
      <div class="rq-head"><h2>Requests</h2><p>Structured requests between departments — no more digging through chat threads.</p></div>
      <label class="rq-deptsel"><span>I'm working as</span>
        <select id="rqMyDept">${DEPTS.map(d=>`<option ${d===myDept()?"selected":""}>${esc(d)}</option>`).join("")}</select></label>
      <div class="rq-tiles">
        <button class="rq-tile send" data-v="send"><span class="rqt-ic">➤</span><span class="rqt-t">Send</span><span class="rqt-s">Make a request to another department</span></button>
        <button class="rq-tile recv" data-v="receive"><span class="rqt-ic">📥</span><span class="rqt-t">Receive</span><span class="rqt-s">Requests sent to you${mine?` · <b>${mine} new</b>`:""}</span></button>
      </div></div>`;
    $("#rqMyDept").onchange=e=>{setMyDept(e.target.value);render();};
    $$(".rq-tile",r).forEach(b=>b.onclick=()=>{view=b.dataset.v;render();});
  }

  /* ---- send ---- */
  function renderSend(r){
    draft=draft||{from:myDept(),to:DEPTS.find(d=>d!==myDept())||"Ramp",type:"Power",gate:"",aircraft:"",note:""};
    const d=draft;
    const chips=(set,items,cur)=>items.map(it=>{const v=it.k||it,lb=(it.ic?it.ic+" ":"")+(it.k||it);return `<button class="rq-chip ${cur===v?"on":""}" data-set="${set}" data-v="${esc(v)}">${esc(lb)}</button>`;}).join("");
    r.innerHTML=`<div class="rq-wrap">
      <button class="rq-back" data-b="menu">‹ Requests</button>
      <div class="rq-head"><h2>New request</h2></div>
      <div class="rq-card">
        <label class="rq-l">From</label><div class="rq-chips">${chips("from",DEPTS,d.from)}</div>
        <label class="rq-l">To</label><div class="rq-chips">${chips("to",DEPTS,d.to)}</div>
        <label class="rq-l">Need</label><div class="rq-chips">${chips("type",TYPES,d.type)}</div>
        <div class="rq-two">
          <div><label class="rq-l">Gate</label><input id="rqGate" value="${esc(d.gate)}" placeholder="e.g. 109" autocomplete="off" inputmode="numeric"></div>
          <div><label class="rq-l">Aircraft</label><input id="rqAc" value="${esc(d.aircraft)}" placeholder="e.g. N762YX" autocomplete="off"></div>
        </div>
        <label class="rq-l">Note (optional)</label><input id="rqNote" value="${esc(d.note)}" placeholder="Anything else…" autocomplete="off">
        <div class="btnrow" style="margin-top:14px"><button class="btn navy" id="rqSend">Send request ➤</button></div>
      </div></div>`;
    $(".rq-back",r).onclick=()=>{view="menu";draft=null;render();};
    $$(".rq-chip",r).forEach(b=>b.onclick=()=>{syncInputs();d[b.dataset.set]=b.dataset.v;render();});
    $("#rqSend").onclick=()=>{
      syncInputs();
      if(d.from===d.to){toast("Pick a different department to send to");return;}
      if(!d.gate&&!d.aircraft){toast("Add a gate or an aircraft");return;}
      const req={id:"R"+Date.now()+"-"+Math.floor(Math.random()*1e4),from:d.from,to:d.to,type:d.type,
        gate:d.gate.trim(),aircraft:d.aircraft.trim().toUpperCase(),note:d.note.trim(),when:Date.now(),status:"open"};
      const l=load();l.unshift(req);saveAll(l);
      draft=null;view="receive";toast("Request sent to "+req.to);render();
    };
  }
  function syncInputs(){if(!draft)return;const g=$("#rqGate"),a=$("#rqAc"),n=$("#rqNote");if(g)draft.gate=g.value;if(a)draft.aircraft=a.value;if(n)draft.note=n.value;}

  /* ---- receive ---- */
  function renderReceive(r){
    const list=load().slice().sort((a,b)=>b.when-a.when);
    r.innerHTML=`<div class="rq-wrap">
      <button class="rq-back" data-b="menu">‹ Requests</button>
      <div class="rq-head"><h2>Incoming requests</h2><p>Addressed to <b>${esc(myDept())}</b> are highlighted. Others are shown too.</p></div>
      ${list.length?list.map(reqCard).join(""):'<p class="rq-empty">No requests yet.<br>Send one from the Send screen — or from another device/window — and it appears here live.</p>'}
    </div>`;
    $(".rq-back",r).onclick=()=>{view="menu";render();};
    $$(".rq-copy",r).forEach(b=>b.onclick=()=>copyReq(b.dataset.id));
    $$(".rq-done",r).forEach(b=>b.onclick=()=>{const l=load();const it=l.find(x=>x.id===b.dataset.id);if(it)it.status="done";saveAll(l);render();});
  }
  function reqCard(x){
    const mine=x.to===myDept();
    return `<div class="rq-item ${mine?"mine":""} ${x.status==="done"?"done":""}">
      <div class="rqi-top"><span class="rqi-from">From <b>${esc(x.from)}</b></span><span class="rqi-arrow">→</span><span class="rqi-to">${esc(x.to)}</span><span class="rqi-time">${timeAgo(x.when)}</span></div>
      <div class="rqi-need">NEED ${esc(String(x.type).toUpperCase())}</div>
      <div class="rqi-meta">${x.gate?`Gate <b>${esc(x.gate)}</b>`:""}${x.gate&&x.aircraft?" · ":""}${x.aircraft?`<b>${esc(x.aircraft)}</b>`:""}</div>
      ${x.note?`<div class="rqi-note">${esc(x.note)}</div>`:""}
      <div class="rqi-acts"><button class="btn ghost sm rq-copy" data-id="${esc(x.id)}">⧉ Copy for Teams</button>${x.status==="done"?'<span class="rqi-doneflag">✓ Done</span>':`<button class="btn good sm rq-done" data-id="${esc(x.id)}">Mark done</button>`}</div>
    </div>`;
  }
  function timeAgo(t){const s=Math.max(0,Math.round((Date.now()-t)/1000));if(s<60)return "just now";const m=Math.round(s/60);if(m<60)return m+"m ago";const h=Math.round(m/60);if(h<24)return h+"h ago";return Math.round(h/24)+"d ago";}

  /* ---- copy as a small image for Teams ---- */
  function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
  function clip(ctx,t,maxW){t=String(t||"");if(ctx.measureText(t).width<=maxW)return t;while(t.length>1&&ctx.measureText(t+"…").width>maxW)t=t.slice(0,-1);return t+"…";}
  function reqCanvas(x){
    const W=540,H=286,S=2,FA="-apple-system,Segoe UI,Roboto,Arial,sans-serif";
    const c=document.createElement("canvas");c.width=W*S;c.height=H*S;const ctx=c.getContext("2d");ctx.scale(S,S);
    ctx.fillStyle="#eef2f6";ctx.fillRect(0,0,W,H);
    ctx.fillStyle="#ffffff";roundRect(ctx,14,14,W-28,H-28,20);ctx.fill();
    ctx.fillStyle="#0b3d63";roundRect(ctx,14,14,W-28,66,20);ctx.fill();ctx.fillRect(14,54,W-28,26);
    ctx.fillStyle="#ffffff";ctx.textAlign="left";ctx.font="800 16px "+FA;ctx.fillText("REQUEST",36,52);
    ctx.textAlign="right";ctx.font="700 15px "+FA;ctx.fillText("from "+x.from,W-36,52);
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
        navigator.clipboard.write([new ClipboardItem({"image/png":blob})])
          .then(()=>toast("Copied — paste into Teams"))
          .catch(()=>showImage(canvas));
      }else showImage(canvas);
    },"image/png");
  }
  function showImage(canvas){
    const back=document.createElement("div");back.className="rq-imgback";
    const url=canvas.toDataURL("image/png");
    back.innerHTML=`<div class="rq-imgbox"><img src="${url}" alt="request"><p class="rq-imghint">Long-press the image to copy or save, then paste into Teams.</p><button class="btn ghost" id="rqImgClose">Close</button></div>`;
    back.onclick=e=>{if(e.target===back||e.target.id==="rqImgClose")back.remove();};
    document.body.appendChild(back);
  }

  /* ---- cross-window mirror (Send here → Receive there, no network) ---- */
  window.addEventListener("storage",e=>{
    if(e.key!==KEY)return;
    if(!ROOT())return;                       // requests view not on screen
    if(view==="receive"||view==="menu")render();
  });

  function back(){if(view!=="menu"){view="menu";draft=null;render();return true;}return false;}
  window.REQUESTS={ open:()=>{view="menu";render();}, back };
})();
