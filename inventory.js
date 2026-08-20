/* inventory.js — Do Inventory as UI-kit screens on the GSE nav stack.
   Screens only: the count state (inv, invSel/invOos/invSpot/invNose/invReason), commitInv,
   the spot/nose + OOS-reason pickers, the location editor, and the sheet builders all stay in
   the shell. The glove-optimal pill cycle (1x here · 2x OOS · 3x clear) is ported tap-for-tap.
   New here: the ELECTION — "One area" (default, zero extra taps) vs "Complete inventory",
   with coverage tracking and a proof footer + NOT SEEN block on the sheet (built shell-side). */
(function(){
  const esc=UI.esc;
  const $=(s,r)=>(r||document).querySelector(s);
  const $$=(s,r)=>[...(r||document).querySelectorAll(s)];
  const ROOT=()=>$("#gseRoot");
  let stage="elect";              // "elect" | "count" | "sheet" — for inProgress/back semantics

  const natCmp=(a,b)=>String(a||"").localeCompare(String(b||""),undefined,{numeric:true,sensitivity:"base"});

  /* ================= elect: name + mode + location ================= */
  function electScreen(nav){
    stage="elect";
    inv.mode=inv.mode||"area";
    const locs=topLocs().slice().sort(natCmp);
    const covered=inv.covered||[];
    const tiles=locs.map(l=>{
      const done=covered.includes(l),n=data.equipment.filter(e=>e.location===l).length;
      return `<button class="ui-row" data-loc="${esc(l)}">
        <div class="ui-row__main"><div class="ui-row__title">${esc(l)}</div>
          <div class="ui-row__sub">${n} unit${n===1?"":"s"} on record</div></div>
        <span class="ui-row__value">${done?'<span style="color:var(--ua-green);font-weight:600">&#10003; counted</span>':""}</span>
        <span class="ui-row__chev" aria-hidden="true"></span></button>`;}).join("");
    const remaining=locs.filter(l=>!covered.includes(l));
    const coverage=inv.mode==="complete"
      ?`<div class="inv2-cover">${covered.length} of ${locs.length} areas covered${remaining.length?` · left: ${remaining.map(esc).join(", ")}`:" — all areas counted"}</div>`:"";
    const body=`
      ${UI.card(`${UI.field({label:"Your name — who's doing this inventory?",id:"inv2By",value:inv.by||data.invLastBy||"",placeholder:"e.g. Andres"})}
        <span class="ui-flabel" style="margin-top:12px">What kind of inventory?</span>
        <div class="ui-chips">
          <button class="ui-chip${inv.mode!=="complete"?" on":""}" data-mode="area">One area</button>
          <button class="ui-chip${inv.mode==="complete"?" on":""}" data-mode="complete">Complete inventory</button>
        </div>
        <p class="inv2-hint">${inv.mode==="complete"
          ?"Count every area; the sheet is stamped COMPLETE and accounts for units not seen. One device runs a complete inventory."
          :"Update one area — “for this area, this is what I have.” Units you don't tap are never touched."}</p>`)}
      <div class="inv2-lochead"><span class="ui-flabel" style="margin:0">Pick a location to count</span>
        <button class="rq-linkbtn" id="inv2EditLoc">Edit locations</button></div>
      <div class="ui-group">${tiles||'<p class="rq-empty">No locations yet — Edit locations to add one.</p>'}</div>
      ${coverage}
      ${covered.length?`
        <div class="btnrow" style="margin-top:14px"><button class="btn navy" id="inv2Done">Done — generate sheet (${covered.length})</button></div>
        <div class="btnrow" style="margin-top:8px"><button class="btn ghost" id="inv2Reset">Start over</button></div>`:""}`;
    UI.render(ROOT(),nav,{title:"Do inventory",sub:"One area or complete — your sheet builds from what you count.",body,mount:r=>{
      $("#inv2By",r).oninput=e=>{inv.by=e.target.value;data.invLastBy=inv.by;save();};
      $$(".ui-chip[data-mode]",r).forEach(b=>b.onclick=()=>{
        inv.mode=b.dataset.mode;
        if(inv.mode==="complete"&&!inv.startTs)inv.startTs=Date.now();
        nav.refresh();});
      $$(".ui-row[data-loc]",r).forEach(b=>b.onclick=()=>{inv.loc=b.dataset.loc;nav.go(countScreen(b.dataset.loc));});
      // fresh passcode every open (same posture as the old overlay), then the shared kit screen
      $("#inv2EditLoc",r).onclick=async()=>{
        const pass=await askPass("Edit locations","Enter the settings passcode.");
        if(pass===null)return;
        if(pass!==curPass()){toast("Wrong passcode");return;}
        nav.go(SETTINGS.screens.equipLocs);
      };
      $("#inv2Done",r)&&($("#inv2Done").onclick=()=>{
        const rem=topLocs().filter(l=>!inv.covered.includes(l));
        if(inv.mode==="complete"&&rem.length&&!confirm(`${rem.length} area(s) not covered (${rem.join(", ")}) — the sheet will say PARTIAL. Generate anyway?`))return;
        nav.go(sheetScreen);});
      $("#inv2Reset",r)&&($("#inv2Reset").onclick=()=>{
        if(!confirm("Start over? Clears which areas count as covered this session (units keep their saved locations)."))return;
        inv={stage:"loc",loc:null,covered:[],by:inv.by,mode:inv.mode};nav.refresh();});
    }});
  }

  /* ================= count: the pill cycle, ported tap-for-tap ================= */
  function countScreen(loc){
    return function(nav){
      stage="count";
      inv.loc=loc;
      // fresh session maps — incl. invReason (fixes the legacy leak where reasons survived a re-entry)
      invSel=new Set();invOos=new Set();invSpot=new Map();invNose=new Map();invReason=new Map();
      const canSpot=invLocSpots(loc).length>0||needsNose(loc,null);
      const body=`
        <div class="ui-card">
          <p class="inv2-hint" style="margin-top:0">Tap to count — <b>1&times;</b> here · <b>2&times;</b> out of service · <b>3&times;</b> clear.${canSpot?' Tap the <b>spot</b> chip to add a spot/nose.':''}</p>
          <input id="inv2Q" type="search" placeholder="Filter…" autocomplete="off"
            style="width:100%;font:400 17px/1.3 var(--font);padding:12px 14px;border:1px solid var(--field-border);border-radius:var(--r-md);background:rgba(255,255,255,.85);margin:4px 0 2px">
          <div id="inv2List" style="margin-top:6px"></div>
        </div>
        <div class="inv2-footpad" aria-hidden="true"></div>
        <div class="inv2-foot">
          <button class="btn ghost" id="inv2Back" style="flex:0 0 34%">&lsaquo; Back</button>
          <button class="btn navy" id="inv2Save">&#10003; Save 0 &rsaquo;</button>
        </div>`;
      UI.render(ROOT(),nav,{title:loc,sub:"Count what's physically here right now.",body,mount:r=>{
        function paint(){
          const q=$("#inv2Q",r).value.trim().toLowerCase();
          let items=data.equipment.filter(e=>!(e.location&&e.location!==loc&&inv.covered.includes(e.location)));
          if(q)items=items.filter(e=>[e.tag,e.type,e.location].some(v=>(v||"").toLowerCase().includes(q)));
          const groups=groupByType(items).slice().sort((a,b)=>natCmp(a.type,b.type));
          $("#inv2List",r).innerHTML=groups.length?groups.map(g=>{
            const sel=g.items.filter(e=>invSel.has(e.id)).length;
            const its=g.items.slice().sort((a,b)=>natCmp(a.tag,b.tag));
            return `<div class="m-cat">${esc(g.type)}${sel?`<span class="m-catn">${sel} here</span>`:""}</div>`+
              `<div class="pillgrid">`+its.map(e=>{const oos=invOos.has(e.id),on=invSel.has(e.id),det=invDetail(invSpot.get(e.id),invNose.get(e.id));
                const wasOos=!oos&&!!e.oos;
                const spotChip=(on&&!oos&&canSpot)?`<span class="pill-spotbtn" data-spot="${e.id}">${det?esc(det):'&#65291; spot'}</span>`:(det?`<span class="pillspot">${esc(det)}</span>`:"");
                const rsn=invReason.get(e.id)||e.oosReason||"";
                const oosChip=oos?`<span class="oostag">OUT OF SERVICE</span><span class="pill-oosbtn" data-oosr="${e.id}">${rsn?esc(rsn):'&#65291; reason'}</span>`
                  :(wasOos?`<span class="oostag" style="background:#fbe4e2;color:#8a1c12">&#8856; currently OOS${e.oosReason?" · "+esc(e.oosReason):""}</span>`:"");
                return `<button class="selpill ${oos?'oos':on?'on':''} ${wasOos?'wasoos':''}" data-id="${e.id}"><span class="selc">${oos?'&#8856;':on?'&#10003;':''}</span>${esc(dtag(e.tag))}${spotChip}${oosChip}</button>`;}).join("")+`</div>`;
          }).join(""):`<p class="rq-empty">Nothing left to count here — all units are accounted for at other locations.</p>`;
          $("#inv2Save",r).innerHTML=`&#10003; Save ${invSel.size} &rsaquo;`;
        }
        $("#inv2List",r).addEventListener("click",e=>{
          const sb=e.target.closest(".pill-spotbtn");
          if(sb){openInvPop(sb.closest(".selpill"),sb.dataset.spot,paint);return;}
          const ob=e.target.closest(".pill-oosbtn");
          if(ob){openOosReason(ob.closest(".selpill"),ob.dataset.oosr,paint);return;}
          const li=e.target.closest(".selpill[data-id]");if(!li)return;
          const id=li.dataset.id;
          const here=invSel.has(id)&&!invOos.has(id);
          if(!invSel.has(id)){invSel.add(id);invOos.delete(id);paint();}
          else if(here){invOos.add(id);paint();openOosReason(li,id,paint);}
          else{invSel.delete(id);invOos.delete(id);invSpot.delete(id);invNose.delete(id);invReason.delete(id);paint();}
        });
        $("#inv2Q",r).addEventListener("input",()=>{closeInvPop();paint();});
        $("#inv2Back",r).onclick=()=>{closeInvPop();nav.back();};
        $("#inv2Save",r).onclick=()=>{
          closeInvPop();
          const n=invSel.size,l=inv.loc;
          commitInv();                                   // shell: places units, stamps e.inv, logs moves
          stage="elect";
          toast(`Saved ${l} — ${n} unit${n===1?"":"s"}`);
          nav.back();                                    // elect redraws with coverage + generate button
        };
        paint();
      }});
    };
  }

  /* ================= sheet ================= */
  function sheetScreen(nav){
    stage="sheet";
    const locs=sheetLocsWithEquip();
    const body=`
      <div class="ui-card">
        <div class="ui-chips no-print" id="inv2Seg">
          <button class="ui-chip${invSheetMode!=="checklist"?" on":""}" data-m="list">List</button>
          <button class="ui-chip${invSheetMode==="checklist"?" on":""}" data-m="checklist">Checklist</button>
        </div>
        <div id="inv2SheetBody" style="margin-top:10px"></div>
        <div class="btnrow no-print" style="margin-top:12px"><button class="btn navy" id="inv2Pdf">Print / Save as PDF</button></div>
        <div class="btnrow no-print" style="margin-top:8px"><button class="btn ghost" id="inv2Img">Image</button><button class="btn ghost" id="inv2Txt">Text</button></div>
        <div class="btnrow no-print" style="margin-top:8px"><button class="btn ghost" id="inv2New">New inventory</button></div>
      </div>`;
    UI.render(ROOT(),nav,{title:"Inventory sheet",sub:inv.mode==="complete"?"Stamped complete or partial — with what was not seen.":"What you counted, grouped and ready to share.",body,mount:r=>{
      const draw=()=>{$("#inv2SheetBody",r).innerHTML=buildInvSheet(locs);
        $$("#inv2Seg .ui-chip",r).forEach(b=>b.classList.toggle("on",b.dataset.m===invSheetMode));};
      $$("#inv2Seg .ui-chip",r).forEach(b=>b.onclick=()=>{invSheetMode=b.dataset.m;draw();});
      $("#inv2Pdf",r).onclick=()=>{$("#printArea").innerHTML=buildInvSheet(locs);window.print();};
      $("#inv2Img",r).onclick=()=>downloadInvImage(locs);
      $("#inv2Txt",r).onclick=()=>downloadInvText(locs);
      $("#inv2New",r).onclick=()=>{inv={stage:"loc",loc:null,covered:[],by:inv.by,mode:"area"};nav.back();};
      draw();
    }});
  }

  window.INV={
    electScreen,
    refresh:()=>{ if(window.GSE)GSE.refresh(); },
    // an uncommitted count is in progress — used by goHome's confirm and the storage mirror guard
    inProgress:()=>stage==="count"&&!!(invSel.size||invOos.size),
    discard:()=>{invSel=new Set();invOos=new Set();invSpot=new Map();invNose=new Map();invReason=new Map();stage="elect";}
  };
})();
