/* equipment.js — the global equipment list as UI-kit screens on the GSE nav stack.
   Screens only: every write goes through the shell's data layer (save, logMove, tombstone,
   setEqOos, capturePhoto, requireUnlock/requireEditPass, pattern lock). Screens are factories
   returning fn(nav) — pushed by gse.js via GSE.go(...) so back buttons come from UI.render. */
(function(){
  const esc=UI.esc;
  const $=(s,r)=>(r||document).querySelector(s);
  const $$=(s,r)=>[...(r||document).querySelectorAll(s)];
  const ROOT=()=>$("#gseRoot");

  /* list state survives refreshes (incl. the cross-window mirror) so typed filters never vanish */
  let LQ="", grp="type", collapsed=new Set(), initCollapse=true;

  const photoMine=e=>String(e.oosPhotoBy||"")===String((window.oosWho&&oosWho())||"");
  const specOf=e=>e.volt||"";
  const natCmp=(a,b)=>String(a||"").localeCompare(String(b||""),undefined,{numeric:true,sensitivity:"base"});
  const byTag=(a,b)=>natCmp(a.tag,b.tag);

  /* ---- lock row: the pattern lock that gates Move/Edit ---- */
  function lockRowHTML(){
    if(!data.lockPattern)return `<button class="eqd-lockbtn ghost" data-lock="set">Set lock pattern</button>`;
    if(window.unlocked)return `<div class="eqd-lockrow"><span>Unlocked — editing enabled</span>
      <span><button class="eqd-lockmini" data-lock="change">Change</button><button class="eqd-lockmini" data-lock="now">Lock</button></span></div>`;
    return `<button class="eqd-lockbtn" data-lock="open">Locked — tap to unlock &amp; edit</button>`;
  }
  function wireLockRow(r,nav){
    $$("[data-lock]",r).forEach(b=>b.onclick=()=>{const k=b.dataset.lock;
      if(k==="set"||k==="change")setPattern();
      else if(k==="now"){window.unlocked=false;toast("Locked");nav.refresh();}
      else requireUnlock(()=>nav.refresh());
    });
  }

  /* ================= list ================= */
  function listScreen(nav){
    const total=data.equipment.length;
    const body=`
      ${UI.card(`<div class="eqd-lockslot">${lockRowHTML()}</div>
        <div class="btnrow" style="margin-top:10px">
          <button class="btn navy" id="eqdAdd">+ Add equipment</button>
          <button class="btn ghost" id="eqdSheet" style="flex:0 0 44%">Generate sheet</button>
        </div>`)}
      <div class="ui-card" style="margin-top:12px">
        <span class="ui-flabel">Search</span>
        <input id="eqdQ" type="search" placeholder="Tag, type, location…" autocomplete="off" value="${esc(LQ)}"
          style="width:100%;font:400 17px/1.3 var(--font);padding:12px 14px;border:1px solid var(--field-border);border-radius:var(--r-md);background:rgba(255,255,255,.85)">
        <div class="ui-chips" style="margin-top:10px">${[["type","By category"],["area","By area"],["none","Flat"]].map(([v,l])=>
          `<button class="ui-chip${grp===v?" on":""}" data-grp="${v}">${l}</button>`).join("")}</div>
      </div>
      <p class="eqd-count" id="eqdCount"></p>
      <div id="eqdList"></div>
      <button class="rq-linkbtn" id="eqdCats" style="margin-top:12px">Manage categories &rsaquo;</button>`;
    UI.render(ROOT(),nav,{title:"Equipment list",sub:`${total} unit${total===1?"":"s"} · specs, tags, locations. Tap a unit for details.`,body,mount:r=>{
      wireLockRow(r,nav);
      $("#eqdAdd",r).onclick=()=>requireEditPass(()=>nav.go(editScreen(null)));
      $("#eqdCats",r).onclick=()=>requireEditPass(()=>nav.go(SETTINGS.screens.types));
      $("#eqdSheet",r).onclick=()=>nav.go(sheetScreen);
      const q=$("#eqdQ",r);
      q.oninput=()=>{LQ=q.value;paintList(r,nav);};           // pure DOM repaint — focus survives
      $$(".ui-chip[data-grp]",r).forEach(b=>b.onclick=()=>{grp=b.dataset.grp;initCollapse=true;nav.refresh();});
      paintList(r,nav);
    }});
  }
  function paintList(r,nav){
    const box=$("#eqdList",r);if(!box)return;
    const q=LQ.trim().toLowerCase();
    let items=data.equipment.slice();
    if(q)items=items.filter(e=>[e.tag,e.type,e.subtype,e.location,e.spot,e.notes,e.volt].some(v=>(v||"").toLowerCase().includes(q)));
    items.sort(byTag);
    $("#eqdCount",r).textContent=`${items.length} of ${data.equipment.length} unit${data.equipment.length===1?"":"s"}`;
    if(!data.equipment.length){box.innerHTML=`<p class="rq-empty">No equipment yet.<br>Tap <b>+ Add equipment</b>.</p>`;return;}
    if(!items.length){box.innerHTML=`<p class="rq-empty">Nothing matches your search.</p>`;return;}
    let groups;
    if(grp==="none")groups=[{key:"",label:"",items}];
    else if(grp==="area"){
      const areas=[...new Set(items.map(e=>e.location||""))].sort((a,b)=>(a===""?1:0)-(b===""?1:0)||natCmp(a,b));
      groups=areas.map(a=>({key:"a:"+a,label:a||"No location",items:items.filter(e=>(e.location||"")===a)}));
    }else groups=groupByType(items).map(g=>({key:"t:"+g.type,label:g.type,items:g.items}));
    if(initCollapse&&grp!=="none"){collapsed=new Set(groups.map(g=>g.key));initCollapse=false;}
    const searching=!!q;
    const row=e=>{const det=invDetail(e.spot,e.nose);
      return `<button class="ui-row" data-unit="${esc(e.id)}">
        <div class="ui-row__main">
          <div class="ui-row__title">${esc(dtag(e.tag)||"(no tag)")}${e.oos?`<span class="eqd-oos">OUT OF SERVICE</span>`:""}</div>
          <div class="ui-row__sub">${[e.type,e.subtype,specOf(e)].filter(Boolean).map(esc).join(" · ")||"&nbsp;"}</div>
        </div>
        <span class="ui-row__value">${e.location?esc(e.location)+(det?" · "+esc(det):""):"no location"}</span>
        <span class="ui-row__chev" aria-hidden="true"></span></button>`;};
    box.innerHTML=groups.map(g=>{
      const rows=`<div class="ui-group">${g.items.slice().sort(byTag).map(row).join("")}</div>`;
      if(grp==="none")return rows;
      const col=!searching&&collapsed.has(g.key);
      return `<button class="eqd-gh${col?" col":""}" data-gh="${esc(g.key)}"><span class="eqd-ca">${col?"&#9656;":"&#9662;"}</span>${esc(g.label)}<span class="eqd-gn">${g.items.length}</span></button>${col?"":rows}`;
    }).join("");
    $$("[data-gh]",box).forEach(b=>b.onclick=()=>{const k=b.dataset.gh;collapsed.has(k)?collapsed.delete(k):collapsed.add(k);paintList(r,nav);});
    $$("[data-unit]",box).forEach(b=>b.onclick=()=>nav.go(unitScreen(b.dataset.unit)));
  }

  /* ================= unit detail ================= */
  function unitScreen(id){
    return function(nav){
      const e=data.equipment.find(x=>x.id===id);
      if(!e){nav.back();return;}
      const det=invDetail(e.spot,e.nose);
      const photo=e.oosPhoto?(function(){try{return Store.getRaw("elt.oos.photo."+e.id,null);}catch(_){return null;}})():null;
      const ack=e.oosAck;
      const sinceTs=e.oosAt||null;
      const age=t=>{const h=Math.round((Date.now()-t)/3600000);return h<1?"under 1h":h<24?h+"h":Math.round(h/24)+"d";};
      const oosCard=e.oos?`<div class="ui-card eqd-oosbanner">
          <span class="ui-flabel" style="color:var(--ua-red)">Out of service${sinceTs?` · ${age(sinceTs)}`:""}</span>
          <div class="eqd-oosreason">${esc(e.oosReason||"no reason recorded")}</div>
          ${photo?`<img class="gse-photo" src="${photo}" alt="OOS photo">
            <div class="gsem-photoacts">${photoMine(e)
              ?`<button class="gsem-plink" id="eqdPhotoRe">Replace photo</button><button class="gsem-plink gsem-plink--red" id="eqdPhotoDel">Remove photo</button>`
              :`<span class="gsem-pby">Photo${e.oosPhotoBy?" by "+esc(nm(String(e.oosPhotoBy).split(" · ")[0])):""}</span>`}</div>`
            :`<button class="rq-linkbtn" id="eqdPhotoAdd" style="padding-left:0">Add photo</button>`}
          <div class="eqd-ack">${ack?`&#10003; Confirmed by <b>${esc(nm(ack.by))}</b>${ack.reply?` — &ldquo;${esc(ack.reply)}&rdquo;`:""}`:"Awaiting GSE confirm"}</div>
        </div>`:"";
      const rows=[["Category",e.type],["Subtype",e.subtype],["Specs (kVA / V / Hz)",specOf(e)],
        ["Location",e.location||"No location"],["Sub-location / spot",det],["Notes",e.notes],["Last updated",e.updated?fmtDate(e.updated):""]]
        .filter(([,v])=>v)
        .map(([l,v])=>`<div class="ui-row" style="cursor:default"><div class="ui-row__main"><div class="ui-row__sub">${esc(l)}</div><div class="ui-row__title" style="white-space:normal">${esc(v)}</div></div></div>`).join("");
      const body=`
        ${oosCard}
        <div class="ui-group">${rows}</div>
        <div class="btnrow" style="margin-top:14px">
          <button class="btn navy" id="eqdMove">Move</button>
          <button class="btn ghost" id="eqdEdit" style="flex:0 0 30%">Edit</button>
          <button class="btn ghost" id="eqdHist" style="flex:0 0 30%">History</button>
        </div>
        <div class="btnrow" style="margin-top:10px">
          ${e.oos?`<button class="btn green" id="eqdBackIn">Return to service</button>`
                 :`<button class="btn ghost" id="eqdOos" style="border-color:var(--ua-red);color:var(--ua-red)">Mark out of service</button>`}
        </div>`;
      UI.render(ROOT(),nav,{title:dtag(e.tag)||"(no tag)",sub:esc(e.type||"")+(e.location?" · "+esc(e.location):""),body,mount:r=>{
        $("#eqdMove",r).onclick=()=>requireUnlock(()=>nav.go(moveScreen(id)));
        $("#eqdEdit",r).onclick=()=>requireEditPass(()=>nav.go(editScreen(id)));
        $("#eqdHist",r).onclick=()=>nav.go(historyScreen(id));
        $("#eqdOos",r)&&($("#eqdOos").onclick=()=>pickReason(dtag(e.tag),"",v=>{setEqOos(e.id,true,v);capturePhoto(e.id);}));
        $("#eqdBackIn",r)&&($("#eqdBackIn").onclick=()=>{if(confirm(`Return ${dtag(e.tag)||"this unit"} to service?`))setEqOos(e.id,false,"");});
        $("#eqdPhotoAdd",r)&&($("#eqdPhotoAdd").onclick=()=>capturePhoto(e.id));
        $("#eqdPhotoRe",r)&&($("#eqdPhotoRe").onclick=()=>capturePhoto(e.id));
        $("#eqdPhotoDel",r)&&($("#eqdPhotoDel").onclick=()=>{if(!confirm("Remove this photo?"))return;
          try{Store.del("elt.oos.photo."+e.id);}catch(_){}
          delete e.oosPhoto;delete e.oosPhotoBy;e_when(e);save();nav.refresh();});
        $$(".gse-photo",r).forEach(img=>img.onclick=()=>enlargePhoto(img.getAttribute("src")));
      }});
    };
  }

  /* ================= add / edit ================= */
  const SPEC_HINTS={"Ground Power":"e.g. 90 kVA, 28.5 V, 400 Hz","Super Tug (STUG)":"e.g. towbarless · 50k lb capacity","PCA":"e.g. 65 ton · 400 Hz"};
  function selHTML(id,label,opts,val,extra){
    return `<span class="ui-flabel" style="margin-top:12px">${esc(label)}</span>
      <select id="${id}" class="eqd-sel">${opts.map(o=>`<option value="${esc(o.v)}"${o.v===val?" selected":""}>${esc(o.l)}</option>`).join("")}${extra||""}</select>`;
  }
  function editScreen(id){
    return function(nav){
      const e=id?data.equipment.find(x=>x.id===id):null;
      const type=e?.type||data.types[0]||"";
      const subs=(data.subtypes[type]||[]).slice();if(e?.subtype&&!subs.includes(e.subtype))subs.unshift(e.subtype);
      const locs=[...equipLocs()];if(e?.location&&!locs.includes(e.location))locs.unshift(e.location);
      const zones=(locZonesFor(e?.location||"")||[]).slice();if(e?.spot&&!zones.includes(e.spot))zones.unshift(e.spot);
      const body=UI.card(`
        ${UI.field({label:"Asset tag / ID",id:"eqdTag",value:e?.tag||"",placeholder:"e.g. GP-3081"})}
        ${selHTML("eqdType","Type / category",data.types.map(t=>({v:t,l:t})),type,`<option value="__new__">+ Add new type…</option>`)}
        ${selHTML("eqdSub","Subtype (optional)",[{v:"",l:"— None —"},...subs.map(s=>({v:s,l:s}))],e?.subtype||"",`<option value="__custom__">+ Custom…</option>`)}
        ${selHTML("eqdLoc","Location",[{v:"",l:"— No location —"},...locs.map(l=>({v:l,l}))],e?.location||"",`<option value="__other__">Other…</option>`)}
        <span id="eqdSpotWrap" ${zones.length?"":"hidden"}>${selHTML("eqdSpot","Sub-location",[{v:"",l:"— None —"},...zones.map(z=>({v:z,l:z}))],e?.spot||"")}</span>
        ${UI.field({label:"Specs (kVA / V / Hz) — optional",id:"eqdVolt",value:e?.volt||"",placeholder:SPEC_HINTS[type]||"e.g. 90 kVA, 28.5 V, 400 Hz"})}
        <span class="ui-flabel" style="margin-top:12px">Notes (optional)</span>
        <textarea id="eqdNotes" class="eqd-notes" placeholder="Condition, fuel level…">${esc(e?.notes||"")}</textarea>
        <div class="btnrow" style="margin-top:14px">
          <button class="btn navy" id="eqdSave">Save</button>
          <button class="btn ghost" id="eqdCancel" style="flex:0 0 110px">Cancel</button>
        </div>
        ${e?`<div class="btnrow" style="margin-top:8px"><button class="btn ghost" id="eqdDelete" style="border-color:var(--ua-red);color:var(--ua-red)">Delete equipment</button></div>`:""}`);
      UI.render(ROOT(),nav,{title:e?"Edit equipment":"Add equipment",sub:e?esc(dtag(e.tag)||""):"New unit joins the global list.",body,mount:r=>{
        const refreshSpots=()=>{const loc=$("#eqdLoc",r).value,z=(locZonesFor(loc)||[]);
          $("#eqdSpotWrap",r).hidden=!z.length;
          if(z.length)$("#eqdSpot",r).innerHTML=`<option value="">— None —</option>`+z.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("");};
        $("#eqdType",r).onchange=function(){
          if(this.value==="__new__"){const v=(prompt("New equipment type / category:")||"").trim();
            if(v&&!data.types.some(t=>t.toLowerCase()===v.toLowerCase())){data.types.push(v);save();}
            nav.refresh();return;}
          const t=this.value,subs2=(data.subtypes[t]||[]);
          $("#eqdSub",r).innerHTML=`<option value="">— None —</option>`+subs2.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("")+`<option value="__custom__">+ Custom…</option>`;
          $("#eqdVolt",r).placeholder=SPEC_HINTS[t]||"e.g. 90 kVA, 28.5 V, 400 Hz";
        };
        $("#eqdSub",r).onchange=function(){if(this.value!=="__custom__")return;
          const t=$("#eqdType",r).value,v=(prompt("New subtype for "+t+":")||"").trim();
          if(v){data.subtypes[t]=data.subtypes[t]||[];if(!data.subtypes[t].some(x=>x.toLowerCase()===v.toLowerCase()))data.subtypes[t].push(v);save();}
          this.innerHTML=`<option value="">— None —</option>`+(data.subtypes[t]||[]).map(s=>`<option value="${esc(s)}"${s===v?" selected":""}>${esc(s)}</option>`).join("")+`<option value="__custom__">+ Custom…</option>`;};
        $("#eqdLoc",r).onchange=function(){
          if(this.value==="__other__"){const v=(prompt("Location:")||"").trim();
            if(v){const o=document.createElement("option");o.value=v;o.textContent=v;this.insertBefore(o,this.firstChild);this.value=v;}else this.value="";}
          refreshSpots();};
        $("#eqdCancel",r).onclick=()=>nav.back();
        $("#eqdSave",r).onclick=()=>{
          const tag=$("#eqdTag",r).value.trim().toUpperCase();
          if(!tag){toast("Enter an asset tag / ID");$("#eqdTag",r).focus();return;}
          const sub=$("#eqdSub",r).value==="__custom__"?"":$("#eqdSub",r).value;
          const loc=$("#eqdLoc",r).value==="__other__"?"":$("#eqdLoc",r).value.trim();
          const spot=(locZonesFor(loc)||[]).length?($("#eqdSpot",r).value||""):"";
          const p={tag,type:$("#eqdType",r).value,subtype:sub,location:loc,spot,volt:$("#eqdVolt",r).value.trim(),notes:$("#eqdNotes",r).value.trim(),updated:todayISO(),when:Date.now()};
          if(e){const from=e.location||"",fromSpot=e.spot||"";Object.assign(e,p);logMove(e,from,p.location,"edit",fromSpot);toast("Updated");}
          else{const ni={id:uid(),...p};data.equipment.push(ni);if(ni.location)logMove(ni,"",ni.location,"add","");toast("Added");}
          save();refreshAll();nav.back();};
        $("#eqdDelete",r)&&($("#eqdDelete").onclick=()=>{
          if(!confirm(`Delete ${e.tag||"this item"} for the whole team? This can't be undone.`))return;
          data.equipment=data.equipment.filter(x=>x.id!==e.id);
          tombstone(e.id,"equip");save();refreshAll();toast("Deleted");
          nav.back();nav.back();});   // pop edit + the now-gone unit screen
      }});
    };
  }

  /* ================= move ================= */
  function moveScreen(id){
    return function(nav){
      const e=data.equipment.find(x=>x.id===id);if(!e){nav.back();return;}
      const opts=[...new Set([...equipLocs(),...data.equipment.map(x=>x.location).filter(Boolean)])].sort(natCmp);
      if(e.location&&!opts.includes(e.location))opts.unshift(e.location);
      const zones=(locZonesFor(e.location||"")||[]).slice();
      const body=UI.card(`
        ${selHTML("eqdMvLoc","New location",[{v:"",l:"— No location —"},...opts.map(l=>({v:l,l}))],e.location||"")}
        <span id="eqdMvSpotWrap" ${zones.length?"":"hidden"}>${selHTML("eqdMvSpot","Sub-location",[{v:"",l:"— None —"},...zones.map(z=>({v:z,l:z}))],e.spot||"")}</span>
        <div class="btnrow" style="margin-top:14px">
          <button class="btn navy" id="eqdMvGo">Move</button>
          <button class="btn ghost" id="eqdMvCancel" style="flex:0 0 110px">Cancel</button>
        </div>`);
      UI.render(ROOT(),nav,{title:`Move ${esc(dtag(e.tag)||"unit")}`,sub:e.location?`Now at ${esc(e.location)}.`:"Currently unassigned.",body,mount:r=>{
        const refreshSpots=()=>{const z=(locZonesFor($("#eqdMvLoc",r).value)||[]);
          $("#eqdMvSpotWrap",r).hidden=!z.length;
          if(z.length)$("#eqdMvSpot",r).innerHTML=`<option value="">— None —</option>`+z.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("");};
        $("#eqdMvLoc",r).onchange=refreshSpots;
        $("#eqdMvCancel",r).onclick=()=>nav.back();
        $("#eqdMvGo",r).onclick=()=>{
          const from=e.location||"",fromSpot=e.spot||"",to=$("#eqdMvLoc",r).value;
          const spot=(locZonesFor(to)||[]).length?($("#eqdMvSpot",r).value||""):"";
          e.location=to;e.spot=spot;e.updated=todayISO();e.when=Date.now();
          logMove(e,from,to,"quickmove",fromSpot);save();refreshAll();
          toast(to?`Moved to ${to}${spot?" · "+spot:""}`:"Location cleared");nav.back();};
      }});
    };
  }

  /* ================= history ================= */
  function historyScreen(id){
    return function(nav){
      const e=data.equipment.find(x=>x.id===id);if(!e){nav.back();return;}
      const hist=eqHistory(e);
      const rows=hist.length?hist.map(m=>{
        const det=invDetail(m.spot,m.nose);
        const samePlace=m.from&&m.from===m.to&&(m.fromSpot||"")===(m.spot||"");
        const top=samePlace?`<b>${esc(m.to)}</b> · ${m.oos?"marked out of service":"back in service"}`
          :`<b>${esc(m.from||"unassigned")} &rarr; ${esc(m.to||"unassigned")}</b>${m.oos?' <span class="eqd-oos">OOS</span>':""}`;
        const bits=[esc(fmtDate(m.date)),esc(moveShift(m)),m.by?"by "+esc(nm(m.by)):"",SRCLBL[m.source]||"",det?esc(det):""].filter(Boolean).join(" · ");
        return `<div class="ui-row" style="cursor:default"><div class="ui-row__main">
          <div class="ui-row__title" style="white-space:normal">${top}</div>
          <div class="ui-row__sub">${bits}${m.reason?` · <span style="color:var(--ua-red)">${esc(m.reason)}</span>`:""}</div></div></div>`;}).join("")
        :`<p class="rq-empty">No movement history for this unit yet.</p>`;
      UI.render(ROOT(),nav,{title:`${esc(dtag(e.tag)||"unit")} — history`,sub:e.location?`Now at ${esc(e.location)}.`:"Currently unassigned.",
        body:`<div class="ui-group">${rows}</div>`,mount:()=>{}});
    };
  }

  /* ================= sheet generator (all areas / one area / one category) ================= */
  function sheetScreen(nav){
    const natSort=natCmp;
    const areas=[...new Set(data.equipment.map(e=>e.location).filter(Boolean))].sort(natSort);
    const types=[...new Set(data.equipment.map(e=>e.type).filter(Boolean))].sort(natSort);
    const subs=[...new Set(data.equipment.filter(e=>e.location&&e.spot).map(e=>e.location+"|"+e.spot))].sort(natSort);
    const opts=`<option value="all">— All areas (everything) —</option>`+
      (areas.length?`<optgroup label="By area">`+areas.map(a=>`<option value="area:${esc(a)}">${esc(a)}</option>`).join("")+`</optgroup>`:"")+
      (subs.length?`<optgroup label="By sub-location">`+subs.map(s=>{const[l,sp]=s.split("|");return `<option value="spot:${esc(s)}">${esc(l)} · ${esc(sp)}</option>`;}).join("")+`</optgroup>`:"")+
      (types.length?`<optgroup label="By category">`+types.map(t=>`<option value="type:${esc(t)}">${esc(t)}</option>`).join("")+`</optgroup>`:"");
    const body=`${UI.card(`
        <span class="ui-flabel">Scope</span><select id="eqdScope" class="eqd-sel">${opts}</select>
        ${UI.field({label:"By",id:"auditBy",value:data.invLastBy||"",placeholder:"Your name"})}
        <div class="btnrow" style="margin-top:14px"><button class="btn navy" id="eqdGen">Generate sheet</button></div>`)}
      <div id="eqdSheetPrev"></div>`;
    UI.render(ROOT(),nav,{title:"Generate sheet",sub:"All areas, one area, or one category — grouped &amp; check-off ready.",body,mount:r=>{
      $("#eqdGen",r).onclick=()=>{
        const v=$("#eqdScope",r).value||"all";
        const scope=v.startsWith("area:")?{kind:"area",value:v.slice(5)}
          :v.startsWith("type:")?{kind:"type",value:v.slice(5)}
          :v.startsWith("spot:")?(()=>{const [loc,sub]=v.slice(5).split("|");return {kind:"spot",value:loc,sub:sub||""};})()
          :{kind:"all"};
        $("#eqdSheetPrev",r).innerHTML=`<div class="ui-card" style="margin-top:14px">${buildEquipSheetHTML(scope)}
          <div class="btnrow no-print" style="margin-top:12px"><button class="btn navy" id="eqdPrint">Print / Save as PDF</button>
          <button class="btn ghost" id="eqdTxt" style="flex:0 0 110px">Text</button></div></div>`;
        $("#eqdPrint",r).onclick=()=>{$("#printArea").innerHTML=buildEquipSheetHTML(scope);window.print();};
        $("#eqdTxt",r).onclick=()=>downloadEquipText(scope);
        $("#eqdSheetPrev",r).scrollIntoView({behavior:"smooth",block:"start"});
      };
    }});
  }

  window.EQUIP={listScreen,unitScreen,resetFilters:()=>{LQ="";initCollapse=true;}};
})();
