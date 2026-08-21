/* hub.js — the Move Team Hub as a UI-kit screen. Grouped rows (Operations / Field logging /
   Lookups / App) that route through goTab; honors the tile-visibility toggles from Settings. */
(function(){
  const esc=UI.esc;
  const $=(s,r)=>(r||document).querySelector(s);
  const $$=(s,r)=>[...(r||document).querySelectorAll(s)];
  const ROOT=()=>$("#hubRoot");
  let navApi=null;

  const IC={
    staffing:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    briefing:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>',
    eos:'<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    inventory:'<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 13l2 2 4-4"/>',
    secure:'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    aircraft:'<path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/>',
    park:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>',
    equipment:'<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
    movement:'<path d="M3 12h13"/><path d="m13 6 6 6-6 6"/><path d="M21 4v16"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  };
  const GROUPS=[
    {head:"Operations",items:[
      ["staffing","Manpower / Staffing","Roster upload · tug board · fatigue flags"],
      ["briefing","Briefing & Focus","Shift briefing notes"],
      ["eos","End of Shift Report","Generated from the day's boards"]]},
    {head:"Field logging",items:[
      ["inventory","Do Inventory","One area or complete · proof-stamped"],
      ["secure","Aircraft Secure Log","Overnight securing record"]]},
    {head:"Lookups & lists",items:[
      ["aircraft","Aircraft Lookup","1,500+ ships · tail to type"],
      ["park","Stop Mark Lookup","Hardstand · spot · stop line"],
      ["equipment","Equipment List","The global list, specs & history"],
      ["movement","Equipment Movement","Every location change, logged"]]},
    {head:"App",items:[
      ["settings","Settings","Team configuration (passcode)"]]},
  ];

  function hubScreen(nav){
    const hidden=new Set((window.data&&data.hiddenTiles)||[]);
    const body=GROUPS.map(g=>{
      const tiles=g.items.filter(([k])=>k==="settings"||!hidden.has(k)).map(([k,t,s])=>`
        <button class="hub2-tile" data-go="${esc(k)}">
          <span class="hub2-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${IC[k]||""}</svg></span>
          <span class="hub2-t">${esc(t)}</span>
          <span class="hub2-s">${esc(s)}</span>
        </button>`).join("");
      if(!tiles)return "";
      return `<div class="rq-sechead">${esc(g.head)}</div><div class="hub2-grid">${tiles}</div>`;
    }).join("");
    UI.render(ROOT(),nav,{title:"Move Team Hub",sub:"Staffing, field logging, lookups and reports.",body,mount:r=>{
      $$("[data-go]",r).forEach(b=>b.onclick=()=>goTab(b.dataset.go));
    }});
  }

  window.HUB={
    open:()=>{ const r=ROOT(); if(!r)return; navApi=UI.nav(r,{onExit:()=>{try{window.goHome&&window.goHome();}catch(_){}}}); navApi.reset(hubScreen); },
    back:()=>navApi?navApi.back():false,
    refresh:()=>{ if(navApi&&ROOT())navApi.refresh(); }
  };
})();
