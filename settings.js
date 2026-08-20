/* settings.js — Settings as a UI-kit module ("Six Rows, Two Taps").
   Root = six rows, each with a live value sub-line so a rare visit usually ends at zero taps;
   every control is exactly one tap down. Anything that can hurt you — passcode, pattern lock,
   sync, demo, delete-all — lives behind the tinted Admin & security row, with the wipe in a red
   danger group at its very bottom (passcode asked fresh, double confirm — same flow as before).

   Data layer stays in the shell: data/save/curPass/askPass/logMove/fetchFleet/equipLocs/topLocs/
   STD_SHIFT_DEF/coerceTimeStr/minToTime/timeToMin/HUB_TILES/applyTileVisibility/updateHdr/
   applyBrandLabels/downloadJSON/masterSubset/fetchMaster/applyMaster/seedDemoEquip/clearDemoData/
   setPattern are all shell globals. window.SYNC / window.STAFF come from staffing.js (null-guarded).

   The catalog screens (types / subtypes / equipLocs / spots) and the tracking screen are SHARED
   factories: they render via nav.el, so the GSE stack pushes the exact same screens next to the
   data (equipment list "Manage categories", inventory "Edit locations", movement "Log settings").

   NOTE: settings.staffExclude (seeded in the shell) deliberately has no UI — it hides named
   people from staffing suggestion pools and only travels via backup import. Not dropped. */
