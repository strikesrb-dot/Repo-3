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

  /* ---- screen: category list (root) ---- */
  function homeScreen(nav){
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
    UI.render(ROOT(),nav,{title:"GSE",sub:"Out of service — mark it, see why, confirm and reply.",body,mount:r=>{
      $$(".ui-row[data-cat]",r).forEach(b=>b.onclick=()=>nav.go(catScreen(b.dataset.cat)));
      $("#gsemTxt",r)&&($("#gsemTxt").onclick=gseDownloadText);
    }});
  }

  /* ---- screen: one category — OOS units + confirm/reply/photo workflow ---- */
  function catScreen(cat){
    return function(nav){
      const inCat=e=>(e.type||"(uncategorized)")===cat;
      const list=gseList().filter(inCat);
      const rows=list.map(e=>{const ev=eqHistory(e).find(m=>m.oos);const ack=e.oosAck;
        const photo=e.oosPhoto?(function(){try{return Store.getRaw("elt.oos.photo."+e.id,null);}catch(_){return null;}})():null;
        const status=ack
          ? `<div class="gse-status ack">&#10003; Confirmed by <b>${esc(nm(ack.by))}</b>${ack.reply?` — &ldquo;${esc(ack.reply)}&rdquo;`:""}</div>`
          : `<div class="gse-status wait">Awaiting GSE</div>`;
        return `<li class="gse-row" data-id="${esc(e.id)}"><div class="gse-main">
          <div class="gse-tag">${esc(e.tag||"(no tag)")}</div>
          <div class="gse-reason">&#8856; ${esc(e.oosReason||"no reason recorded — tap Reason")}</div>
          <div class="gse-meta">${e.location?esc(e.location):"no location"}${ev?` &middot; since ${esc(fmtDate(ev.date))}${ev.by?" &middot; "+esc(nm(ev.by)):""}`:""}</div>
          ${photo?`<img class="gse-photo" src="${photo}" alt="OOS photo" data-id="${esc(e.id)}" />`:""}
          ${status}
          <div class="gse-thread">
            <div class="gse-reply-chips">${GSE_REPLIES.map(rp=>`<button class="gse-rchip" data-id="${esc(e.id)}" data-r="${esc(rp)}">${esc(rp)}</button>`).join("")}</div>
            <div class="gse-reply-row"><input class="gse-reply-in" data-id="${esc(e.id)}" placeholder="Reply to the super…" autocomplete="off" value="${esc(ack&&ack.reply||"")}" />
              <button class="btn green sm gse-confirm" data-id="${esc(e.id)}">${ack?"Update":"Confirm"}</button></div></div></div>
          <div class="gse-acts"><button class="btn ghost sm gse-photo-btn" data-id="${esc(e.id)}">Photo</button><button class="btn ghost sm gse-edit" data-id="${esc(e.id)}">Reason</button><button class="btn green sm gse-back2" data-id="${esc(e.id)}">In service</button></div></li>`;}).join("")
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
          pickReason(eq.tag,"",v=>setEqOos(eq.id,true,v));
        }});
        $$(".gse-rchip",r).forEach(b=>b.onclick=()=>gseAck(b.dataset.id,b.dataset.r));
        $$(".gse-confirm",r).forEach(b=>b.onclick=()=>{const i=b.closest(".gse-thread").querySelector(".gse-reply-in");gseAck(b.dataset.id,i?i.value:"");});
        $$(".gse-photo-btn",r).forEach(b=>b.onclick=()=>capturePhoto(b.dataset.id));
        $$(".gse-photo",r).forEach(img=>img.onclick=()=>enlargePhoto(img.getAttribute("src")));
        $$(".gse-edit",r).forEach(b=>b.onclick=()=>{const eq=data.equipment.find(x=>x.id===b.dataset.id);if(!eq)return;
          pickReason(eq.tag,eq.oosReason||"",v=>{eq.oosReason=v;e_when(eq);save();nav.refresh();});});
        $$(".gse-back2",r).forEach(b=>b.onclick=()=>{const eq=data.equipment.find(x=>x.id===b.dataset.id);if(!eq)return;
          if(confirm(`Return ${eq.tag||"this unit"} to service?`))setEqOos(eq.id,false,"");});
      }});
    };
  }

  window.GSE={
    open:()=>{ const r=ROOT(); if(!r)return; navApi=UI.nav(r,{onExit:()=>{try{window.goHome&&window.goHome();}catch(_){}}}); navApi.reset(homeScreen); },
    back:()=>navApi?navApi.back():false,
    refresh:()=>{ if(navApi&&ROOT())navApi.refresh(); }
  };
})();
