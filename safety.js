/* safety.js — the Safety tile. Home for safety references; today that's the Stop Mark Lookup
   (which still lives in the shell as #view-park); more lands here over time. */
(function(){
  const $=(s,r)=>(r||document).querySelector(s);
  const $$=(s,r)=>[...(r||document).querySelectorAll(s)];
  const ROOT=()=>$("#safetyRoot");
  let navApi=null;

  function homeScreen(nav){
    const body=`
      <div class="ui-group">
        <button class="ui-row" data-open="park">
          <div class="ui-row__main"><div class="ui-row__title">Stop Mark Lookup</div>
            <div class="ui-row__sub">Where the nose stops — by spot and aircraft type</div></div>
          <span class="ui-row__chev" aria-hidden="true"></span>
        </button>
      </div>
      <p class="rq-empty" style="padding:22px 10px 0;text-align:left">More safety references land here.</p>`;
    UI.render(ROOT(),nav,{title:"Safety",sub:"References for doing it right the first time.",body,mount:r=>{
      $('[data-open="park"]',r).onclick=()=>{ window.openParkFrom&&openParkFrom("safety"); };
    }});
  }

  window.SAFETY={
    open:()=>{ const r=ROOT(); if(!r)return; navApi=UI.nav(r,{onExit:()=>{try{window.goHome&&window.goHome();}catch(_){}}}); navApi.reset(homeScreen); },
    back:()=>navApi?navApi.back():false,
    refresh:()=>{ if(navApi&&ROOT())navApi.refresh(); }
  };
})();
