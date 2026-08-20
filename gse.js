/* gse.js — GSE Out of Service, as a first-class home-screen module built on the UI kit.
   Screens (function language): home = stat cards + category list rows; category = the OOS units
   with the confirm/reply/photo workflow. Reuses the app's existing data + actions from index.html
   (data, setEqOos, gseAck, capturePhoto, enlargePhoto, pickReason, GSE_REPLIES, gseCats, gseList,
   gseDownloadText) — this module owns the SCREENS, the shell owns the data. */
(function(){
  const esc=UI.esc;
  const $=(s,r)=>(r||document).querySelector(s);
  const $$=(s,r)=>[...(r||document).querySelectorAll(s)];
  const ROOT=()=>$("#gseRoot");
  let navApi=null;
  // attachment ownership: only whoever attached the photo (oosPhotoBy, stamped from oosWho())
  // gets Replace/Remove — everyone else (e.g. GSE confirming) just sees it. Legacy photos with
  // no stamp stay editable so nothing gets stranded.
  const photoMine=e=>String(e.oosPhotoBy||"")===String((window.oosWho&&oosWho())||"");

  /* ---- screen: equipment home (root) — the GSE tile is the equipment home ---- */
  function homeScreen(nav){
    const oosAll=gseList(), awaiting=oosAll.filter(e=>!e.oosAck).length;
    const total=data.equipment.length;
    const lastMv=data.movements[data.movements.length-1];
    const mvSub=lastMv?`${esc(dtag(lastMv.tag)||"unit")} ${lastMv.to?"&rarr; "+esc(lastMv.to):"updated"} · ${esc(fmtDate(lastMv.date))}`:"no moves yet";
    const body=`
      <div class="gsem-stats">
        <div class="ui-stat"><span class="ui-stat__eyebrow">Units</span>
          <div class="ui-stat__num">${total}</div>
          <div class="ui-stat__cap">on the global list</div></div>
        <div class="ui-stat ui-stat--royal"><span class="ui-stat__eyebrow">Out of service</span>
          <div class="ui-stat__num">${oosAll.length}</div>
          <div class="ui-stat__cap">${awaiting} awaiting confirm</div></div>
      </div>
      <div class="gsem-tiles">
        ${UI.tile({title:"Equipment List",sub:`${total} unit${total===1?"":"s"} · specs, tags, locations`,tone:"navy",attr:'data-open="equipment"'})}
        ${UI.tile({title:"Do Inventory",sub:"one area or complete",tone:"teal",attr:'data-open="inventory"'})}
        ${UI.tile({title:"Movement Log",sub:mvSub,tone:"slate",attr:'data-open="movement"'})}
        ${UI.tile({title:"Out of Service",sub:oosAll.length?`<b>${oosAll.length} out</b> · ${awaiting} awaiting`:"all in service",attr:'data-open="oos"'})}
      </div>`;
    UI.render(ROOT(),nav,{title:"GSE",sub:"Equipment home — list, inventory, movement, out of service.",body,mount:r=>{
      $$(".ui-tile[data-open]",r).forEach(t=>t.onclick=()=>{
        const k=t.dataset.open;
        if(k==="oos")nav.go(oosScreen);
        else if(k==="equipment"&&window.EQUIP)nav.go(EQUIP.listScreen);
        else if(k==="inventory"&&window.INV)nav.go(INV.electScreen);
        else if(k==="movement"&&window.MOVE)nav.go(MOVE.movementScreen);
      });
    }});
  }

  /* ---- screen: OOS category list ---- */
  function oosScreen(nav){
    const cats=gseCats(), oosAll=gseList();
    const awaiting=oosAll.filter(e=>!e.oosAck).length;
    const rows=cats.map(c=>`
      <button class="ui-row" data-cat="${esc(c.type)}">
        <div class="ui-row__main">
          <div class="ui-row__title">${esc(c.type)}</div>
          <div class="ui-row__sub">${c.total} unit${c.total===1?"":"s"}</div>
        </div>
        <span class="ui-row__value">${c.oos?`<b class="gsem-bad">${c.oos} out</b>`:"all in service"}</span>
        <span class="ui-row__chev" aria-hidden="true"></span>
      </button>`).join("");
    const body=`
      <div class="gsem-stats">
        <div class="ui-stat"><span class="ui-stat__eyebrow">Out of service</span>
          <div class="ui-stat__num">${oosAll.length}</div>
          <div class="ui-stat__cap">across the fleet · as of now</div></div>
        <div class="ui-stat ui-stat--royal"><span class="ui-stat__eyebrow">Awaiting confirm</span>
          <div class="ui-stat__num">${awaiting}</div>
          <div class="ui-stat__cap">marked, not yet acknowledged</div></div>
      </div>
      <div class="ui-group">${rows||'<p class="rq-empty">No equipment yet.</p>'}</div>
      ${oosAll.length?`<button class="btn ghost" id="gsemTxt">Download text list</button>`:""}`;
    UI.render(ROOT(),nav,{title:"Out of service",sub:"Mark it, see why, confirm and reply.",body,mount:r=>{
      $$(".ui-row[data-cat]",r).forEach(b=>b.onclick=()=>nav.go(catScreen(b.dataset.cat)));
      $("#gsemTxt",r)&&($("#gsemTxt").onclick=gseDownloadText);
    }});
  }

  /* ---- screen: one category — OOS units + confirm/reply/photo workflow ---- */
  function catScreen(cat){
    return function(nav){
      const inCat=e=>(e.type||"(uncategorized)")===cat;
      // awaiting-first, then oldest-first (e.oosAt) — a 9-day-old unacknowledged unit tops the list
      const list=gseList().filter(inCat).sort((a,b)=>((a.oosAck?1:0)-(b.oosAck?1:0))||((a.oosAt||0)-(b.oosAt||0)));
      const age=t=>{if(!t)return "";const h=Math.round((Date.now()-t)/3600000);return h<1?"just now":h<24?h+"h":Math.round(h/24)+"d";};
      const rows=list.map(e=>{const ev=eqHistory(e).find(m=>m.oos);const ack=e.oosAck;
        const photo=e.oosPhoto?(function(){try{return Store.getRaw("elt.oos.photo."+e.id,null);}catch(_){return null;}})():null;
        const status=ack
          ? `<div class="gse-status ack">&#10003; Confirmed by <b>${esc(nm(ack.by))}</b>${ack.reply?` — &ldquo;${esc(ack.reply)}&rdquo;`:""}</div>`
          : `<div class="gse-status wait">Awaiting GSE</div>`;
        return `<li class="gse-row" data-id="${esc(e.id)}"><div class="gse-main">
          <div class="gse-tag">${esc(dtag(e.tag)||"(no tag)")}${e.oosAt?`<span class="gsem-age${e.oosAck?"":" hot"}">${age(e.oosAt)}</span>`:""}</div>
          <div class="gse-reason">&#8856; ${esc(e.oosReason||"no reason recorded — tap Reason")}</div>
          <div class="gse-meta">${e.location?esc(e.location):"no location"}${e.oosAt?` &middot; since ${esc(fmtDate(new Date(e.oosAt-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10)))}`:ev?` &middot; since ${esc(fmtDate(ev.date))}`:""}${ev&&ev.by?" &middot; "+esc(nm(ev.by)):""}</div>
          ${photo?`<img class="gse-photo" src="${photo}" alt="OOS photo" data-id="${esc(e.id)}" />
            <div class="gsem-photoacts">${photoMine(e)
              ?`<button class="gsem-plink gse-photoedit" data-id="${esc(e.id)}">Replace photo</button>
                <button class="gsem-plink gsem-plink--red gse-photodel" data-id="${esc(e.id)}">Remove photo</button>`
              :`<span class="gsem-pby">Photo${e.oosPhotoBy?" by "+esc(nm(String(e.oosPhotoBy).split(" · ")[0])):""}</span>`}</div>`:""}
          ${status}
          <div class="gse-thread">
            <div class="gse-reply-chips">${GSE_REPLIES.map(rp=>`<button class="gse-rchip" data-id="${esc(e.id)}" data-r="${esc(rp)}">${esc(rp)}</button>`).join("")}</div>
            <div class="gse-reply-row"><input class="gse-reply-in" data-id="${esc(e.id)}" placeholder="Reply to the super…" autocomplete="off" value="${esc(ack&&ack.reply||"")}" />
              <button class="btn green sm gse-confirm" data-id="${esc(e.id)}">${ack?"Update":"Confirm"}</button></div></div></div>
          <div class="gse-acts">${e.oosPhoto?"":`<button class="btn ghost sm gse-photo-btn" data-id="${esc(e.id)}">Photo</button>`}<button class="btn ghost sm gse-edit" data-id="${esc(e.id)}">Reason</button><button class="btn green sm gse-back2" data-id="${esc(e.id)}">In service</button></div></li>`;}).join("")
        ||`<p class="rq-empty">Nothing in ${esc(cat)} is out of service.</p>`;
      const body=`
        <div class="ui-card gsem-addcard" style="margin-bottom:14px">
          <span class="ui-flabel">Mark a ${esc(cat)} unit out of service</span>
          <div class="ui-ta-wrap">
            <input id="gsemAdd" placeholder="Type a tag…" autocomplete="off"
              style="width:100%;font:400 17px/1.3 var(--font);padding:12px 14px;border:1px solid var(--field-border);border-radius:var(--r-md);background:rgba(255,255,255,.85)">
            <div class="ui-ta-list" id="gsemAddList" hidden></div>
          </div>
        </div>
        <ul class="gse-list">${rows}</ul>`;
      UI.render(ROOT(),nav,{title:cat,sub:`${list.length?list.length+" out of service.":"All in service."}`,body,mount:r=>{
        const inp=$("#gsemAdd",r), lst=$("#gsemAddList",r);
        if(inp&&lst)UI.typeahead(inp,lst,{min:1,source:q=>{
          const Q=q.toUpperCase();
          return data.equipment.filter(e=>!e.oos&&inCat(e)&&(e.tag||"").toUpperCase().includes(Q)).slice(0,8)
            .map(e=>({v:e.tag,label:e.tag,cap:(e.location||"no location")}));
        },onPick:tag=>{
          const eq=data.equipment.find(x=>(x.tag||"").toUpperCase()===String(tag).toUpperCase());
          if(!eq)return;
          // camera auto-chains after the reason saves — the sheet opens with zero navigation;
          // cancel is harmless. pickReason's save click keeps user activation for inp.click().
          pickReason(dtag(eq.tag),"",v=>{setEqOos(eq.id,true,v);capturePhoto(eq.id);});
        }});
        $$(".gse-rchip",r).forEach(b=>b.onclick=()=>gseAck(b.dataset.id,b.dataset.r));
        $$(".gse-confirm",r).forEach(b=>b.onclick=()=>{const i=b.closest(".gse-thread").querySelector(".gse-reply-in");gseAck(b.dataset.id,i?i.value:"");});
        $$(".gse-photo-btn",r).forEach(b=>b.onclick=()=>capturePhoto(b.dataset.id));
        $$(".gse-photoedit",r).forEach(b=>b.onclick=()=>capturePhoto(b.dataset.id));
        $$(".gse-photodel",r).forEach(b=>b.onclick=()=>{const eq=data.equipment.find(x=>x.id===b.dataset.id);if(!eq)return;
          if(!confirm("Remove this photo?"))return;
          try{Store.del("elt.oos.photo."+eq.id);}catch(_){}
          delete eq.oosPhoto;delete eq.oosPhotoBy;e_when(eq);save();nav.refresh();});
        $$(".gse-photo",r).forEach(img=>img.onclick=()=>enlargePhoto(img.getAttribute("src")));
        $$(".gse-edit",r).forEach(b=>b.onclick=()=>{const eq=data.equipment.find(x=>x.id===b.dataset.id);if(!eq)return;
          pickReason(dtag(eq.tag),eq.oosReason||"",v=>{eq.oosReason=v;e_when(eq);save();nav.refresh();});});
        $$(".gse-back2",r).forEach(b=>b.onclick=()=>{const eq=data.equipment.find(x=>x.id===b.dataset.id);if(!eq)return;
          if(confirm(`Return ${dtag(eq.tag)||"this unit"} to service?`))setEqOos(eq.id,false,"");});
      }});
    };
  }

  window.GSE={
    open:()=>{ const r=ROOT(); if(!r)return; navApi=UI.nav(r,{onExit:()=>{try{window.goHome&&window.goHome();}catch(_){}}}); navApi.reset(homeScreen); },
    back:()=>navApi?navApi.back():false,
    refresh:()=>{ if(navApi&&ROOT())navApi.refresh(); },
    go:fn=>{ if(navApi&&fn)navApi.go(fn); },
    // the old hub tiles / goTab("equipment"|"inventory"|"movement") land here: open the module
    // home, then push the right sub-screen — back walks sub -> GSE home -> app home
    openSub:name=>{
      GSE.open();
      const f=name==="equipment"?(window.EQUIP&&EQUIP.listScreen)
        :name==="inventory"?(window.INV&&INV.electScreen)
        :name==="movement"?(window.MOVE&&MOVE.movementScreen):null;
      if(f)navApi.go(f);
    }
  };
})();
