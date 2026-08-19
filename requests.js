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
  /* Two categories — Need | Remove — with USER-DEFINED options under each. The option lists start
     empty (no clutter); the + Add button lets the team add their own basics, each with a name and a
     chip color. Options live in elt.requests.opts and sync across windows like everything else. */
  const KINDS=["Need","Remove"];
  const OPT_COLORS=["#0033a0","#c8102e","#008009","#b45309","#6244bb","#141414"];   // all AA with white fill-text
  const OPTS_KEY="elt.requests.opts";
  const loadOpts=()=>{const o=Store.getJSON(OPTS_KEY,null);return (o&&Array.isArray(o.need)&&Array.isArray(o.remove))?o:{need:[],remove:[]};};
  const saveOpts=o=>Store.setJSON(OPTS_KEY,o);
  const isActionType=t=>/^(remove|move)\b/i.test(t||"");   // legacy flat-type records
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
      $$(".ui-tile",r).forEach(b=>b.onclick=()=>{if(b.dataset.v==="send"){editingId=null;draft=null;}nav.go(b.dataset.v==="send"?sendScreen:receiveScreen);});
    }});
  }

  /* ---- screen: send ---- */
  let addingOpt=false, optColorSel=OPT_COLORS[0], optWord="", editingOpts=false, editingId=null;
  function sendScreen(nav){
    const others=DEPTS.filter(x=>x!==myDept());
    draft=draft||{to:others[0]||"Ramp",kind:"Need",types:[],loc:"",aircraft:"",note:""};
    const d=draft; d.types=d.types||[];
    const opts=loadOpts()[d.kind==="Remove"?"remove":"need"];
    const optChips=opts.map(o=>{const on=d.types.includes(o.v);
      return `<button class="ui-chip rq-opt${on?" on":""}${editingOpts?" rq-opt--del":""}" data-set="type" data-v="${esc(o.v)}"
      style="${on&&!editingOpts?`background:${esc(o.color)};border-color:${esc(o.color)};color:#fff`:`border-color:${esc(o.color)};color:${esc(o.color)}`}">${esc(o.v)}${editingOpts?" &#10005;":""}</button>`;}).join("");
    const addPanel=addingOpt?`<div class="rq-addpanel">
        <input id="optWord" placeholder="${d.kind==="Remove"?"e.g. Pushback, bag carts…":"e.g. Ground power, stairs…"}" autocomplete="off" value="${esc(optWord)}">
        <div class="rq-swatches">${OPT_COLORS.map(c=>`<button class="rq-swatch${optColorSel===c?" on":""}" data-c="${c}" style="background:${c}" aria-label="chip color"></button>`).join("")}</div>
        <div class="btnrow" style="margin-top:10px"><button class="btn sm" id="optAdd" style="flex:0 0 auto">Add option</button><button class="btn ghost sm" id="optCancel" style="flex:0 0 auto">Cancel</button></div>
      </div>`:"";
    const body=UI.card(`
      <span class="ui-flabel">From</span>
      <div class="rq-fromlock">${esc(myDept())} · ${esc(myName())}</div>
      <span class="ui-flabel" style="margin-top:12px">Who can help</span>${UI.chips(others,d.to,'data-set="to" data-v')}
      <span class="ui-flabel" style="margin-top:12px">Request</span>${UI.chips(KINDS,d.kind,'data-set="kind" data-v')}
      <span class="ui-flabel" style="margin-top:12px">${d.kind==="Remove"?"What needs removing?":"What do you need?"}</span>
      <div class="ui-chips">${optChips}<button class="ui-chip rq-addopt">+ Add</button>${opts.length?`<button class="ui-chip rq-editopt">${editingOpts?"Done":"Edit"}</button>`:""}</div>
      ${addPanel}
      <div class="rq-two" style="margin-top:12px">
        <div>${UI.field({label:"Location",id:"rqLoc",value:d.loc,placeholder:"Gate 109 · Spot 12 · pad"})}</div>
        <div class="ui-ta-wrap">${UI.field({label:"Aircraft",id:"rqAc",value:d.aircraft,placeholder:"Tail or ship number"})}
          <div class="ui-ta-list" id="rqAcList" hidden></div>
          <div class="rq-fleetscope">${UI.chips(["All","Mainline","Express"],d.fleetScope||"All",'data-set="fleetScope" data-v')}</div></div>
      </div>
      ${UI.field({label:"Note (optional)",id:"rqNote",value:d.note,placeholder:"Anything else…"})}
      <div class="btnrow" style="margin-top:14px"><button class="btn" id="rqSend">${editingId?"Save changes":"Send request"}</button></div>`);
    UI.render(ROOT(),nav,{title:editingId?"Edit request":"New request",body,mount:r=>{
      $$(".ui-chip",r).forEach(b=>b.onclick=()=>{if(!b.dataset.set)return;syncInputs();
        if(b.dataset.set==="type"){
          const v=b.dataset.v;
          if(editingOpts){
            if(confirm('Remove "'+v+'" from the list?')){
              const o=loadOpts();const k=d.kind==="Remove"?"remove":"need";
              o[k]=o[k].filter(x=>x.v!==v);saveOpts(o);
              d.types=d.types.filter(x=>x!==v);
              if(!o[k].length)editingOpts=false;
            }
          }else d.types=d.types.includes(v)?d.types.filter(x=>x!==v):[...d.types,v];   // multiselect
        }else{
          d[b.dataset.set]=b.dataset.v;
          if(b.dataset.set==="kind"){d.types=[];addingOpt=false;editingOpts=false;optWord="";}
        }
        nav.refresh();});
      $(".rq-editopt",r)&&($(".rq-editopt",r).onclick=()=>{editingOpts=!editingOpts;addingOpt=false;nav.refresh();});
      // + Add option: word + chip color, saved per category (team-shared like everything else)
      $(".rq-addopt",r)&&($(".rq-addopt",r).onclick=()=>{syncInputs();addingOpt=true;nav.refresh();});
      $$(".rq-swatch",r).forEach(b=>b.onclick=()=>{const w=$("#optWord");if(w)optWord=w.value;optColorSel=b.dataset.c;nav.refresh();});
      $("#optCancel",r)&&($("#optCancel").onclick=()=>{addingOpt=false;optWord="";nav.refresh();});
      $("#optAdd",r)&&($("#optAdd").onclick=()=>{
        const w=($("#optWord")&&$("#optWord").value||"").trim();
        if(!w){toast("Type the option name");return;}
        const o=loadOpts();const k=d.kind==="Remove"?"remove":"need";
        if(!o[k].some(x=>x.v.toLowerCase()===w.toLowerCase()))o[k].push({v:w,color:optColorSel});
        saveOpts(o);if(!d.types.includes(w))d.types.push(w);addingOpt=false;optWord="";nav.refresh();
      });
      // aircraft typeahead (UI.typeahead) — fleet suggestions, scoped Mainline/Express to narrow the search
      const acIn=$("#rqAc",r), acList=$("#rqAcList",r);
      const isExpress=a=>/Embraer|Bombardier|CRJ/i.test(a.type);
      if(acIn&&acList){
        acIn.addEventListener("input",()=>{d.aircraft=acIn.value;});
        UI.typeahead(acIn,acList,{min:2,source:q=>{
          if(!FLEET)return [];
          const Q=q.toUpperCase(), sc=d.fleetScope||"All";
          return FLEET
            .filter(a=>sc==="All"||(sc==="Express")===isExpress(a))
            .filter(a=>a.reg.includes(Q)||a.ship.startsWith(Q)).slice(0,20)
            .map(a=>({v:a.reg,label:a.reg,cap:(a.ship?"ship "+a.ship+" · ":"")+a.type}));
        },onPick:v=>{d.aircraft=v;}});
      }
      $("#rqSend",r).onclick=()=>{
        syncInputs();
        if(!d.to||d.to===myDept()){toast("Pick a department to send to");return;}
        if(!d.types.length){toast(d.kind==="Remove"?"Pick or add what needs removing":"Pick or add what you need");return;}
        if(!d.loc&&!d.aircraft){toast("Add a location or an aircraft");return;}
        if(editingId){   // saving an edit: update the record in place, keep id/sender/time
          const l=load();const it=l.find(q=>q.id===editingId);
          if(it){it.to=d.to;it.kind=d.kind;it.type=d.types.join(" · ");it.types=d.types.slice();
            it.loc=d.loc.trim();it.aircraft=d.aircraft.trim().toUpperCase();it.note=d.note.trim();it.edited=Date.now();}
          saveAll(l);editingId=null;draft=null;toast("Request updated");nav.back();return;
        }
        const req={id:"R"+Date.now()+"-"+Math.floor(Math.random()*1e4),from:myDept(),by:myName(),to:d.to,kind:d.kind,type:d.types.join(" · "),types:d.types.slice(),
          loc:d.loc.trim(),aircraft:d.aircraft.trim().toUpperCase(),note:d.note.trim(),when:Date.now(),status:"open"};
        const l=load();l.unshift(req);saveAll(l);
        draft=null;toast("Request sent to "+req.to);
        nav.back(); nav.go(receiveScreen);   // pop the send screen, show receive
      };
    }});
  }
  function syncInputs(){if(!draft)return;const g=$("#rqLoc"),a=$("#rqAc"),n=$("#rqNote"),ow=$("#optWord");if(g)draft.loc=g.value;if(a)draft.aircraft=a.value;if(n)draft.note=n.value;if(ow)optWord=ow.value;}

  /* ---- screen: receive (open inbox + archive) ----------------------------------------------------
     Lifecycle: open → done (one tap) or declined (reason chips: "Already has power", "MX hold"…).
     The sender sees the outcome + feedback on their card, live. Completed/declined requests move to
     the Archive section and auto-purge after ARCHIVE_DAYS — no manual deletion. */
  let showArchive=false, declining=null;   // declining = id of the card showing the reason picker
  function receiveScreen(nav){
    const all=load().slice().sort((a,b)=>b.when-a.when);
    const open=all.filter(x=>x.status==="open"), arch=all.filter(x=>x.status!=="open");
    const forMe=open.filter(x=>x.to===myDept());
    const sentByMe=open.filter(x=>x.from===myDept());
    const elsewhere=open.filter(x=>x.to!==myDept()&&x.from!==myDept());
    const sec=(label,list)=>list.length?`<div class="rq-sechead">${label} <b>${list.length}</b></div>${list.map(reqCard).join("")}`:"";
    const body=`
      ${open.length?`
        ${sec("For "+esc(myDept()),forMe)}
        ${sec("Your requests",sentByMe)}
        ${sec("Other departments",elsewhere)}`
      :'<p class="rq-empty">No open requests.<br>Send one from the Send screen — or from another device/window — and it appears here live.</p>'}
      ${arch.length?`<div class="rq-archrow"><button class="link-more" id="rqArch">${showArchive?"Hide archive":"Archive ("+arch.length+")"}</button>
        <span class="rq-archhint">Completed requests clear after ${ARCHIVE_DAYS} days.</span></div>`:""}
      ${showArchive?arch.map(reqCard).join(""):""}`;
    UI.render(ROOT(),nav,{title:"Requests",sub:`For <b>${esc(myDept())}</b>, what you've requested, and the archive.`,body,mount:r=>{
      $("#rqArch",r)&&($("#rqArch").onclick=()=>{showArchive=!showArchive;nav.refresh();});
      $$(".rq-copy",r).forEach(b=>b.onclick=()=>copyReq(b.dataset.id,b));
      $$(".rq-done",r).forEach(b=>b.onclick=()=>{const l=load();const it=l.find(x=>x.id===b.dataset.id);
        if(it){it.status="done";it.fb={by:myName(),dept:myDept(),when:Date.now(),text:""};}saveAll(l);declining=null;nav.refresh();});
      $$(".rq-edit",r).forEach(b=>b.onclick=()=>{const x=load().find(q=>q.id===b.dataset.id);if(!x)return;
        editingId=x.id;
        draft={to:x.to,kind:x.kind||"Need",types:(x.types&&x.types.slice())||(x.type?[x.type]:[]),
          loc:x.loc||x.gate||"",aircraft:x.aircraft||"",note:x.note||""};
        addingOpt=false;editingOpts=false;nav.go(sendScreen);});
      $$(".rq-del",r).forEach(b=>b.onclick=()=>{
        if(!confirm("Delete this request? It will be removed for everyone."))return;
        saveAll(load().filter(q=>q.id!==b.dataset.id));declining=null;toast("Request deleted");nav.refresh();});
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
  /* "Three Blocks" card (design-tournament winner, round 2): the card is cut into three zones —
     WHO is asking (their brand color) | WHAT they need | WHERE (gate big, aircraft under it) —
     so it reads in one sweep. Requests for YOUR department get a sky ring + FOR YOU pill; done
     and declined cards recede. Notes/replies/actions live in quiet rows under the zones. */
  function reqCard(x){
    const mine=x.to===myDept(), done=x.status==="done", decl=x.status==="declined", closed=done||decl;
    const loc=x.loc||x.gate||"";                      // old records stored the field as "gate"
    const type=acType(x.aircraft);
    const fb=x.fb||null;
    const own=x.from===myDept();
    const actions = declining===x.id
      ? `<div class="rqp-declpick">
           <span class="rqp-lbl" style="margin-bottom:6px">Why can't it be completed?</span>
           <div class="ui-chips">${DECLINE_REASONS.map(rr=>`<button class="ui-chip rq-reason" data-id="${esc(x.id)}" data-r="${esc(rr)}">${esc(rr)}</button>`).join("")}</div>
           <div class="rqp-declrow"><input id="rqReasonTxt" placeholder="Or type a reason…" autocomplete="off">
             <button class="btn sm rq-reasonsend" data-id="${esc(x.id)}">Send</button>
             <button class="btn ghost sm rq-declcancel">Cancel</button></div>
         </div>`
      : `<div class="rqp-acts">
           ${mine&&!closed?`<span class="rqp-foryou">For you</span>`:""}
           <span class="rqp3-who">${x.by?esc(x.by)+" &middot; ":""}${timeAgo(x.when)}${x.edited?" &middot; edited":""}</span>
           <span class="rqp3-sp"></span>
           <button class="btn ghost sm rq-copy" data-id="${esc(x.id)}">Copy for Teams</button>
           ${own&&!closed?`<button class="rq-linkbtn rq-edit" data-id="${esc(x.id)}">Edit</button>`:""}
           ${own?`<button class="rq-linkbtn rq-linkbtn--red rq-del" data-id="${esc(x.id)}">Delete</button>`:""}
           ${closed&&(own||mine)?`<button class="rq-linkbtn rq-reopen" data-id="${esc(x.id)}">Reopen</button>`:""}
           ${done?`<span class="rqp-doneflag" role="status">&#10003; Done${fb&&fb.by?" &middot; "+esc(fb.by):""}</span>`
             :decl?`<span class="rqp-declflag" role="status">&#10005; Can't complete</span>`
             :mine?`<button class="btn ghost sm rq-cant" data-id="${esc(x.id)}">Can't do</button>
                <button class="btn sm rq-done" data-id="${esc(x.id)}" aria-label="Mark request done">Mark done</button>`
             :own?`<button class="btn sm rq-done" data-id="${esc(x.id)}" aria-label="Mark request done">Mark done</button>`:""}
         </div>`;
    const br=brandOf(x.from);
    // middle zone: the kind is the eyebrow ("Needs"/"Remove"), the thing itself is the figure
    const needLbl=x.kind?(x.kind==="Need"?"Needs":x.kind):(isActionType(x.type)?"Request":"Needs");
    const needVal=`${x.type||""}${(!x.kind&&x.detail)?" · "+x.detail:""}`;
    // right zone: gate is the big figure, aircraft under it; degrade to whichever exists
    const shortType=type?type.replace(/^(Boeing|Airbus|Embraer|Bombardier)\s*/,""):"";
    const whereLbl=loc?"Gate":(x.aircraft?"Aircraft":"Where");
    const whereFig=loc||x.aircraft||"—";
    const whereSub=loc?(x.aircraft?esc(x.aircraft)+(shortType?" · "+esc(shortType):""):""):(x.aircraft&&shortType?esc(shortType):"");
    return `
    <div class="rq-item rqp3${mine&&!closed?" mine":""}${closed?" done":""}" data-id="${esc(x.id)}">
      <div class="rqp3-zones">
        <div class="rqp3-blk rqp3-from" style="background:${br.bg};color:${br.fg}">
          <span class="rqp3-eyebrow">Request from</span>
          <span class="rqp3-dept">${esc(x.from)}</span>
          <span class="rqp3-to">&rarr; ${esc(x.to)}</span>
        </div>
        <div class="rqp3-blk rqp3-need">
          <span class="rqp3-eyebrow">${esc(needLbl)}</span>
          <span class="rqp3-fig rqp3-needfig">${esc(needVal)}</span>
        </div>
        <div class="rqp3-blk rqp3-where">
          <span class="rqp3-eyebrow">${esc(whereLbl)}</span>
          <span class="rqp3-fig${String(whereFig).length>8?" rqp3-fig--sm":""}">${esc(whereFig)}</span>
          ${whereSub?`<span class="rqp3-sub">${whereSub}</span>`:`<span class="rqp3-sub rqp3-sub--none">${loc&&!x.aircraft?"no aircraft":""}</span>`}
        </div>
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
    const headTxt=(x.kind?String(x.kind).toUpperCase()+" ":(isActionType(x.type)?"":"NEED "))+String(x.type).toUpperCase()+((!x.kind&&x.detail)?" · "+String(x.detail).toUpperCase():"");
    ctx.textAlign="left";ctx.fillStyle="#0033a0";ctx.font="600 38px "+FA;ctx.fillText(clip(ctx,headTxt,W-72),36,136);
    // one quiet meta line: location · tail (short type) — only what exists
    const ty=acType(x.aircraft);
    const meta=[(x.loc||x.gate||""),x.aircraft?x.aircraft+(ty?" ("+ty.replace(/^(Boeing|Airbus|Embraer|Bombardier)\s*/,"")+")":""):""].filter(Boolean).join("  ·  ");
    if(meta){ctx.fillStyle="#0a1f44";ctx.font="600 24px "+FA;ctx.fillText(clip(ctx,meta,W-72),36,186);}
    if(x.note){ctx.fillStyle="#5c6470";ctx.font="400 15px "+FA;ctx.fillText(clip(ctx,x.note,W-72),36,224);}
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
