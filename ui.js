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
  function screenHTML({title,sub,back,right,body}){
    return `<div class="ui-screen">
      <header class="ui-header">
        ${back?`<button class="ui-back" data-ui-back aria-label="Back">‹</button>`:`<span class="ui-back ph"></span>`}
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

  window.UI={esc,screenHTML,tile,card,field,chips,nav,render};
})();
