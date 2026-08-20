/* ui.js — the app's shared UI kit. Two "languages" so everything stays uniform:

   DESIGN LANGUAGE (components): builders that return HTML strings — UI.tile, UI.card, UI.field,
     UI.chips — plus the standard screen frame (header + body). Use these instead of hand-writing
     markup so every screen looks the same.

   FUNCTION LANGUAGE (structure): UI.nav(container) is a navigation stack; UI.render(container, nav,
     opts) draws one screen with a header that ALWAYS has a working back button wired to the stack.
     Build every screen of a feature as a function fn(nav) that calls UI.render(...), and push/pop
     with nav.go(fn) / nav.back(). Back buttons and consistent structure come for free — the class of
     "continuation screen with no back button" bug can't happen.

   Depends only on the DOM. Feature modules (requests.js, future ones) build on top of this. */
(function(){
  const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const isEl=x=>x&&x.nodeType===1;

  /* ---------------- design language: component builders ---------------- */
  // back = naked SF-style SVG chevron (24-box, stroke 2, round caps) — never a text glyph
  const BACK_SVG=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14.5 6-6 6 6 6"/></svg>`;
  function screenHTML({title,sub,back,right,body}){
    return `<div class="ui-screen">
      <header class="ui-header">
        ${back?`<button class="ui-back" data-ui-back aria-label="Back">${BACK_SVG}</button>`:`<span class="ui-back ph"></span>`}
        <div class="ui-htext"><h2 class="ui-title">${esc(title||"")}</h2>${sub?`<p class="ui-sub">${sub}</p>`:""}</div>
        <div class="ui-hright">${right||""}</div>
      </header>
      <div class="ui-body">${body||""}</div>
    </div>`;
  }
  // a big navy action tile (like the home / requests tiles). attr lets the caller add data-* hooks.
  function tile({icon,title,sub,tone,attr}){
    return `<button class="ui-tile${tone?" t-"+tone:""}" ${attr||""}>
      ${icon?`<span class="ui-tile-ic">${icon}</span>`:""}
      <span class="ui-tile-t">${esc(title||"")}</span>
      ${sub?`<span class="ui-tile-s">${sub}</span>`:""}</button>`;
  }
  const card=html=>`<div class="ui-card">${html}</div>`;
  function field({label,id,value,placeholder,inputmode}){
    return `<label class="ui-field"><span class="ui-flabel">${esc(label||"")}</span>
      <input id="${esc(id||"")}" value="${esc(value==null?"":value)}" placeholder="${esc(placeholder||"")}"${inputmode?` inputmode="${inputmode}"`:""} autocomplete="off"></label>`;
  }
  // a wrapped row of selectable chips. items: ["A"] or [{v,label}]. attr = the data attribute name.
  function chips(items,current,attr){
    return `<div class="ui-chips">${items.map(it=>{const v=(it&&it.v!=null)?it.v:it,lb=(it&&it.label!=null)?it.label:v;
      return `<button class="ui-chip${current===v?" on":""}" ${attr||"data-ui-chip"}="${esc(v)}">${esc(lb)}</button>`;}).join("")}</div>`;
  }

  /* ---------------- function language: navigation stack ---------------- */
  // Each stack entry is a render function fn(nav). nav.back() pops (or calls opts.onExit at the root).
  function nav(container,opts){
    opts=opts||{}; const stack=[];
    const api={
      el:container,           // the stack's container — shared screen factories render into nav.el
      go(fn){stack.push(fn);draw();},
      reset(fn){stack.length=0;stack.push(fn);draw();},
      back(){ if(stack.length>1){stack.pop();draw();return true;} if(opts.onExit){opts.onExit();return true;} return false; },
      refresh(){draw();},
      depth(){return stack.length;}
    };
    function draw(){const fn=stack[stack.length-1];if(fn)fn(api);}
    return api;
  }
  // Draw one screen into `container`: a header (title/sub + back wired to nav.back) followed by body.
  // opts: {title, sub, right, body, mount(containerEl)}. The back button is always present.
  function render(container,navApi,opts){
    if(!isEl(container))return; opts=opts||{};
    container.innerHTML=screenHTML(Object.assign({},opts,{back:true}));
    const b=container.querySelector("[data-ui-back]"); if(b)b.onclick=()=>navApi.back();
    if(opts.mount)opts.mount(container);
  }

  /* ---------------- function language: typeahead ----------------
     Any input backed by a known dataset gets live suggestions, built the same way everywhere.
     UI.typeahead(inputEl, listEl, {min, source, onPick})
       source(q) -> [{v, label, cap}]  (v = value to fill; label bold; cap = small caption line)
     Pure DOM updates on input — never re-renders the screen, so focus is preserved. */
  function typeahead(inputEl,listEl,opts){
    if(!isEl(inputEl)||!isEl(listEl))return;
    const min=(opts&&opts.min)||2, source=(opts&&opts.source)||(()=>[]);
    const hide=()=>{listEl.hidden=true;listEl.innerHTML="";};
    inputEl.addEventListener("input",()=>{
      const q=inputEl.value.trim();
      if(q.length<min){hide();return;}
      const items=source(q)||[];
      if(!items.length){hide();return;}
      listEl.innerHTML=items.map(it=>`<button type="button" class="ui-ta-row" data-v="${esc(it.v)}"><b>${esc(it.label)}</b>${it.cap?`<span>${esc(it.cap)}</span>`:""}</button>`).join("");
      listEl.hidden=false;
      [...listEl.querySelectorAll(".ui-ta-row")].forEach(b=>b.onclick=()=>{
        inputEl.value=b.dataset.v;hide();
        if(opts&&opts.onPick)opts.onPick(b.dataset.v);
      });
    });
  }

  window.UI={esc,screenHTML,tile,card,field,chips,nav,render,typeahead};
})();
