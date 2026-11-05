// Jembatan versi HP (Android): inti.js berbicara ke aplikasi lewat RBPage (antarmuka Java).
// Situs yang dipakai selalu ditentukan aplikasi dari alamat halaman, bukan dari halaman itu sendiri.
(() => {
  if (window.__RB || window.top !== window || typeof RBPage === "undefined") return;
  const pend = new Map();
  const handlers = [];
  let seq = 0;
  // jawaban dari aplikasi (dikirim lewat evaluateJavascript)
  window.__RBres = (id, json) => {
    const p = pend.get(id);
    if (!p) return;
    pend.delete(id);
    let v = null;
    try { v = JSON.parse(json); } catch {}
    if (v && v.__err) p.rej(new Error(v.__err)); else p.res(v);
  };
  // perintah dari toolbar aplikasi (hitam putih, mode baca, dll.)
  window.__RBcmd = (c) => { for (const f of handlers) try { f(c); } catch {} };
  // RBPage dari WebMessageListener (postMessage, hanya halaman utama) atau antarmuka Java lama (call)
  const legacy = typeof RBPage.call === "function";
  const post = (id, m, a) => legacy ? RBPage.call(id, m, JSON.stringify(a)) : RBPage.postMessage(JSON.stringify({ id, m, a: JSON.stringify(a) }));
  if (!legacy) RBPage.onmessage = (e) => { try { const r = JSON.parse(e.data); window.__RBres(r.id, r.v); } catch {} };
  const call = (m, ...a) => new Promise((res, rej) => {
    const id = ++seq;
    pend.set(id, { res, rej });
    try { post(id, m, a); } catch (e) { pend.delete(id); rej(e); }
    setTimeout(() => { if (pend.has(id)) { pend.delete(id); rej(new Error("Aplikasi tidak menjawab")); } }, 20000);
  });
  const send = (m, ...a) => { try { post(0, m, a); } catch {} };
  window.__RB = {
    platform: "hp",
    getSite: () => call("getSite"),
    setSite: (patch) => call("setSite", patch),
    addHidden: (sel) => call("addHidden", sel),
    removeHidden: (sel) => call("removeHidden", sel),
    pageInfo: (info) => send("pageInfo", info),
    shelf: (url) => call("shelf", url),
    addToShelf: (info) => call("addToShelf", info),
    getFab: () => call("getFab"),
    setFab: (pos) => call("setFab", pos),
    setCover: (o) => call("setCover", o),
    resetLook: () => call("resetLook"),
    saveOffline: (o) => call("saveOffline", o),
    // geseran halaman untuk menyembunyikan/memunculkan bilah atas (ditangani Java)
    scrolled: (dy, top) => send("scroll", dy, top),
    zoom: () => Promise.resolve(null),
    active: (sec) => send("active", sec),
    onCommand: (fn) => handlers.push(fn),
    allowPopup: () => send("allowPopup"),
    learn: (kind) => call("learn", kind),
    // unduh otomatis (bot) belum ada di versi HP
    botStart: () => send("botStart"),
    botReport: () => {},
  };
})();