(function(){
  const esc=UI.esc;
  const $=(s,r)=>(r||document).querySelector(s);
  const $$=(s,r)=>[...(r||document).querySelectorAll(s)];
  const ROOT=()=>$("#settingsRoot");
  let navApi=null;

  const S=()=>data.settings;
  const syncCfg=()=>Store.getJSON("elt.sync.cfg",null)||{on:true,url:"",key:""};
  const TRACK_KEYS=["trackInventory","trackEdits","trackQuickMove","trackDeletions","trackClears"];

  /* ---------------- root: six rows, live values ---------------- */
  function syncSubLine(){
    const c=syncCfg();
    if(c.on===false)return "Sync off (local only)";
    if(!c.url)return "Sync on · no backend set";
    const inn=window.SYNC&&window.SYNC.signedIn&&window.SYNC.signedIn();
    return "Sync on"+(inn?" · signed in":"");
  }
  function rootScreen(nav){
    const st=S();
    const ord=(st.nameOrder==="last")?"Last-name order":"First-name order";
    const std=((st.stdShifts&&st.stdShifts.AM)||STD_SHIFT_DEF.AM).start;
    const onN=TRACK_KEYS.filter(k=>st[k]).length;
    const tilesShown=HUB_TILES.length-(data.hiddenTiles||[]).length;
    const labelsOn=!!(st.labels&&Object.keys(st.labels).length);
    const fc=Store.getJSON(FLEET_KEY,null);
    const age=(fc&&fc.cachedAt)?("loaded "+agoStr(fc.cachedAt)):"age unknown";
    const warn=curPass()===SETTINGS_PASS;
    const row=(id,t,sub,extra,cls)=>`<button class="ui-row${cls?" "+cls:""}" data-go="${id}">
      <div class="ui-row__main"><div class="ui-row__title">${esc(t)}</div><div class="ui-row__sub">${esc(sub)}</div></div>
      ${extra||""}<span class="ui-row__chev" aria-hidden="true"></span></button>`;
    const body=`<div class="ui-group">
      ${row("team","Team & shifts",ord+" · AM "+std+" · fatigue flag at "+(st.fatigueDays||7)+" days")}
      ${row("tracking","Movement tracking",(onN?onN+" of "+TRACK_KEYS.length+" logged":"all logging off")+" · cap "+(st.moveCap||300))}
      ${row("home","Home screen & labels",tilesShown+" of "+HUB_TILES.length+" tiles shown · "+(labelsOn?"custom labels":"standard labels"))}
      ${row("catalogs","Catalogs",data.types.length+" categories · "+equipLocs().length+" locations · "+data.locations.length+" spots")}
      ${row("fleet","Fleet & backup",FLEET.length.toLocaleString()+" ships · "+age+" · export / import")}
      ${row("admin","Admin & security",syncSubLine()+" · demo "+(demoOn()?"on":"off"),
        warn?'<span class="set-warn">&#9888; default passcode</span>':"","set-admin")}
    </div>`;
    UI.render(nav.el,nav,{title:"Settings",sub:"Team configuration — everything is one tap down.",body,mount:r=>{
      $$("[data-go]",r).forEach(b=>b.onclick=()=>nav.go(SCREENS[b.dataset.go]));
    }});
  }

  /* ---------------- 1 · Team & shifts ---------------- */
  function teamScreen(nav){
    const st=S();
    const cur=st.stdShifts||STD_SHIFT_DEF;
    const lbl={AM:"AM",PM:"PM",NH:"Nighthawk"};
    const stdRows=["AM","PM","NH"].map(sh=>{const t=cur[sh]||STD_SHIFT_DEF[sh];
      return `<div class="std-row"><span class="std-lbl">${lbl[sh]}</span>
        <input class="std-t" data-sh="${sh}" data-k="start" value="${esc(t.start)}" inputmode="numeric" autocomplete="off">
        <span class="std-dash">&ndash;</span>
        <input class="std-t" data-sh="${sh}" data-k="end" value="${esc(t.end)}" inputmode="numeric" autocomplete="off"></div>`;}).join("");
    const roster=(window.STAFF&&window.STAFF.roster)?window.STAFF.roster():null;
    const supHtml=roster?(roster.map(r=>{const set=window.STAFF.hasCode(r.name);
      return `<div class="supc-row"><div><b>${esc(r.name)}</b> <span class="supc-role">${esc(r.role)}${r.temp?" · temp":""}</span> ${set?'<span class="supc-set">code set</span>':'<span class="supc-unset">no code</span>'}</div>
        <div class="supc-btns">${set?`<button class="btn ghost sm supc-reset" data-n="${esc(r.name)}">Reset code</button>`:""}${r.temp?`<button class="btn ghost sm supc-rm" data-n="${esc(r.name)}">Remove</button>`:""}</div></div>`;
    }).join("")||'<p class="hint">No supervisors.</p>'):'<p class="hint">Manpower module not loaded.</p>';
    const body=
      UI.card(`<span class="ui-flabel">Name order — boards, tug crews and sheets</span>
        ${UI.chips([{v:"first",label:"First name first"},{v:"last",label:"Last name first"}],(st.nameOrder==="last")?"last":"first","data-ord")}`)
      +`<div class="ui-card" style="margin-top:12px"><span class="ui-flabel">Standard shift times</span>
        <p class="hint" style="margin:4px 0 8px">A clock-in or clock-out that isn't one of these shows in red on the pool &amp; board.</p>
        <div id="setStdRows">${stdRows}</div></div>`
      +`<div class="ui-card" style="margin-top:12px">
        <label class="cfgrow" style="border:none;padding:6px 0"><span class="cfg-l">Fatigue warning after<small>Flags &#9888; on anyone who's worked this many days in a row, from logged manpower history.</small></span>
          <span style="display:flex;align-items:center;gap:6px;flex:none"><input type="number" id="setFatigue" min="2" max="14" step="1" style="width:64px;text-align:center" value="${st.fatigueDays||7}"><span class="cfg-l" style="font-size:13px">days</span></span></label>
        <label class="cfgrow" style="border-top:1px solid var(--line);padding:10px 0 4px"><span class="cfg-l">Allow deleting past manpowers<small>${st.allowLogDelete?"On — Delete shown on the Past view":"Off — past manpowers are read-only"}</small></span><input type="checkbox" id="setLogDel" class="cfg-chk" ${st.allowLogDelete?"checked":""}></label>
      </div>`
      +`<div class="rq-sechead">Supervisor codes</div>
       <div class="ui-card"><p class="hint" style="margin-top:0">Each supervisor sets their own code the first time they open Manpower. Reset one here if it's forgotten.</p><div id="setSup">${supHtml}</div></div>`;
    UI.render(nav.el,nav,{title:"Team & shifts",sub:"Names, standard shifts, fatigue flags, supervisor codes.",body,mount:r=>{
      $$("[data-ord]",r).forEach(b=>b.onclick=()=>{const v=b.dataset.ord==="last"?"last":"first";
        st.nameOrder=v; try{Store.setRaw("elt.staff.nameOrder",v);}catch(_){}
        save(); toast("Name order: "+(v==="last"?"Last name first":"First name first")); nav.refresh();});
      $$(".std-t",r).forEach(inp=>inp.addEventListener("change",()=>{
        const v=coerceTimeStr(inp.value);
        if(!v){inp.value=((((st.stdShifts||STD_SHIFT_DEF)[inp.dataset.sh])||{})[inp.dataset.k])||"";return;}
        st.stdShifts=st.stdShifts||JSON.parse(JSON.stringify(STD_SHIFT_DEF));
        st.stdShifts[inp.dataset.sh]=st.stdShifts[inp.dataset.sh]||{...STD_SHIFT_DEF[inp.dataset.sh]};
        st.stdShifts[inp.dataset.sh][inp.dataset.k]=v; inp.value=v; save(); toast("Standard shift times saved");}));
      $("#setFatigue",r).onchange=e=>{let n=parseInt(e.target.value,10);if(isNaN(n))n=7;n=Math.max(2,Math.min(14,n));
        st.fatigueDays=n;e.target.value=n;save();toast("Fatigue warning set to "+n+" days");};
      $("#setLogDel",r).onchange=()=>{st.allowLogDelete=$("#setLogDel",r).checked;save();
        toast(st.allowLogDelete?"Past manpowers can be deleted":"Past manpowers are read-only");nav.refresh();};
      $$("#setSup .supc-reset",r).forEach(b=>b.onclick=()=>{ if(confirm("Reset "+b.dataset.n+"'s code? They'll set a new one next time.")){ window.STAFF.resetCode(b.dataset.n); nav.refresh(); } });
      $$("#setSup .supc-rm",r).forEach(b=>b.onclick=()=>{ if(confirm("Remove temporary supervisor "+b.dataset.n+"?")){ window.STAFF.removeTempSup(b.dataset.n); window.STAFF.resetCode(b.dataset.n); nav.refresh(); } });
      // pull the latest shared codes so "code set / no code" reflects every device
      if(window.STAFF&&window.STAFF.syncCodes)window.STAFF.syncCodes().then(ch=>{ if(ch)SETTINGS.refresh(); });
    }});
  }

  /* ---------------- 2 · Movement tracking [SHARED — movement.js pushes this] ---------------- */
  function trackingScreen(nav){
    const st=S();
    const tog=(k,l,d)=>`<label class="cfgrow"><span class="cfg-l">${l}${d?`<small>${d}</small>`:""}</span><input type="checkbox" class="cfg-chk" data-k="${k}" ${st[k]?"checked":""}></label>`;
    const tm=(k,l)=>`<div class="cfg-time"><label>${l} starts</label><input type="time" class="cfg-shift" data-k="${k}" value="${minToTime(st[k])}"></div>`;
    const nmf=(k,ph)=>`<input type="text" class="cfg-sname" data-k="${k}" value="${esc(st[k]||"")}" placeholder="${ph}">`;
    const body=
      UI.card(`<span class="ui-flabel">What gets recorded in the movement log</span>
        ${tog("trackInventory","Inventory counts","When you count a location")}
        ${tog("trackEdits","Manual edits","Changing a unit's location in its editor")}
        ${tog("trackQuickMove","Quick moves","The &#8644; move button on the list")}
        ${tog("trackDeletions","Location deletions","Units unassigned when a location is deleted")}
        ${tog("trackClears","Clear to unassigned","Units dropped from a location during a recount")}`)
      +`<div class="ui-card" style="margin-top:12px"><span class="ui-flabel">Shift split (by clock time)</span>
        <div class="cfg-shifts" style="margin-top:8px">${tm("shiftAM","AM")}${tm("shiftPM","PM")}${tm("shiftNH","Nighthawk")}</div>
        <span class="ui-flabel" style="margin-top:12px">Shift names</span>
        <div class="cfg-shifts" style="margin-top:8px">${nmf("shiftNameNH","Nighthawk")}${nmf("shiftNameAM","AM")}${nmf("shiftNamePM","PM")}</div></div>`
      +`<div class="ui-card" style="margin-top:12px"><span class="ui-flabel">Log size</span>
        <div class="toolbar" style="margin:8px 0 0"><input id="setMoveCap" inputmode="numeric" style="max-width:120px" value="${st.moveCap||300}"><span class="hint" style="align-self:center;margin:0">most recent moves kept</span></div></div>`;
    UI.render(nav.el,nav,{title:"Movement tracking",sub:"What the movement log records and how the day splits.",body,mount:r=>{
      $$(".cfg-chk[data-k]",r).forEach(c=>c.onchange=()=>{st[c.dataset.k]=c.checked;save();});
      $$(".cfg-shift",r).forEach(c=>c.onchange=()=>{st[c.dataset.k]=timeToMin(c.value);save();});
      $$(".cfg-sname",r).forEach(c=>c.onchange=()=>{st[c.dataset.k]=c.value.trim()||c.dataset.k;save();});
      $("#setMoveCap",r).onchange=()=>{const v=Math.max(10,Math.min(2000,parseInt($("#setMoveCap",r).value)||300));
        st.moveCap=v;$("#setMoveCap",r).value=v;if(data.movements.length>v)data.movements=data.movements.slice(-v);save();};
    }});
  }

  /* ---------------- 3 · Home screen & labels ---------------- */
  function homeLabelsScreen(nav){
    const st=S();
    const hidden=new Set(data.hiddenTiles||[]);
    const tiles=HUB_TILES.map(([k,l])=>`<label class="cfgrow"><span class="cfg-l">${esc(l)}</span><input type="checkbox" class="tile-chk" data-k="${k}" ${hidden.has(k)?"":"checked"}></label>`).join("");
    const L=st.labels||{};
    const val=(g,k)=>g==="top"?(L[k]!=null?L[k]:""):((L[g]&&L[g][k]!=null)?L[g][k]:"");
    const lfield=(g,k,label,def)=>`<label class="lbl-row"><span>${esc(label)}</span><input data-lg="${g}" data-lk="${esc(k)}" placeholder="${esc(def)}" value="${esc(val(g,k))}" autocomplete="off" spellcheck="false"></label>`;
    const top=[["sheetTitle","Staffing sheet title","EWR AMT STAFFING"],["briefTitle","Briefing title","DAILY MOVE TEAM SHIFT BRIEFING"],["wordmark","App name (header)","Operational Success"],["eyebrow","Header eyebrow — blank hides it","United Ground Ops"],["eosTitle","End-of-shift report title","EWR Move Team — Shift EWR Report"],["equipBrand","Equipment-list heading","EWR MOVE TEAM"]];
    const areas=[["Ballpark","Ballpark"],["WestPark","WestPark"],["South Team","South Team"],["Terminal B","Terminal B"],["APU","APU/T.O.C.S"],["Support","Support"],["C4","C4"]];
    const tugs=[["TBL-400","TBL-400"],["TBL-280","TBL-280"],["GOLDHOFER","GOLDHOFER"],["Kalmar","Kalmar"]];
    const body=
      UI.card(`<span class="ui-flabel">Hub tiles — turn off what you don't use</span>${tiles}`)
      +`<div class="ui-card" style="margin-top:12px"><span class="ui-flabel">Names &amp; labels</span>
        <p class="hint" style="margin:4px 0 0">Rename titles, areas and tug types. Blank = keep the built-in name. Syncs to the whole team.</p>
        <div class="lbl-grp">Titles &amp; app name</div>${top.map(([k,la,def])=>lfield("top",k,la,def)).join("")}
        <div class="lbl-grp">Area names</div>${areas.map(([k,def])=>lfield("areas",k,def,def)).join("")}
        <div class="lbl-grp">Tug types</div>${tugs.map(([k,def])=>lfield("tugTypes",k,def,def)).join("")}
        <div class="btnrow" style="margin-top:12px"><button class="btn sm navy" id="setLblSave" style="width:auto">Save names</button><button class="btn sm ghost" id="setLblReset" style="width:auto">Reset all</button></div></div>`;
    UI.render(nav.el,nav,{title:"Home screen & labels",sub:"Tiles and every rename.",body,mount:r=>{
      $$(".tile-chk",r).forEach(c=>c.onchange=()=>{
        const set=new Set(data.hiddenTiles||[]);
        if(c.checked)set.delete(c.dataset.k);else set.add(c.dataset.k);
        data.hiddenTiles=[...set];save();applyTileVisibility();});
      $("#setLblSave",r).onclick=()=>{const lab={areas:{},tugTypes:{}};
        $$("input[data-lk]",r).forEach(inp=>{const g=inp.dataset.lg,k=inp.dataset.lk,v=inp.value.trim();
          if(g==="top"){ if(k==="eyebrow")lab.eyebrow=v; else if(v)lab[k]=v; } else if(v)lab[g][k]=v; });
        if(!Object.keys(lab.areas).length)delete lab.areas; if(!Object.keys(lab.tugTypes).length)delete lab.tugTypes;
        st.labels=lab; save(); applyBrandLabels(); toast("Names saved — synced to the team"); nav.refresh();};
      $("#setLblReset",r).onclick=()=>{ if(!confirm("Reset every name back to its default?"))return;
        delete st.labels; save(); applyBrandLabels(); toast("Names reset to defaults"); nav.refresh();};
    }});
  }

  /* ---------------- 4 · Catalogs (index) ---------------- */
  function catalogsScreen(nav){
    const nSubs=Object.values(data.subtypes||{}).reduce((a,x)=>a+(x||[]).length,0);
    const nZones=Object.values(data.locZones||{}).reduce((a,x)=>a+(x||[]).length,0);
    const row=(id,t,sub)=>`<button class="ui-row" data-go="${id}">
      <div class="ui-row__main"><div class="ui-row__title">${esc(t)}</div><div class="ui-row__sub">${esc(sub)}</div></div>
      <span class="ui-row__chev" aria-hidden="true"></span></button>`;
    const body=`<div class="ui-group">
      ${row("types","Equipment categories",data.types.length+" categories · "+nSubs+" subtype presets")}
      ${row("equipLocs","Inventory locations",equipLocs().length+" locations · "+nZones+" sub-locations")}
      ${row("spots","Areas & spots",data.locations.length+" spots"+(hiddenCount()?" · "+hiddenCount()+" hidden":""))}
    </div>
    <p class="saf-note">These lists are also editable next to the data — from the equipment list and Do Inventory.</p>`;
    UI.render(nav.el,nav,{title:"Catalogs",sub:"The lists everything else is built from.",body,mount:r=>{
      $$("[data-go]",r).forEach(b=>b.onclick=()=>nav.go(SCREENS[b.dataset.go]));
    }});
  }

  /* ---- 4a · Equipment categories [SHARED — equipment.js pushes this] ---- */
  function typesScreen(nav){
    const rows=data.types.map((t,i)=>{const n=(data.subtypes[t]||[]).length;
      return `<div class="manage-row"><span class="ty-name" data-i="${i}" title="Tap for presets">${esc(t)}${n?` <span class="pill st">${n} preset${n===1?"":"s"}</span>`:""}</span>
        <button class="iconbtn ty-up" data-i="${i}" title="Up"${i===0?" disabled":""}>&#9650;</button>
        <button class="iconbtn ty-down" data-i="${i}" title="Down"${i===data.types.length-1?" disabled":""}>&#9660;</button>
        <button class="iconbtn ty-del" data-i="${i}" title="Remove">&#10005;</button></div>`;}).join("")||`<p class="hint">No categories yet.</p>`;
    const body=UI.card(`<p class="hint" style="margin:0 0 8px">Tap a category for its subtype presets &amp; rename. &#9650;&#9660; reorders the list everywhere.</p>
      <div id="setTypes">${rows}</div>
      <div class="toolbar" style="margin-top:10px;margin-bottom:0"><input id="setNewType" placeholder="Add a category (e.g. Belt Loader)" autocomplete="off"><button class="btn sm navy" id="setAddType" style="width:auto">Add</button></div>`);
    UI.render(nav.el,nav,{title:"Equipment categories",sub:data.types.length+" categories — they group the list and the sheets.",body,mount:r=>{
      $("#setTypes",r).onclick=e=>{const t=e.target.closest("button,.ty-name");if(!t)return;
        const i=+t.dataset.i,T=data.types;
        if(t.classList.contains("ty-del")){const old=T[i];
          if(data.equipment.some(eq=>eq.type===old)&&!confirm(`"${old}" is in use. Remove anyway? (equipment keeps its label)`))return;
          T.splice(i,1);}
        else if(t.classList.contains("ty-up")&&i>0){[T[i-1],T[i]]=[T[i],T[i-1]];}
        else if(t.classList.contains("ty-down")&&i<T.length-1){[T[i+1],T[i]]=[T[i],T[i+1]];}
        else if(t.classList.contains("ty-name")||t.closest(".ty-name")){nav.go(subtypesScreen(T[i]));return;}
        else return;
        save();refreshAll();nav.refresh();};
      const add=()=>{const v=$("#setNewType",r).value.trim();if(!v)return;
        if(data.types.some(x=>x.toLowerCase()===v.toLowerCase())){toast("Category already exists");return;}
        data.types.push(v);save();toast("Category added");nav.refresh();};
      $("#setAddType",r).onclick=add;
      $("#setNewType",r).onkeydown=e=>{if(e.key==="Enter")add();};
    }});
  }

  /* ---- 4b · Subtype presets for one category [SHARED factory] ---- */
  function subtypesScreen(cat0){
    let cat=cat0;
    return function(nav){
      if(!data.types.includes(cat)){nav.back();return;}
      const subs=data.subtypes[cat]||[];
      const chipsHtml=subs.length
        ?`<div class="le-subs" style="margin:10px 0 0">`+subs.map((s,i)=>`<span class="le-sub">${esc(s)}<button class="le-subdel" data-i="${i}" title="Remove">&#10005;</button></span>`).join("")+`</div>`
        :`<p class="hint" style="margin:10px 0 0">No subtypes for ${esc(cat)} yet.</p>`;
      const inUse=data.equipment.filter(e=>e.type===cat).length;
      const body=
        UI.card(`<span class="ui-flabel">Subtype presets</span>
          <p class="hint" style="margin:4px 0 0">The dropdown choices when a ${esc(cat)} unit gets a subtype (e.g. Stairs &rarr; Airbus, Wide-body).</p>
          ${chipsHtml}
          <div class="toolbar" style="margin-top:10px;margin-bottom:0"><input id="setNewSub" placeholder="Add a subtype" autocomplete="off"><button class="btn sm navy" id="setAddSub" style="width:auto">Add</button></div>`)
        +`<div class="ui-card" style="margin-top:12px"><span class="ui-flabel">Rename this category</span>
          <p class="hint" style="margin:4px 0 8px">${inUse?inUse+" unit"+(inUse===1?"":"s")+" update with it.":"No units use it yet."}</p>
          <div class="toolbar" style="margin-bottom:0"><input id="setRenCat" value="${esc(cat)}" autocomplete="off"><button class="btn sm navy" id="setRenGo" style="width:auto">Rename</button></div></div>`;
      UI.render(nav.el,nav,{title:cat,sub:"Presets & rename.",body,mount:r=>{
        $$(".le-subdel",r).forEach(b=>b.onclick=()=>{const arr=data.subtypes[cat]||[];arr.splice(+b.dataset.i,1);
          if(arr.length)data.subtypes[cat]=arr;else delete data.subtypes[cat];save();nav.refresh();});
        const add=()=>{const v=$("#setNewSub",r).value.trim();if(!v)return;
          data.subtypes[cat]=data.subtypes[cat]||[];
          if(data.subtypes[cat].some(x=>x.toLowerCase()===v.toLowerCase())){toast("Already listed");return;}
          data.subtypes[cat].push(v);save();toast("Subtype added");nav.refresh();};
        $("#setAddSub",r).onclick=add;
        $("#setNewSub",r).onkeydown=e=>{if(e.key==="Enter")add();};
        $("#setRenGo",r).onclick=()=>{const v=$("#setRenCat",r).value.trim();if(!v||v===cat)return;
          if(data.types.some(x=>x!==cat&&x.toLowerCase()===v.toLowerCase())){toast("Category already exists");return;}
          const i=data.types.indexOf(cat);data.types[i]=v;
          data.equipment.forEach(eq=>{if(eq.type===cat)eq.type=v;});
          if(data.subtypes[cat]){data.subtypes[v]=data.subtypes[cat];delete data.subtypes[cat];}
          cat=v;save();refreshAll();toast("Category renamed");nav.refresh();};
      }});
    };
  }

  /* ---- 4c · Inventory locations & sub-locations [SHARED — inventory.js pushes this] ----
     Merges the old settings list (reorder) with the old overlay editor (rename-cascade incl.
     locZones key migration, delete-with-unassign + logMove, merge → parent · sub, sub-locations). */
  function equipLocsScreen(nav){
    // bake the FULL set (incl. locations only referenced by equipment) so every tile is editable
    const baked=topLocs().slice();data.locZones=data.locZones||{};
    if(JSON.stringify(baked)!==JSON.stringify(data.equipLocs||[])){data.equipLocs=baked;save();}
    const L=data.equipLocs;
    const rows=L.map((l,i)=>{
      const subs=(data.locZones[l]||[]);
      const cnt=data.equipment.filter(eq=>eq.location===l).length;
      const subHtml=subs.map((s,j)=>`<span class="le-sub">${esc(s)}<button class="le-subdel" data-li="${i}" data-sj="${j}" title="Remove">&#10005;</button></span>`).join("")
        ||`<span class="le-none">No sub-locations</span>`;
      return `<div class="le-row">
        <div class="le-head"><button class="le-lname" data-li="${i}" title="Tap to rename">${esc(l)}</button>${cnt?`<span class="le-cnt">${cnt} unit${cnt===1?"":"s"}</span>`:""}
          <button class="iconbtn le-up" data-li="${i}" title="Up"${i===0?" disabled":""}>&#9650;</button>
          <button class="iconbtn le-down" data-li="${i}" title="Down"${i===L.length-1?" disabled":""}>&#9660;</button>
          <button class="iconbtn le-merge" data-li="${i}" title="Merge into another location">&#10549;</button>
          <button class="iconbtn le-del" data-li="${i}" title="Delete location">&#10005;</button></div>
        <div class="le-subs">${subHtml}</div>
        <div class="le-addrow"><input class="le-subin" data-li="${i}" placeholder="Add sub-location" autocomplete="off"><button class="btn sm ghost le-subadd" data-li="${i}" style="width:auto">&#65291;</button></div>
      </div>`;}).join("")||`<p class="hint">No locations yet — add one below.</p>`;
    const body=UI.card(`<p class="hint" style="margin:0 0 8px">The tiles in <b>Do Inventory</b>, in this order (&#9650;&#9660;). Tap a name to rename; deleting unassigns its units (logged in Movement).</p>
      <div id="setLocEd">${rows}</div>
      <div class="toolbar" style="margin-top:10px;margin-bottom:0"><input id="setNewLoc" placeholder="Add a location / zone" autocomplete="off"><button class="btn sm navy" id="setAddLoc" style="width:auto">Add</button></div>`);
    UI.render(nav.el,nav,{title:"Inventory locations",sub:L.length+" locations · sub-locations show inside the count.",body,mount:r=>{
      $("#setLocEd",r).onclick=e=>{const t=e.target.closest("button");if(!t)return;
        const i=+t.dataset.li;
        if(t.classList.contains("le-del")){const name=L[i],cnt=data.equipment.filter(eq=>eq.location===name).length;
          if(cnt&&!confirm(`"${name}" has ${cnt} unit${cnt===1?"":"s"} here. Delete this location? Those units move to unassigned (logged in Movement).`))return;
          data.equipment.forEach(eq=>{if(eq.location===name){const from=eq.location;eq.location="";eq.spot="";eq.nose="";eq.oos=false;eq.updated=todayISO();eq.when=Date.now();logMove(eq,from,"","delete");}});
          L.splice(i,1);delete data.locZones[name];}
        else if(t.classList.contains("le-up")&&i>0){[L[i-1],L[i]]=[L[i],L[i-1]];}
        else if(t.classList.contains("le-down")&&i<L.length-1){[L[i+1],L[i]]=[L[i],L[i+1]];}
        else if(t.classList.contains("le-lname")){const old=L[i],v=(prompt("Rename location:",old)||"").trim();if(!v||v===old)return;
          if(L.some((x,j)=>j!==i&&x.toLowerCase()===v.toLowerCase())){toast("Already in the list");return;}
          L[i]=v;data.equipment.forEach(eq=>{if(eq.location===old){eq.location=v;eq.updated=todayISO();eq.when=Date.now();}});
          if(data.locZones[old]){data.locZones[v]=data.locZones[old];delete data.locZones[old];}}
        else if(t.classList.contains("le-subadd")){const inp=$(`.le-subin[data-li="${i}"]`,r);const v=(inp&&inp.value||"").trim();if(!v)return;
          const name=L[i];data.locZones[name]=data.locZones[name]||[];
          if(data.locZones[name].some(x=>x.toLowerCase()===v.toLowerCase())){toast("Already listed");return;}
          data.locZones[name].push(v);}
        else if(t.classList.contains("le-merge")){mergeInvLoc(L[i],nav);return;}
        else if(t.classList.contains("le-subdel")){const j=+t.dataset.sj,name=L[i];if(data.locZones[name])data.locZones[name].splice(j,1);}
        else return;
        save();refreshAll();if(window.GSE)GSE.refresh();nav.refresh();};
      $("#setLocEd",r).onkeydown=e=>{if(e.key==="Enter"&&e.target.classList.contains("le-subin")){e.preventDefault();
        const i=e.target.dataset.li;const b=$(`.le-subadd[data-li="${i}"]`,r);if(b)b.click();}};
      const add=()=>{const v=$("#setNewLoc",r).value.trim();if(!v)return;
        if(L.some(x=>x.toLowerCase()===v.toLowerCase())){toast("Already in the list");return;}
        L.push(v);save();toast("Location added");nav.refresh();};
      $("#setAddLoc",r).onclick=add;
      $("#setNewLoc",r).onkeydown=e=>{if(e.key==="Enter")add();};
    }});
  }
  // merge a location into a parent so it becomes a sub-location (units move: location=parent, spot=sub)
  function mergeInvLoc(name,nav){
    const cnt=data.equipment.filter(e=>(e.location||"")===name).length;
    const parent=(prompt(`Merge "${name}" under which location? It becomes a sub-location there (its ${cnt} unit${cnt===1?"":"s"} move with it).`,"")||"").trim();
    if(!parent)return;
    if(parent.toLowerCase()===name.toLowerCase()){toast("Pick a different location");return;}
    let sub=name;const rx=new RegExp("^"+parent.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"[\\s/-]+","i");
    sub=name.replace(rx,"").trim()||name;
    if(!data.equipLocs.some(x=>x.toLowerCase()===parent.toLowerCase()))data.equipLocs.push(parent);
    data.locZones[parent]=data.locZones[parent]||[];
    if(!data.locZones[parent].some(x=>x.toLowerCase()===sub.toLowerCase()))data.locZones[parent].push(sub);
    data.equipment.forEach(e=>{if((e.location||"")===name){e.location=parent;e.spot=sub;e.updated=todayISO();e.when=Date.now();}});
    data.equipLocs=data.equipLocs.filter(x=>x!==name);delete data.locZones[name];
    save();refreshAll();if(window.GSE)GSE.refresh();toast(`Merged ${name} → ${parent} · ${sub}`);nav.refresh();
  }

  /* ---- 4d · Areas & spots [SHARED] ---- */
  let showHiddenSpots=false,addAc=false,bulkAc2=true;
  function spotsScreen(nav){
    const hc=hiddenCount();
    VIS_ALL=showHiddenSpots;
    const listHtml=data.locations.length?regionsOrdered().map(rg=>{const as=areasInRegion(rg);if(!as.length)return "";
      return regionHdr(rg)+as.map(a=>`<div class="areahdr">${esc(a)}</div>`+
        spotsInArea(a).map(l=>{const i=data.locations.indexOf(l);
          return `<div class="manage-row"${l.hidden?' style="opacity:.55"':''}><span>${esc(l.name)} ${l.holdsAircraft?'<span class="pill ac">&#9992;</span>':'<span class="pill st">staging</span>'} ${l.hidden?'<span class="pill st">hidden</span>':''}</span>
            <button class="iconbtn loc-hide" data-i="${i}" title="${l.hidden?'Unhide':'Hide'}">${l.hidden?'&#10680;':'&#9675;'}</button>
            <button class="iconbtn loc-ac" data-i="${i}" title="Toggle aircraft">&#9992;</button>
            <button class="iconbtn loc-del" data-i="${i}" title="Remove">&#10005;</button></div>`;}).join("")).join("");}).join("")
      :`<p class="hint">No spots yet.</p>`;
    VIS_ALL=false;
    const taWrap=(id,ph)=>`<div class="ui-ta-wrap"><input id="${id}" placeholder="${ph}" autocomplete="off"><div class="ui-ta-list" hidden></div></div>`;
    const body=
      UI.card(`${hc?`<button class="btn ghost sm" id="setShowHid" style="width:100%;margin-bottom:10px">${showHiddenSpots?"&#10680; Hide hidden":"&#9675; Show hidden ("+hc+")"}</button>`:""}
        <div id="setSpotList" style="max-height:340px;overflow:auto">${listHtml}</div>`)
      +`<div class="ui-card" style="margin-top:12px"><span class="ui-flabel">Add a spot</span>
        <input id="setNewSpot" placeholder="Spot name e.g. AML17, Staging Area" autocomplete="off" style="margin-top:6px">
        <div class="row2" style="margin-top:8px">${taWrap("setSpotArea","Area e.g. Amelia")}
          <button type="button" class="chip${addAc?" sel":""}" id="setSpotAc" style="text-align:center">Holds aircraft</button></div>
        <button class="btn sm navy" id="setSpotAdd" style="width:100%;margin-top:8px">Add spot</button></div>`
      +`<div class="ui-card" style="margin-top:12px"><span class="ui-flabel">Bulk add a range</span>
        <p class="hint" style="margin:4px 0 6px">Prefix <b>AML</b>, 17 &rarr; 38 makes AML17&hellip;AML38.</p>
        <div class="row3"><input id="setBPre" placeholder="Prefix AML" autocomplete="off"><input id="setBFrom" inputmode="numeric" placeholder="From 17"><input id="setBTo" inputmode="numeric" placeholder="To 38"></div>
        <div class="row2" style="margin-top:8px">${taWrap("setBArea","Area e.g. Amelia")}
          <button type="button" class="chip${bulkAc2?" sel":""}" id="setBAc" style="text-align:center">Holds aircraft</button></div>
        <button class="btn sm navy" id="setBulkGo" style="width:100%;margin-top:8px">Generate spots</button></div>`;
    UI.render(nav.el,nav,{title:"Areas & spots",sub:data.locations.length+" spots — what Secure, Park and inventory point at.",body,mount:r=>{
      const sh=$("#setShowHid",r);if(sh)sh.onclick=()=>{showHiddenSpots=!showHiddenSpots;nav.refresh();};
      $("#setSpotList",r).onclick=e=>{
        const hd=e.target.closest(".loc-hide"),ac=e.target.closest(".loc-ac"),d=e.target.closest(".loc-del");
        if(hd){const l=data.locations[+hd.dataset.i];l.hidden=!l.hidden;save();refreshAll();nav.refresh();return;}
        if(ac){const l=data.locations[+ac.dataset.i];l.holdsAircraft=!l.holdsAircraft;save();nav.refresh();return;}
        if(d){const l=data.locations[+d.dataset.i];if(!confirm(`Remove "${l.name}"?`))return;
          data.locations.splice(+d.dataset.i,1);save();refreshAll();nav.refresh();}};
      // area typeaheads (kit rule: known-dataset inputs get UI.typeahead — both add & bulk)
      const areaSource=q=>{const ql=q.toLowerCase();const o=[];
        data.locations.forEach(l=>{if(!o.includes(l.area))o.push(l.area);});
        return o.filter(a=>a&&a.toLowerCase().includes(ql)).slice(0,8).map(a=>({v:a,label:a}));};
      [["#setSpotArea"],["#setBArea"]].forEach(([sel])=>{
        const inp=$(sel,r);UI.typeahead(inp,inp.parentElement.querySelector(".ui-ta-list"),{min:1,source:areaSource});});
      $("#setSpotAc",r).onclick=()=>{addAc=!addAc;$("#setSpotAc",r).classList.toggle("sel",addAc);};
      $("#setBAc",r).onclick=()=>{bulkAc2=!bulkAc2;$("#setBAc",r).classList.toggle("sel",bulkAc2);};
      $("#setSpotAdd",r).onclick=()=>{
        const name=$("#setNewSpot",r).value.trim(),area=$("#setSpotArea",r).value.trim()||name;
        if(!name)return;
        if(data.locations.some(l=>l.name.toLowerCase()===name.toLowerCase())){toast("That spot exists");return;}
        data.locations.push({name,area,holdsAircraft:addAc,region:regionOfArea(area)});
        save();refreshAll();toast("Spot added");nav.refresh();};
      $("#setBulkGo",r).onclick=()=>{
        const pre=$("#setBPre",r).value.trim(),s=parseInt($("#setBFrom",r).value,10),en=parseInt($("#setBTo",r).value,10),area=$("#setBArea",r).value.trim()||pre;
        if(isNaN(s)||isNaN(en)||en<s){toast("Enter a valid number range");return;}
        if(en-s>500){toast("Range too large");return;}
        let added=0;for(let i=s;i<=en;i++){const name=pre+i;
          if(!data.locations.some(l=>l.name.toLowerCase()===name.toLowerCase())){data.locations.push({name,area,holdsAircraft:bulkAc2,region:regionOfArea(area)});added++;}}
        save();refreshAll();toast(`Added ${added} spot(s)`);nav.refresh();};
    }});
  }

  /* ---------------- 5 · Fleet & backup ---------------- */
  function fleetScreen(nav){
    const fc=Store.getJSON(FLEET_KEY,null);
    const age=(fc&&fc.cachedAt)?agoStr(fc.cachedAt):"unknown";
    const body=
      UI.card(`<span class="ui-flabel">Aircraft fleet</span>
        <p class="hint" style="margin:4px 0 10px"><b>${FLEET.length.toLocaleString()}</b> aircraft loaded (ship # &rarr; tail # + type) · list loaded ${esc(age)}. Type a ship number anywhere and the tail + type fill in; unknown ones you enter are remembered.</p>
        <div class="btnrow"><button class="btn ghost" id="setFleetReload">&#8635; Reload fleet</button>
        <a class="btn ghost" href="https://docs.google.com/spreadsheets/d/1ZlYgN_IZmd6CSx_nXnuP0L0PiodapDRx3RmNkIpxXAo/htmlview" target="_blank" rel="noopener" style="text-align:center;text-decoration:none;line-height:1.2">Look up ship #</a></div>`)
      +`<div class="ui-card" style="margin-top:12px"><span class="ui-flabel">Backup</span>
        <p class="hint" style="margin:4px 0 10px">Export equipment, areas/spots, types and locations as one file — update the shared page, back it up, or load on another phone. Never includes the passcode, movements or reports.</p>
        <div class="btnrow"><button class="btn ghost" id="setExport">&darr; Export all data</button><button class="btn ghost" id="setImport">&uarr; Import</button></div></div>`
      +`<div class="ui-card" style="margin-top:12px"><span class="ui-flabel">Master list (shared on the page)</span>
        <p class="hint" style="margin:4px 0 10px">To make your list global: Export, save as <code>equipment.json</code>, add it to the repo. New phones auto-load it.</p>
        <button class="btn ghost" id="setMaster" style="width:100%">&#8635; Load master list</button>
        <p class="hint" id="setMasterStatus" style="margin-bottom:0"></p></div>`;
    UI.render(nav.el,nav,{title:"Fleet & backup",sub:"The aircraft list, exports, and the shared master.",body,mount:r=>{
      $("#setFleetReload",r).onclick=async()=>{toast("Reloading fleet…");
        const ok=await fetchFleet();toast(ok?"Fleet reloaded":"Couldn't reach fleet file");nav.refresh();};
      $("#setExport",r).onclick=()=>{if(!data.equipment.length){toast("Add some equipment first");return;}
        downloadJSON("equipment.json","Saved equipment.json — equipment data only, safe to share",masterSubset(data));};
      $("#setImport",r).onclick=()=>{
        const inp=document.createElement("input");inp.type="file";inp.accept="application/json,.json";
        inp.onchange=()=>{const f=inp.files[0];if(!f)return;const rd=new FileReader();
          rd.onload=()=>{try{const d=JSON.parse(rd.result);if(!Array.isArray(d.equipment))throw 0;
            if(!confirm(`Import ${d.equipment.length} items? This replaces your current data.`))return;
            Store.setJSON(KEY,d);data=load();
            save();refreshAll();if(window.GSE)GSE.refresh();toast("Imported");nav.refresh();
          }catch(err){alert("That file isn't a valid backup.");}};
          rd.readAsText(f);};
        inp.click();};
      $("#setMaster",r).onclick=async()=>{const stat=$("#setMasterStatus",r);stat.textContent="Checking the page…";
        const m=await fetchMaster();
        if(!m){stat.textContent="No master list yet. Export your data, add it as equipment.json.";return;}
        const n=m.equipment.length;
        if(!data.equipment.length||confirm(`Master list has ${n} item(s). Replace your current data with it?`)){
          applyMaster(m);Store.setRaw(SEEN_KEY,"1");refreshAll();if(window.GSE)GSE.refresh();
          stat.textContent=`Loaded ${n} item(s) from the master list.`;}};
    }});
  }

  /* ---------------- 6 · Admin & security ---------------- */
  function adminScreen(nav){
    const c=syncCfg();
    const signedIn=window.SYNC&&window.SYNC.signedIn&&window.SYNC.signedIn();
    const demo=demoOn();
    const h=(window.SYNC&&window.SYNC.health&&window.SYNC.health())||null;
    let healthTxt="No sync activity yet this session.",healthCls="sync-health";
    if(h&&(h.lastOk||h.lastErr)){
      const okNewer=(h.lastOk||0)>=(h.lastErr||0);
      if(okNewer){healthCls="sync-health ok";healthTxt="✓ Synced "+agoStr(h.lastOk)+(h.pending?" · "+h.pending+" pending":"");}
      else{healthCls="sync-health bad";healthTxt="⚠︎ Last sync failed "+agoStr(h.lastErr)+(h.lastErrMsg?" — "+h.lastErrMsg:"")+(h.lastOk?" · last ok "+agoStr(h.lastOk):"");}
    }
    const body=
      UI.card(`${curPass()===SETTINGS_PASS?`<div class="pass-warn">&#9888;&#xfe0e; You're still using the default passcode. Set your own before the team uses this.</div>`:""}
        <span class="ui-flabel">App passcode</span>
        <p class="hint" style="margin:4px 0 8px">Unlocks Settings, the inventory location editor, and the movement-log wipe. 3&ndash;8 digits.</p>
        <div class="toolbar" style="margin-bottom:0"><input id="setPassNew" type="text" inputmode="numeric" placeholder="New passcode" autocomplete="off" maxlength="8"><button class="btn sm navy" id="setPassGo" style="width:auto">Update</button></div>`)
      +`<div class="ui-card" style="margin-top:12px"><span class="ui-flabel">Equipment pattern lock</span>
        <p class="hint" style="margin:4px 0 8px">${data.lockPattern?"A pattern is set — it gates equipment edits.":"No pattern set — equipment edits use the passcode."}</p>
        <button class="btn ghost" id="setPatBtn" style="width:100%">${data.lockPattern?"Change pattern":"Set lock pattern"}</button></div>`
      +`<div class="ui-card" style="margin-top:12px"><span class="ui-flabel">Team sync (online)</span>
        <p class="hint" style="margin:4px 0 4px">Shares the whole site across supervisors. Demo mode stays local. Turn off to go fully local (offline).</p>
        <label class="cfgrow" style="border:none;padding:6px 0"><span class="cfg-l">Online sync<small>${c.on!==false?(c.url?" · sharing with the team":" · no backend set"):" · off (local only)"}</small></span><input type="checkbox" id="setSyncOn" class="cfg-chk" ${c.on!==false?"checked":""}></label>
        ${c.on!==false?`<div class="${healthCls}">${esc(healthTxt)}</div>`:""}
        ${signedIn
          ?`<div class="sync-auth-status" style="margin-top:8px">&#10003; Signed in as <b>${esc((window.SYNC.email&&window.SYNC.email())||"team")}</b></div>
            <div class="btnrow" style="margin-top:8px"><button class="btn ghost" id="setSignOut" style="flex:0 0 120px">Sign out</button></div>`
          :`<div style="margin-top:8px"><input id="setSyncEmail" type="email" autocomplete="username" placeholder="Team email">
            <input id="setSyncPass" type="password" autocomplete="current-password" placeholder="Team password" style="margin-top:6px">
            <div class="btnrow" style="margin-top:8px"><button class="btn navy" id="setSignIn" style="flex:0 0 120px">Sign in</button></div></div>`}
        <p class="hint" id="setSyncMsg" style="margin:6px 0 0"></p>
        <button class="ui-row" id="setSyncAdv" style="margin-top:8px;border-top:1px solid var(--line)"><div class="ui-row__main"><div class="ui-row__title" style="font-size:15px">Backend (advanced)</div><div class="ui-row__sub">URL &amp; key · test connection</div></div><span class="ui-row__chev" aria-hidden="true"></span></button></div>`
      +`<div class="ui-card" style="margin-top:12px"><span class="ui-flabel">Demo mode (mask names)</span>
        <p class="hint" style="margin:4px 0 4px">Masks every real name AND every equipment tag with stable fakes across the pool, boards, lists, logs and sheets — pitch the tool without exposing anyone or any asset. Nothing changes in your saved data.</p>
        <label class="cfgrow" style="border:none;padding:6px 0"><span class="cfg-l">Demo mode<small>${demo?" · on — names masked":" · off — real names"}</small></span><input type="checkbox" id="setDemoOn" class="cfg-chk" ${demo?"checked":""}></label>
        ${demo?`<div style="border-top:1px solid var(--line);margin-top:8px;padding-top:10px">
          <p class="hint" style="margin:0 0 8px">Load a full pitch dataset — manpower only: ~2 weeks of past boards with fatigue streaks plus dummy staffing / overtime / callout documents. Your real equipment stays; demo mode masks its tags on screen.</p>
          <div class="btnrow"><button class="btn navy" id="setDemoSeed" style="flex:1 1 0;width:auto">Load demo data</button><button class="btn ghost" id="setDemoClear" style="flex:1 1 0;width:auto">Clear demo data</button></div></div>`:""}</div>`
      +`<div class="rq-sechead" style="color:var(--ua-red)">Danger zone</div>
       <div class="ui-card"><button class="btn danger" id="setWipeAll" style="width:100%">Delete all my data</button>
       <p class="hint" style="margin:8px 0 0">Asks the passcode fresh, then double-confirms. Cannot be undone.</p></div>`;
    UI.render(nav.el,nav,{title:"Admin & security",sub:"Passcode, locks, sync, demo — and the wipe at the very bottom.",body,mount:r=>{
      $("#setPassGo",r).onclick=()=>{const v=$("#setPassNew",r).value.trim();
        if(!/^\d{3,8}$/.test(v)){toast("Use 3–8 digits");return;}
        if(v===SETTINGS_PASS){toast("Pick a passcode other than the default");return;}
        S().passcode=v;save();toast("Passcode updated");nav.refresh();};
      $("#setPatBtn",r).onclick=()=>setPattern();
      $("#setSyncOn",r).onchange=()=>{const cfg=syncCfg();cfg.on=$("#setSyncOn",r).checked;Store.setJSON("elt.sync.cfg",cfg);
        toast(cfg.on?"Online sync on":"Online sync off — local only");nav.refresh();};
      const si=$("#setSignIn",r);if(si)si.onclick=async()=>{
        const email=$("#setSyncEmail",r).value.trim(),pass=$("#setSyncPass",r).value;
        if(!email||!pass){$("#setSyncMsg",r).textContent="Enter the team email and password.";return;}
        $("#setSyncMsg",r).textContent="Signing in…";
        try{ await window.SYNC.signIn(email,pass); if(typeof scheduleSiteSync==="function")scheduleSiteSync();
          toast("Signed in — syncing as the team account"); nav.refresh(); }
        catch(e){ $("#setSyncMsg",r).textContent="✗ Sign-in failed: "+(e&&e.message||e); }};
      const so=$("#setSignOut",r);if(so)so.onclick=()=>{ window.SYNC.signOut();
        toast("Signed out"); nav.refresh();
        setTimeout(()=>{const m=$("#setSyncMsg");if(m)m.textContent="Signed out — this device will use the public key only (blocked once RLS is on).";},50);};
      $("#setSyncAdv",r).onclick=()=>nav.go(syncAdvancedScreen);
      $("#setDemoOn",r).onchange=()=>{const on=$("#setDemoOn",r).checked;Store.setJSON("elt.demo",on);
        document.body.classList.toggle("demo-on",on);
        try{refreshAll();}catch(_){}
        try{if(window.STAFF&&window.STAFF.refresh)window.STAFF.refresh();}catch(_){}
        toast(on?"Demo mode on — names masked":"Demo mode off — real names");nav.refresh();};
      const ds=$("#setDemoSeed",r);if(ds)ds.onclick=()=>{ if(window.STAFF&&window.STAFF.seedDemo)window.STAFF.seedDemo(); toast("Demo data loaded"); };
      const dc=$("#setDemoClear",r);if(dc)dc.onclick=()=>{ if(confirm("Clear all demo data (seeded super-tugs + past manpowers)?"))clearDemoData(); };
      $("#setWipeAll",r).onclick=()=>wipeAll(nav);
    }});
  }

  function syncAdvancedScreen(nav){
    const c=syncCfg();
    const keyHint=c.key?("Current key ends &hellip;"+esc(c.key.slice(-4))+". Leave blank to keep it."):"No key set.";
    const body=UI.card(`<span class="ui-flabel">Supabase REST URL</span>
      <input id="setSyncUrl" autocomplete="off" placeholder="https://xxxx.supabase.co/rest/v1" value="${esc(c.url||"")}" style="margin-top:6px">
      <span class="ui-flabel" style="margin-top:12px">anon public key</span>
      <p class="hint" style="margin:4px 0 6px">${keyHint}</p>
      <input id="setSyncKey" autocomplete="off" placeholder="eyJ&hellip;">
      <div class="btnrow" style="margin-top:10px"><button class="btn ghost" id="setSyncTest">Test connection</button><button class="btn navy" id="setSyncSave" style="flex:0 0 110px">Save</button></div>
      <p class="hint" id="setSyncAdvMsg" style="margin-bottom:0"></p>`);
    UI.render(nav.el,nav,{title:"Sync backend",sub:"Advanced — where team sync stores its data.",body,mount:r=>{
      $("#setSyncSave",r).onclick=()=>{const cfg=syncCfg();
        cfg.url=$("#setSyncUrl",r).value.trim();
        const nk=$("#setSyncKey",r).value.trim(); if(nk)cfg.key=nk;
        Store.setJSON("elt.sync.cfg",cfg);toast("Sync backend saved");nav.refresh();};
      $("#setSyncTest",r).onclick=async()=>{
        const url=$("#setSyncUrl",r).value.trim(),key=$("#setSyncKey",r).value.trim()||syncCfg().key||"";
        const msg=$("#setSyncAdvMsg",r);msg.textContent="Testing…";
        try{const resp=await fetch(url.replace(/\/+$/,"")+"/manpower_shared?select=id&limit=1",{headers:{apikey:key,Authorization:"Bearer "+key}});
          msg.textContent=resp.ok?"✓ Connected — table reachable.":"✗ HTTP "+resp.status+" "+(await resp.text()).slice(0,120);}
        catch(e){msg.textContent="✗ "+(e.message||e);}};
    }});
  }

  /* the wipe — ported verbatim from the old Danger zone (fresh passcode, sync warning, double confirm) */
  async function wipeAll(nav){
    const p=await askPass("Delete ALL data","Enter the settings passcode.");if(p===null)return;
    if(p!==curPass()){toast("Wrong passcode");return;}
    const syncOn=(()=>{try{const cc=Store.getJSON("elt.sync.cfg",null);return !!(cc&&cc.on&&cc.url);}catch(_){return false;}})();
    const warn="Delete ALL data on this device — equipment, movements, locations, manpower logs, drafts, supervisor codes, activity and settings? This cannot be undone."
      +(syncOn?"\n\nSync is ON: anything the team still has (codes, logs, drafts, settings) will sync back to this device. To wipe it everywhere, turn sync off first, or have every device delete.":"");
    if(!confirm(warn))return;
    if(!confirm("Really delete everything?"))return;
    const keys=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.indexOf("elt.")===0)keys.push(k);}
    keys.forEach(k=>Store.del(k));
    Store.setRaw(SEEN_KEY,"1");   // keep the intro from replaying
    data=load();
    save();refreshAll();if(window.GSE)GSE.refresh();toast("All data cleared");
    nav.reset(rootScreen);
  }

  const SCREENS={team:teamScreen,tracking:trackingScreen,home:homeLabelsScreen,catalogs:catalogsScreen,
    types:typesScreen,equipLocs:equipLocsScreen,spots:spotsScreen,fleet:fleetScreen,admin:adminScreen};

  window.SETTINGS={
    open(){ const r=ROOT(); if(!r)return;
      if(!navApi)navApi=UI.nav(r,{onExit:()=>showTab("hub")});
      navApi.reset(rootScreen); },
    back:()=>navApi?navApi.back():false,
    refresh(){ if(!navApi||!ROOT())return;
      // dirty guard: never repaint over an input mid-edit (sync pulls arrive at any time)
      const ae=document.activeElement;
      if(ae&&ae.closest&&ae.closest("#settingsRoot")&&/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName))return;
      navApi.refresh(); },
    screens:{types:typesScreen,subtypes:subtypesScreen,equipLocs:equipLocsScreen,spots:spotsScreen,tracking:trackingScreen}
  };
})();
