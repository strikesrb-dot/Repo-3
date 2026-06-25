/* ===========================================================================
   store.js — the ONE data layer for EWR MT HUB.

   Today the app is offline-first: every read/write below goes to this device's
   localStorage. To make the whole app online & linked (shared codes, logs,
   drafts, rosters across every phone/iPad), you change ONLY this file:

     1. Set BACKEND to your company API base URL (Azure / AWS / on-prem — NOT Google).
     2. Implement pull() and push() against that API (auth header = SSO token).

   Nothing else in the app changes — the rest of the code only ever calls
   Store.getJSON / setJSON / getRaw / setRaw / del. The app stays offline-first:
   reads are instant from local storage; writes persist locally and, in remote
   mode, also sync to the server (and retry when the connection returns).
   =========================================================================== */
(function(){
"use strict";

/* ---- the single switch: "local" (this device) or a company API base URL ---- */
const BACKEND = "local";
// const BACKEND = "https://mthub.api.united.com/v1";  // example: company server, SSO-gated

const MODE = (BACKEND === "local") ? "local" : "remote";

/* auth token for the company server (set after SSO login). Local mode ignores it. */
let TOKEN = null;

/* outbound write queue so nothing is lost while offline (remote mode) */
let queue = [];
try { queue = JSON.parse(localStorage.getItem("elt.sync.queue") || "[]") || []; } catch (_) { queue = []; }
function saveQueue(){ try { localStorage.setItem("elt.sync.queue", JSON.stringify(queue)); } catch (_) {} }

const Store = {
  mode: MODE,
  backend: BACKEND,

  /* ----- reads (synchronous, offline-first) ----- */
  getJSON(key, fallback){
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
    catch (_) { return fallback; }
  },
  getRaw(key, fallback){ const v = localStorage.getItem(key); return v == null ? (fallback ?? null) : v; },

  /* ----- writes (persist locally now; sync to server in remote mode) ----- */
  setJSON(key, val){
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { return false; }
    if (MODE === "remote") enqueue(key, val);
    return true;
  },
  setRaw(key, val){
    try { localStorage.setItem(key, val); } catch (e) { return false; }
    if (MODE === "remote") enqueue(key, val);
    return true;
  },
  del(key){
    localStorage.removeItem(key);
    if (MODE === "remote") enqueue(key, null);
    return true;
  },

  /* ----- the remote seam (only place the server is touched) ----- */
  setToken(t){ TOKEN = t; },                              // call after SSO login
  async pull(){                                           // server -> this device, on boot/login
    if (MODE !== "remote") return;
    const res = await fetch(BACKEND + "/state", { headers: authHeaders() });
    if (!res.ok) throw new Error("pull " + res.status);
    const state = await res.json();                       // { "elt.staff.log": [...], ... }
    for (const k in state){ try { localStorage.setItem(k, JSON.stringify(state[k])); } catch (_) {} }
    return state;
  },
  async flush(){                                          // drain the offline write queue
    if (MODE !== "remote" || !queue.length) return;
    const pending = queue.slice();
    for (const item of pending){
      try {
        await fetch(BACKEND + "/state/" + encodeURIComponent(item.key), {
          method: "PUT", headers: authHeaders(), body: JSON.stringify({ value: item.val, at: item.at })
        });
        queue = queue.filter(q => q !== item); saveQueue();
      } catch (_) { break; }                              // offline again — keep the rest queued
    }
  }
};

function authHeaders(){ return Object.assign({ "Content-Type": "application/json" }, TOKEN ? { Authorization: "Bearer " + TOKEN } : {}); }
function enqueue(key, val){ queue.push({ key, val, at: Date.now() }); saveQueue(); Store.flush().catch(()=>{}); }

/* retry the queue whenever the device comes back online */
if (MODE === "remote") window.addEventListener("online", () => Store.flush().catch(()=>{}));

window.Store = Store;
})();
