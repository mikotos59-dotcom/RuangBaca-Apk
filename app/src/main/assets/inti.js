// Ruang Baca — inti yang berjalan di dalam setiap halaman web (dipakai versi PC dan HP).
// Butuh jembatan window.__RB dari aplikasi pembungkusnya: getSite, setSite, addHidden, removeHidden,
// pageInfo, shelf, addToShelf, getFab, setFab, onCommand, platform.
(() => {
  "use strict";
  if (window.__RB_INTI || window.top !== window) return; // hanya sekali, dan hanya di halaman utama (bukan iframe iklan)
  window.__RB_INTI = true;
  const H = window.__RB;
  if (!H) return;
  const HP = H.platform === "hp";

  // Situs dengan Trusted Types (CSP require-trusted-types-for, mis. MangaDex) menolak innerHTML biasa,
  // sehingga tombol melayang dll. gagal dibuat. Pakai kebijakan Trusted Types sendiri; hanya berlaku
  // di dunia skrip Ruang Baca (terpisah dari skrip situs).
  (() => {
    const tt = window.trustedTypes;
    if (!tt || !tt.createPolicy) return;
    let pol = null;
    for (const n of ["ruangbaca", "default", "rb" + Math.random().toString(36).slice(2, 8)]) { try { pol = tt.createPolicy(n, { createHTML: (x) => x }); break; } catch {} }
    if (!pol) return;
    const wrap = (proto, prop) => {
      const d = Object.getOwnPropertyDescriptor(proto, prop);
      if (!d || !d.set) return;
      Object.defineProperty(proto, prop, { ...d, set(v) { d.set.call(this, typeof v === "string" ? pol.createHTML(v) : v); } });
    };
    wrap(Element.prototype, "innerHTML");
    if (window.ShadowRoot) wrap(ShadowRoot.prototype, "innerHTML");
    const ins = Element.prototype.insertAdjacentHTML;
    Element.prototype.insertAdjacentHTML = function (pos, v) { return ins.call(this, pos, typeof v === "string" ? pol.createHTML(v) : v); };
    const parse = DOMParser.prototype.parseFromString;
    DOMParser.prototype.parseFromString = function (v, type) { return parse.call(this, typeof v === "string" ? pol.createHTML(v) : v, type); };
  })();

  let site = { gray: false, paper: "putih", contrast: 115, popup: true, speed: 30, hidden: [], reader: false, dark: false, zoom: 100, label: "5" };
  const st = { scroll: false, armed: false, reader: null, picker: null, killed: [], unlocked: [], label: null, menu: false, book: null, darkOn: false };

  // ---------- kerangka tampilan (shadow DOM di luar <body>, aman dari gaya situs) ----------
  const host = document.createElement("rb-ui");
  host.style.cssText = "all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>
    :host{all:initial}
    *{box-sizing:border-box;font-family:"Segoe UI",system-ui,sans-serif}
    .fab{position:fixed;z-index:3;width:46px;height:46px;border-radius:50%;background:#111;color:#fff;border:2px solid #fff;box-shadow:0 6px 18px rgba(0,0,0,.45);
      display:grid;place-items:center;pointer-events:auto;cursor:grab;touch-action:none;transition:opacity .4s;user-select:none}
    .fab.dim{opacity:.35}.fab:hover{opacity:1}.fab.drag{cursor:grabbing;transition:none}
    .fab svg{width:22px;height:22px;fill:currentColor}
    .fab .run{position:absolute;right:-3px;top:-3px;width:14px;height:14px;border-radius:50%;background:#fff;border:2px solid #111;display:none}
    .fab.on .run{display:block}
    .menu{position:fixed;z-index:4;width:300px;max-height:80vh;overflow:auto;background:#fff;color:#111;border:2px solid #111;border-radius:14px;box-shadow:0 14px 34px rgba(0,0,0,.35);
      padding:8px;pointer-events:auto;font-size:14px}
    .menu[hidden],.hud[hidden],.lbl[hidden],.toast[hidden],.pick[hidden],.ptip[hidden]{display:none}
    .it{display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;border:0;background:none;border-radius:9px;text-align:left;font-size:14px;color:#111;cursor:pointer}
    .it:hover{background:#eee}
    .it b{font-weight:600;flex:1}
    .it small{color:#666;white-space:nowrap;font-size:12px}
    .sw{width:34px;height:20px;border-radius:99px;background:#ccc;position:relative;flex:none}
    .sw::after{content:"";position:absolute;top:3px;left:3px;width:14px;height:14px;border-radius:50%;background:#fff;transition:transform .15s}
    .on>.sw{background:#111}.on>.sw::after{transform:translateX(14px)}
    .sub{padding:2px 10px 8px 10px;display:grid;gap:6px}
    .row{display:flex;align-items:center;gap:8px;font-size:13px;color:#444}
    .row input[type=range]{flex:1;accent-color:#111}
    .seg{display:flex;gap:4px}.seg button{border:1px solid #bbb;background:#fff;border-radius:7px;padding:3px 9px;font-size:12px;cursor:pointer;color:#111}
    .seg button.sel{background:#111;color:#fff;border-color:#111}
    hr{border:0;border-top:1px solid #ddd;margin:4px 0}
    .num{min-width:28px;text-align:right;font-variant-numeric:tabular-nums;font-weight:700;color:#111}
    .hud{position:fixed;z-index:5;background:#111;color:#fff;border-radius:99px;padding:5px 12px;font-size:13px;font-weight:700;pointer-events:none;border:2px solid #fff}
    .lbl{position:fixed;z-index:5;top:10px;left:50%;transform:translateX(-50%);background:#111;color:#fff;border-radius:99px;padding:6px 8px 6px 14px;font-size:13px;pointer-events:auto;display:flex;gap:8px;align-items:center;border:2px solid #fff;box-shadow:0 6px 16px rgba(0,0,0,.4)}
    .lbl button{background:#fff;color:#111;border:0;border-radius:99px;padding:3px 10px;font-size:12px;cursor:pointer}
    .undo{position:fixed;z-index:6;bottom:70px;left:50%;transform:translateX(-50%);background:#111;color:#fff;border-radius:99px;padding:6px 8px 6px 16px;font-size:14px;pointer-events:auto;display:flex;gap:10px;align-items:center;border:2px solid #fff;box-shadow:0 6px 16px rgba(0,0,0,.4)}
    .undo[hidden]{display:none}
    .undo button{background:#fff;color:#111;border:0;border-radius:99px;padding:4px 12px;font-size:13px;font-weight:700;cursor:pointer}
    .hl{display:grid;gap:2px;padding:0 6px 6px 6px}
    .hrow{display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:8px;font-size:12px;color:#444}
    .hrow:hover{background:#f2f2f2}
    .hrow code{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:12px ui-monospace,Consolas,monospace;color:#333}
    .hrow button{border:1px solid #bbb;background:#fff;border-radius:7px;padding:2px 8px;font-size:12px;cursor:pointer;color:#111;flex:none}
    .toast{position:fixed;z-index:5;bottom:24px;left:50%;transform:translateX(-50%);background:#111;color:#fff;border-radius:10px;padding:9px 16px;font-size:14px;pointer-events:none;border:2px solid #fff;max-width:90vw;text-align:center}
    .pick{position:fixed;border:3px dashed #000;box-shadow:0 0 0 2px #fff,inset 0 0 0 2px #fff;background:rgba(0,0,0,.16);pointer-events:none;border-radius:3px}
    .ptip{position:fixed;z-index:5;left:50%;bottom:20px;transform:translateX(-50%);background:#111;border:2px solid #fff;color:#fff;border-radius:10px;padding:8px 14px;font-size:13px;pointer-events:none}
    .reader{position:fixed;z-index:1;inset:0;background:#fff;overflow:auto;pointer-events:auto;overscroll-behavior:contain}
    .reader.dark{background:#111}
    .rbar{position:sticky;top:0;z-index:2;display:flex;gap:6px;align-items:center;padding:8px 10px;background:rgba(255,255,255,.94);border-bottom:2px solid #111;font-size:13px;color:#111}
    .reader.dark .rbar{background:rgba(17,17,17,.94);color:#eee;border-color:#444}
    .rbar .t{flex:1;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .rbar button{border:2px solid currentColor;background:none;color:inherit;border-radius:8px;padding:4px 10px;font-size:13px;cursor:pointer}
    .rbar button:disabled{opacity:.35;cursor:default}
    .rbar input{width:90px;accent-color:#111}
    .pages{margin:0 auto;display:flex;flex-direction:column;align-items:center}
    .pages img{display:block;width:100%;height:auto;min-height:60px}
    .paged{display:none;position:relative;height:calc(100vh - 48px);overflow:auto;cursor:pointer}
    .reader.pm .pages,.reader.pm .rend{display:none}.reader.pm .paged{display:block}
    .paged .pw{min-height:100%;display:flex;align-items:center;justify-content:center}
    .paged img{display:block;max-height:calc(100vh - 56px);max-width:100%;height:auto;width:auto;user-select:none;-webkit-user-drag:none}
    .paged.z img{max-height:none;max-width:none}
    .pnum{font-variant-numeric:tabular-nums;white-space:nowrap}
    .rend{padding:30px 10px 60px;text-align:center;font-size:14px;color:#555;display:flex;gap:10px;justify-content:center}
    .rend button{border:2px solid #111;background:#fff;color:#111;border-radius:10px;padding:10px 18px;font-size:15px;cursor:pointer}
    .reader.dark .rend{color:#aaa}.reader.dark .rend button{background:#222;color:#eee;border-color:#666}
  </style>
  <div class="fab dim" id="fab" title="Ruang Baca (geser untuk memindah)"><svg viewBox="0 0 24 24"><path d="M3 5.5C5.6 4.3 8.6 4.3 11 6v13c-2.4-1.6-5.4-1.6-8-.5zM21 5.5c-2.6-1.2-5.6-1.2-8 .5v13c2.4-1.6 5.4-1.6 8-.5z"/></svg><span class="run"></span></div>
  <div class="menu" id="menu" hidden></div>
  <div class="hud" id="hud" hidden></div>
  <div class="lbl" id="lbl" hidden><span id="lblt"></span><button id="lblb">Tampilkan</button><button id="lblx">×</button></div>
  <div class="toast" id="toast" hidden></div>
  <div class="undo" id="undo" hidden><span id="undoT"></span><button id="undoB">Batalkan</button></div>
  <div class="pick" id="pick" hidden></div><div class="ptip" id="ptip" hidden></div>`;
  const $ = (id) => root.getElementById(id);
  const attach = () => { if (!host.isConnected && document.documentElement) document.documentElement.appendChild(host); };

  let toastT = 0;
  function toast(msg, ms = 2400) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), ms); }

  // ---------- hitam putih & elemen tersembunyi ----------
  function styleEl(id) {
    let s = document.getElementById(id);
    if (!s) { s = document.createElement("style"); s.id = id; (document.head || document.documentElement).appendChild(s); }
    return s;
  }
  // Mode gelap: halaman dibalik warnanya (invert), lalu gambar, video, dan tombol Ruang Baca dibalik lagi supaya tetap asli.
  const UNINVERT = 'img,video,canvas,iframe,embed,object,[style*="background-image"],rb-ui';
  // Scrollbar lebih lebar & jelas (Pengaturan → Lebar scrollbar); warnanya terlihat di halaman terang maupun gelap
  // sel: daftar elemen ("" = semua); pseudo scrollbar ditempel ke tiap elemen itu
  const sbCss = (w, sels = [""]) => {
    if (!w) return "";
    const on = (ps) => sels.map((x) => x + ps).join(",");
    return `${on("::-webkit-scrollbar")}{width:${w}px !important;height:${w}px !important}
    ${on("::-webkit-scrollbar-track")}{background:rgba(128,128,128,.22) !important}
    ${on("::-webkit-scrollbar-thumb")}{background:#8a8a8a !important;border:2px solid rgba(0,0,0,.35) !important;border-radius:${Math.round(w / 2)}px !important;min-height:48px}
    ${on("::-webkit-scrollbar-thumb:hover")}{background:#b0b0b0 !important}
    ${on("::-webkit-scrollbar-thumb:active")}{background:#d0d0d0 !important}`;
  };
  let sbShadow = null;
  function applyLook() {
    styleEl("rb-sb").textContent = sbCss(site.sbWidth || 0);
    if (!sbShadow) { sbShadow = document.createElement("style"); root.appendChild(sbShadow); }
    sbShadow.textContent = sbCss(site.sbWidth || 0, [".reader", ".paged"]);
    const parts = [];
    if (st.darkOn) parts.push("invert(1) hue-rotate(180deg)");
    if (site.gray) parts.push(`grayscale(1) contrast(${site.contrast / 100})${site.paper === "krem" ? " sepia(.22)" : ""}`);
    styleEl("rb-gray").textContent = (parts.length ? `html{filter:${parts.join(" ")} !important}` : "")
      + (st.darkOn ? `${st.rootTransparent ? "\nhtml{background:#fff !important}" : ""}\n${UNINVERT}{filter:invert(1) hue-rotate(180deg) !important}\n[style*="background-image"] :is(img,video,canvas){filter:none !important}` : "");
    styleEl("rb-hide").textContent = site.hidden.map((s) => `${s}{display:none !important}`).join("\n");
  }

  // ---------- mode gelap otomatis ----------
  // Warna latar halaman dicek berkala (gaya asli halaman, bukan hasil filter): halaman terang dibuat gelap,
  // halaman yang sudah gelap dibiarkan. Kalau situs tiba-tiba kembali terang, ikut diperbaiki.
  function lum(c) {
    const m = String(c).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
    if (!m || (m[4] !== undefined && +m[4] < 0.5)) return null; // transparan
    return (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255;
  }
  function bgAt(el) {
    for (let cur = el; cur && cur.nodeType === 1; cur = cur.parentElement) {
      if (cur === host) return null;
      if (/^(IMG|VIDEO|CANVAS|PICTURE|IFRAME|SVG)$/i.test(cur.tagName)) continue;
      const l = lum(getComputedStyle(cur).backgroundColor);
      if (l !== null) return l;
    }
    return null;
  }
  function pageLuminance() {
    const vals = [];
    const pts = [[0.03, 0.5], [0.97, 0.5], [0.5, 0.5], [0.5, 0.15], [0.5, 0.85], [0.2, 0.3], [0.8, 0.7]];
    for (const [x, y] of pts) {
      const el = document.elementFromPoint(innerWidth * x, innerHeight * y);
      if (!el || el === host) continue;
      const l = bgAt(el);
      // tanpa warna latar = kanvas putih bawaan browser (latar putih yang dipasang mode gelap tidak dihitung)
      const rootL = st.darkOn && st.rootTransparent ? null : lum(getComputedStyle(document.documentElement).backgroundColor);
      vals.push(l === null ? (lum(getComputedStyle(document.body || document.documentElement).backgroundColor) ?? rootL ?? 1) : l);
    }
    if (!vals.length) return 1;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  function checkDark() {
    if (!document.body) return;
    let want = false;
    if (site.dark) {
      const l = pageLuminance();
      want = st.darkOn ? l > 0.42 : l > 0.55; // ambang ganda supaya tidak berkedip
    }
    if (want !== st.darkOn) {
      if (want) st.rootTransparent = lum(getComputedStyle(document.documentElement).backgroundColor) === null;
      st.darkOn = want; applyLook();
    }
  }

  // ---------- tombol melayang & menu ----------
  const fab = $("fab");
  let fabPos = { x: 0.94, y: 0.78 }, dimT = 0;
  function placeFab() {
    const x = Math.round(Math.max(6, Math.min(innerWidth - 52, fabPos.x * innerWidth - 23)));
    const y = Math.round(Math.max(6, Math.min(innerHeight - 52, fabPos.y * innerHeight - 23)));
    fab.style.left = x + "px"; fab.style.top = y + "px";
    $("hud").style.left = Math.max(6, x - 78) + "px"; $("hud").style.top = (y + 10) + "px";
  }
  function wake() { fab.classList.remove("dim"); clearTimeout(dimT); dimT = setTimeout(() => { if (!st.menu) fab.classList.add("dim"); }, 2500); }
  let drag = null;
  fab.addEventListener("pointerdown", (e) => { drag = { sx: e.clientX, sy: e.clientY, moved: false, id: e.pointerId }; fab.setPointerCapture(e.pointerId); wake(); });
  fab.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) { drag.moved = true; fab.classList.add("drag"); closeMenu(); }
    if (drag.moved) { fabPos = { x: e.clientX / innerWidth, y: e.clientY / innerHeight }; placeFab(); }
  });
  fab.addEventListener("pointerup", () => {
    if (!drag) return;
    const moved = drag.moved; drag = null; fab.classList.remove("drag");
    if (moved) H.setFab(fabPos); else (st.menu ? closeMenu() : openMenu());
  });
  addEventListener("resize", () => { placeFab(); if (st.menu) positionMenu(); });

  function closeMenu() { st.menu = false; $("menu").hidden = true; wake(); }
  function positionMenu() {
    const m = $("menu"), r = fab.getBoundingClientRect();
    const left = r.left > innerWidth / 2 ? r.left - 308 : r.right + 8;
    m.style.left = Math.max(6, Math.min(innerWidth - 306, left)) + "px";
    m.style.top = Math.max(6, Math.min(innerHeight - m.offsetHeight - 6, r.top - 40)) + "px";
  }
  async function openMenu() {
    st.menu = true;
    try { st.book = await H.shelf(location.href); } catch {}
    renderMenu();
    $("menu").hidden = false; positionMenu(); wake();
  }
  function renderMenu() {
    const m = $("menu");
    const sw = (on) => `<span class="sw"></span>`;
    const killed = st.killed.length;
    m.innerHTML = `
      <button class="it ${site.gray ? "on" : ""}" data-a="gray"><b>Hitam putih (mode manga)</b>${sw()}</button>
      ${site.gray ? `<div class="sub">
        <div class="row">Kertas <span class="seg"><button data-paper="putih" class="${site.paper === "putih" ? "sel" : ""}">Putih</button><button data-paper="krem" class="${site.paper === "krem" ? "sel" : ""}">Krem</button></span></div>
        <div class="row">Kontras <input type="range" min="80" max="180" value="${site.contrast}" data-r="contrast"><span class="num" id="vc">${site.contrast}</span></div></div>` : ""}
      <button class="it ${site.dark ? "on" : ""}" data-a="dark"><b>Mode gelap situs</b><small>${site.dark ? (st.darkOn ? "aktif" : "situs sudah gelap") : ""}</small>${sw()}</button>
      ${HP ? "" : `<div class="sub"><div class="row">Ukuran <span class="seg"><button data-z="-1" title="Perkecil (Ctrl −)">−</button><button data-z="0" title="Kembali ke 100%">${site.zoom}%</button><button data-z="1" title="Perbesar (Ctrl +)">+</button></span></div></div>`}
      <hr>
      <button class="it ${st.scroll ? "on" : ""}" data-a="scroll"><b>Gulir otomatis</b><small>${HP ? "ketuk layar = jeda" : "klik tengah / Spasi"}</small>${sw()}</button>
      <div class="sub"><div class="row">Kecepatan <input type="range" min="1" max="100" value="${site.speed}" data-r="speed"><span class="num" id="vs">${site.speed}</span></div></div>
      <hr>
      <button class="it" data-a="reader"><b>Mode baca</b><small>gambar saja</small></button>
      <button class="it ${site.readerMode === "page" ? "on" : ""}" data-a="rmode"><b>Mode baca per halaman (manga)</b>${sw()}</button>
      ${site.readerMode === "page" ? `<button class="it ${site.readerRtl ? "on" : ""}" data-a="rtl"><b>Balik arah (kanan ke kiri)</b><small>klik kiri = berikutnya</small>${sw()}</button>` : ""}
      <button class="it" data-a="shelf"><b>${st.book ? "Di rak" : "Simpan ke rak"}</b><small>${st.book ? (st.book.lastChapter != null ? "ch. " + st.book.lastChapter : "✓") : ""}</small></button>
      <hr>
      <button class="it" data-a="cover"><b>Jadikan sampul…</b><small>klik gambar</small></button>
      ${site.coverSel ? `<button class="it" data-a="uncover"><b>Lupakan area sampul situs ini</b></button>` : ""}
      <button class="it" data-a="learnsub"><b>Ajari alamat situs ini</b><small>${site.urlRule ? "sudah dipelajari" : st.showLearn ? "▲" : "kalau judul sering salah ▼"}</small></button>
      ${st.showLearn ? `<div class="hl">
        <button class="it" data-a="learn-title"><b>Ini halaman judul</b><small>${site.learnTitle ? "✓" : ""}</small></button>
        <button class="it" data-a="learn-page"><b>Ini halaman baca · angka di alamat = halaman</b></button>
        <button class="it" data-a="learn-chapter"><b>Ini halaman baca · angka di alamat = chapter</b></button>
        ${site.urlRule ? `<button class="it" data-a="learn-forget"><b>Lupakan pola alamat</b></button>` : ""}</div>` : ""}
      <button class="it" data-a="pick"><b>Sembunyikan elemen…</b><small>klik bagian halaman</small></button>
      ${site.hidden.length ? `<button class="it" data-a="hlist"><b>Elemen tersembunyi (${site.hidden.length})</b><small>${st.showHidden ? "▲" : "lihat ▼"}</small></button>
        ${st.showHidden ? `<div class="hl">${site.hidden.map((sel, i) => `<div class="hrow" data-i="${i}" title="Arahkan mouse untuk melihat elemennya"><code>${sel.replace(/[<>&]/g, "")}</code><button data-show="${i}">Tampilkan</button></div>`).join("")}
          <button class="it" data-a="unhide"><b>Tampilkan semua</b></button></div>` : ""}` : ""}
      ${site.bot ? `<hr><button class="it" data-a="botdl"><b>Unduh otomatis: tandai tombol Download…</b><small>${site.dlSel ? "sudah ditandai" : "klik tombolnya"}</small></button>
      <button class="it" data-a="botnext"><b>Tandai tombol Next chapter (bot)…</b><small>${site.nextSel ? "sudah ditandai" : "opsional · otomatis"}</small></button>
      ${site.dlSel ? `<button class="it" data-a="botgo"><b>Mulai unduh otomatis</b><small>sampai chapter habis</small></button>` : ""}
      ${site.dlSel || site.nextSel ? `<button class="it" data-a="botforget"><b>Hapus tombol bot yang ditandai</b><small>${[site.dlSel ? "Download" : "", site.nextSel ? "Next" : ""].filter(Boolean).join(" & ")}</small></button>` : ""}<hr>` : ""}
      <button class="it" data-a="allow"><b>Izinkan tombol membuka link…</b><small>mis. tombol Download</small></button>
      ${(site.popupAllow || []).length ? `<button class="it" data-a="unallow"><b>Lupakan tombol yang diizinkan (${site.popupAllow.length})</b></button>` : ""}
      <button class="it ${site.popup ? "on" : ""}" data-a="popup"><b>Singkirkan pop-up Pro/koin</b>${sw()}</button>
      ${killed ? `<button class="it" data-a="restore"><b>Tampilkan pop-up yang disingkirkan (${killed})</b></button>` : ""}`;
    m.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", () => menuAction(b.dataset.a)));
    // daftar elemen tersembunyi: arahkan mouse untuk melihat sekilas, klik Tampilkan untuk mengembalikan
    m.querySelectorAll(".hrow").forEach((r) => {
      r.addEventListener("mouseenter", () => peek(site.hidden[+r.dataset.i]));
      r.addEventListener("mouseleave", () => peek(null));
    });
    m.querySelectorAll("[data-show]").forEach((b) => b.addEventListener("click", async () => {
      peek(null); await unhide(site.hidden[+b.dataset.show]);
      if (!site.hidden.length) st.showHidden = false;
      renderMenu(); positionMenu();
    }));
    m.querySelectorAll("[data-z]").forEach((b) => b.addEventListener("click", async () => { const z = await H.zoom(+b.dataset.z); if (z) { site.zoom = z; renderMenu(); } }));
    m.querySelectorAll("[data-paper]").forEach((b) => b.addEventListener("click", async () => { site = await H.setSite({ paper: b.dataset.paper }); applyLook(); renderMenu(); }));
    m.querySelectorAll("[data-r]").forEach((r) => {
      r.addEventListener("input", () => {
        const v = +r.value;
        if (r.dataset.r === "contrast") { site.contrast = v; $("vc").textContent = v; applyLook(); }
        else { site.speed = v; $("vs").textContent = v; showHud(); }
      });
      r.addEventListener("change", async () => { site = await H.setSite({ [r.dataset.r]: +r.value }); });
    });
  }
  async function menuAction(a) {
    if (a === "gray") { site = await H.setSite({ gray: !site.gray }); applyLook(); renderMenu(); positionMenu(); }
    if (a === "dark") { site = await H.setSite({ dark: !site.dark }); checkDark(); renderMenu(); }
    if (a === "scroll") { toggleScroll(); renderMenu(); }
    if (a === "reader") { closeMenu(); openReader(); }
    if (a === "rmode") { site = await H.setSite({ readerMode: site.readerMode === "page" ? "strip" : "page" }); if (st.reader) { closeReader(true); openReader(true); } renderMenu(); positionMenu(); }
    if (a === "rtl") { site = await H.setSite({ readerRtl: !site.readerRtl }); renderMenu(); }
    if (a === "shelf") {
      if (st.book) { toast(`Sudah di rak: ${st.book.title}`); return; }
      try { st.book = await H.addToShelf(pageInfo()); toast(`Disimpan ke rak: ${st.book.title}`); renderMenu(); } catch (e) { toast(String(e.message || e)); }
    }
    if (a === "pick") { closeMenu(); startPicker(); }
    if (a === "cover") { closeMenu(); startPicker("cover"); }
    if (a === "allow") { closeMenu(); startPicker("allow"); }
    if (a === "botdl") { closeMenu(); startPicker("dlbtn"); }
    if (a === "botnext") { closeMenu(); startPicker("nextbtn"); }
    if (a === "botforget") { site = await H.setSite({ dlSel: null, nextSel: null }); renderMenu(); positionMenu(); toast("Tombol Download & Next yang ditandai untuk bot sudah dihapus."); }
    if (a === "botgo") { closeMenu(); H.botStart && H.botStart(); }
    if (a === "unallow") { site = await H.setSite({ popupAllow: [] }); renderMenu(); toast("Tombol yang diizinkan dilupakan. Link dari tombol itu kembali diblokir sebagai pop-up."); }
    if (a === "uncover") { site = await H.setSite({ coverSel: null }); renderMenu(); toast("Area sampul dilupakan. Sampul judul baru kembali diambil otomatis."); }
    if (a === "unhide") { site = await H.removeHidden(null); peek(null); applyLook(); st.showHidden = false; renderMenu(); toast("Semua elemen ditampilkan lagi"); }
    if (a === "learnsub") { st.showLearn = !st.showLearn; renderMenu(); positionMenu(); }
    if (a.startsWith("learn-")) {
      const kind = { "learn-title": "title", "learn-page": "read-page", "learn-chapter": "read-chapter", "learn-forget": "forget" }[a];
      try { const r = await H.learn(kind); site = await H.getSite(); toast(r.msg, 6000); st.book = await H.shelf(location.href); } catch (err) { toast(String(err.message || err)); }
      renderMenu(); positionMenu();
    }
    if (a === "hlist") { st.showHidden = !st.showHidden; renderMenu(); positionMenu(); }
    if (a === "popup") { site = await H.setSite({ popup: !site.popup }); if (!site.popup) restoreKilled(); renderMenu(); }
    if (a === "restore") { restoreKilled(); closeMenu(); }
  }

  // ---------- gulir otomatis ----------
  const pxPerSec = (s) => 8 * Math.pow(1.05, s); // 1 → ±8 px/detik, 100 → ±1050 px/detik
  let rafId = 0, last = 0, carry = 0, stuck = 0, hudT = 0;
  // Elemen yang benar-benar bergulir. Banyak situs menggulir sebuah <div> pembungkus, bukan halamannya.
  const canScroll = (el) => {
    if (!el || el.scrollHeight - el.clientHeight < 4) return false;
    if (el === document.scrollingElement || el === document.documentElement || el === document.body) {
      // gulir halaman ditentukan overflow <html>, atau overflow <body> kalau <html> "visible"
      const ho = getComputedStyle(document.documentElement).overflowY;
      const vo = ho !== "visible" ? ho : getComputedStyle(document.body || document.documentElement).overflowY;
      return !/hidden|clip/.test(vo);
    }
    return /auto|scroll|overlay/.test(getComputedStyle(el).overflowY);
  };
  function findScroller(skip) {
    const docEl = document.scrollingElement || document.documentElement;
    if (docEl !== skip && canScroll(docEl)) return docEl;
    // dari tengah layar ke atas, cari pembungkus yang bisa digulir
    for (const [fx, fy] of [[0.5, 0.5], [0.3, 0.5], [0.5, 0.3], [0.5, 0.7]]) {
      for (let el = document.elementFromPoint(innerWidth * fx, innerHeight * fy); el && el !== document.documentElement; el = el.parentElement) {
        if (el === host) break;
        if (el !== skip && canScroll(el)) return el;
      }
    }
    // cadangan: pembungkus terbesar yang bisa digulir
    let best = null, area = 0;
    for (const el of document.querySelectorAll("div,main,section,article")) {
      if (el === skip || !canScroll(el)) continue;
      const r = el.getBoundingClientRect(), a = r.width * r.height;
      if (a > area) { area = a; best = el; }
    }
    return best || docEl;
  }
  const scroller = () => {
    if (st.reader) return st.reader.el;
    if (!st.scrollEl || !st.scrollEl.isConnected) st.scrollEl = findScroller();
    return st.scrollEl;
  };
  function showHud(text) {
    const h = $("hud");
    h.textContent = text || `${st.scroll ? "▶ Gulir" : "Jeda"} · ${site.speed}`;
    h.hidden = false; clearTimeout(hudT);
    hudT = setTimeout(() => (h.hidden = true), st.scroll ? 1500 : 2500);
  }
  function step(t) {
    if (!st.scroll) return;
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
    last = t;
    const el = scroller();
    carry += pxPerSec(site.speed) * dt;
    const px = Math.floor(carry);
    if (px >= 1) {
      carry -= px;
      const before = el.scrollTop;
      // "instant": situs dengan scroll-behavior: smooth tidak lagi menahan gulir sedikit-sedikit
      try { el.scrollBy({ top: px, behavior: "instant" }); } catch { el.scrollTop = before + px; }
      if (el.scrollTop === before) {
        stuck += dt;
        // belum di ujung tapi tidak bergerak: mungkin salah elemen, cari pembungkus lain yang bisa digulir
        if (!st.reader && stuck > 0.4 && !st.scrollRetry) { st.scrollRetry = true; const alt = findScroller(el); if (alt !== el) { st.scrollEl = alt; stuck = 0; } }
        if (stuck > 1.2) { stopScroll(); toast(st.reader ? "Akhir chapter" : "Akhir halaman"); return; }
      } else stuck = 0;
    }
    rafId = requestAnimationFrame(step);
  }
  function startScroll() { st.scroll = true; st.armed = true; last = 0; carry = 0; stuck = 0; st.scrollEl = null; st.scrollRetry = false; fab.classList.add("on"); cancelAnimationFrame(rafId); rafId = requestAnimationFrame(step); showHud(); }
  function stopScroll() { st.scroll = false; cancelAnimationFrame(rafId); fab.classList.remove("on"); showHud(); }
  function toggleScroll() { st.scroll ? stopScroll() : startScroll(); }
  let speedSave = 0;
  function nudgeSpeed(d) {
    site.speed = Math.max(1, Math.min(100, site.speed + d));
    showHud(); clearTimeout(speedSave);
    speedSave = setTimeout(async () => { site = await H.setSite({ speed: site.speed }); }, 600);
  }
  const typing = (e) => { const t = e.composedPath()[0]; return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); };
  addEventListener("mousedown", (e) => {
    if (e.button !== 1 || st.picker) return;
    if (e.composedPath().some((n) => n.tagName === "A" && n.href)) return; // klik tengah pada link tetap normal
    e.preventDefault(); toggleScroll();
  }, true);
  addEventListener("wheel", (e) => {
    if (!st.scroll || e.ctrlKey) return;
    e.preventDefault(); e.stopPropagation();
    nudgeSpeed(e.deltaY < 0 ? 2 : -2);
  }, { capture: true, passive: false });
  addEventListener("keydown", (e) => {
    if (typing(e)) return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && st.lastHidden) { e.preventDefault(); unhide(st.lastHidden); $("undo").hidden = true; return; }
    if (e.key === "Escape") { if (st.picker) return stopPicker(); if (st.menu) return closeMenu(); if (st.reader) return closeReader(); }
    if (e.code === "Space" && st.reader && st.reader.paged) { e.preventDefault(); e.stopPropagation(); st.reader.flip(1); return; }
    if (e.code === "Space" && (st.armed || st.reader)) { e.preventDefault(); e.stopPropagation(); toggleScroll(); }
    if (st.scroll && (e.key === "+" || e.key === "=")) { e.preventDefault(); nudgeSpeed(5); }
    if (st.scroll && e.key === "-") { e.preventDefault(); nudgeSpeed(-5); }
    if (st.reader && st.reader.paged && /^(ArrowRight|ArrowLeft|ArrowDown|ArrowUp|PageDown|PageUp)$/.test(e.key)) {
      e.preventDefault(); e.stopPropagation();
      const fwd = /Right|Down|PageDown/.test(e.key);
      const lr = /Right|Left/.test(e.key) && site.readerRtl ? !fwd : fwd;
      return st.reader.flip(lr ? 1 : -1);
    }
    if (st.reader && e.key === "ArrowRight" && st.reader.next) { e.preventDefault(); goChapter(st.reader.next); }
    if (st.reader && e.key === "ArrowLeft" && st.reader.prev) { e.preventDefault(); goChapter(st.reader.prev); }
  }, true);
  // HP: ketuk layar untuk jeda / lanjut selama gulir otomatis aktif
  if (HP) {
    let tap = null;
    addEventListener("pointerdown", (e) => { tap = { x: e.clientX, y: e.clientY, t: Date.now() }; }, true);
    addEventListener("pointerup", (e) => {
      if (!tap || !st.armed || st.picker) return;
      const quick = Date.now() - tap.t < 300 && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 10;
      const onUi = e.composedPath().includes(host) || e.composedPath().some((n) => n.tagName === "A" || n.tagName === "BUTTON");
      if (quick && !onUi) toggleScroll();
      tap = null;
    }, true);
  }
  // pengguna menggulir sendiri saat gulir otomatis jalan: tidak dilawan
  addEventListener("touchmove", () => { if (st.scroll) stopScroll(); }, { passive: true });

  // ---------- pop-up Pro / koin / anti-adblock ----------
  const PAY = /(koin|coins?\b|unlock|buka (chapter|episode|bab)|beli|purchase|top ?up|isi ulang|daily pass|fast ?pass|gunakan tiket|ticket)/i;
  const PROMO = /(premium|upgrade|langganan|berlangganan|subscribe|\bpro\b|\bvip\b|install (the )?app|unduh aplikasi|download (the )?app)/i;
  const NAG = /(ad ?block|adblocker|pemblokir iklan|matikan pemblokir|disable your ad)/i;
  function bigFixed(el) {
    for (let cur = el, i = 0; cur && cur !== document.body && cur !== document.documentElement && i < 12; cur = cur.parentElement, i++) {
      const cs = getComputedStyle(cur);
      if (cs.position === "fixed" || (cs.position === "absolute" && +cs.zIndex >= 100)) return cur;
    }
    return null;
  }
  function areaRatio(el) { const r = el.getBoundingClientRect(); return (Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0))) / (innerWidth * innerHeight); }
  function hideEl(el, kind) {
    if (st.killed.some((k) => k.el === el)) return;
    st.killed.push({ el, kind, prev: el.style.getPropertyValue("display"), prio: el.style.getPropertyPriority("display") });
    el.style.setProperty("display", "none", "important");
  }
  function unlockScroll() {
    for (const el of [document.documentElement, document.body]) {
      if (!el || (st.reader && el === document.documentElement)) continue; // mode baca sengaja mengunci gulir halaman di belakangnya
      const cs = getComputedStyle(el);
      const keep = () => { if (!st.unlocked.some((u) => u.el === el)) st.unlocked.push({ el, overflow: el.style.getPropertyValue("overflow"), oprio: el.style.getPropertyPriority("overflow"), position: el.style.getPropertyValue("position"), pprio: el.style.getPropertyPriority("position") }); };
      if (cs.overflow === "hidden" || cs.overflowY === "hidden") { keep(); el.style.setProperty("overflow", "auto", "important"); }
      if (cs.position === "fixed" && el === document.body) { keep(); el.style.setProperty("position", "static", "important"); }
    }
  }
  function judge(box) {
    if (!box || st.killed.some((k) => k.el === box)) return null;
    if (box.querySelector('input[type="password"]')) return null; // jendela login tidak disentuh
    const text = (box.innerText || box.textContent || "").slice(0, 3000);
    if (NAG.test(text)) return "nag";
    const area = areaRatio(box);
    if (PAY.test(text) && area > 0.04) return "pay";
    if (PROMO.test(text) && area > 0.08 && text.length < 1500) return "promo";
    return null;
  }
  function afterKill(kind) {
    // latar gelap di belakang pop-up ikut disingkirkan
    for (const el of document.elementsFromPoint(innerWidth / 2, innerHeight / 2)) {
      if (el === host || el === document.body || el === document.documentElement) continue;
      const box = bigFixed(el);
      if (box && areaRatio(box) > 0.85 && (box.innerText || "").trim().length < 60) hideEl(box, "backdrop");
    }
    unlockScroll();
    showLabel(kind);
  }
  // Pemeriksaan cepat langsung saat elemen ditambahkan/ditampilkan (sebelum browser sempat menggambar),
  // supaya pop-up tidak sempat terlihat berkedip.
  function quickCheck(nodes) {
    if (!site.popup || !document.body || st.picker || Date.now() < popupPause) return;
    let killed = null, n = 0;
    for (const node of nodes) {
      if (!node || node.nodeType !== 1 || node === host || !node.isConnected) continue;
      const cands = [node, ...node.querySelectorAll ? [...node.children].slice(0, 20) : []];
      for (const el of cands) {
        if (++n > 60) break;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || (cs.position !== "fixed" && !(cs.position === "absolute" && +cs.zIndex >= 100))) continue;
        const kind = judge(el);
        if (kind) { hideEl(el, kind); killed = killed || kind; }
      }
    }
    if (killed) afterKill(killed);
  }
  function scanPopups() {
    if (!site.popup || !document.body || st.picker) return;
    // titik-titik pemeriksaan tersebar di layar supaya pop-up kecil pun ketemu
    const pts = [];
    for (const x of [0.25, 0.5, 0.75]) for (const y of [0.15, 0.3, 0.4, 0.5, 0.6, 0.72, 0.85, 0.95]) pts.push([x, y]);
    let killedNow = null;
    for (const [px, py] of pts) {
      for (const el of document.elementsFromPoint(innerWidth * px, innerHeight * py)) {
        if (el === host || el === document.body || el === document.documentElement) continue;
        const box = bigFixed(el);
        const kind = judge(box);
        if (kind) { hideEl(box, kind); killedNow = killedNow || kind; }
      }
    }
    if (killedNow) afterKill(killedNow);
  }
  // label.mode: "5" = tampil 5 detik lalu hilang · "tetap" = sampai ditutup · "sembunyi" = tidak pernah tampil
  // (pop-up yang disingkirkan selalu bisa dimunculkan lagi dari menu tombol melayang)
  let lblT = 0;
  function showLabel(kind) {
    if (site.label === "sembunyi") return;
    const text = kind === "pay" ? "Chapter berbayar · pratinjau" : kind === "nag" ? "Pesan anti-adblock disembunyikan" : "Promosi disembunyikan";
    $("lblt").textContent = text; $("lbl").hidden = false;
    clearTimeout(lblT);
    if (site.label !== "tetap") lblT = setTimeout(() => ($("lbl").hidden = true), 5000);
  }
  function restoreKilled() {
    for (const k of st.killed) { if (k.prev) k.el.style.setProperty("display", k.prev, k.prio); else k.el.style.removeProperty("display"); }
    st.killed = [];
    for (const u of st.unlocked) {
      if (u.overflow) u.el.style.setProperty("overflow", u.overflow, u.oprio); else u.el.style.removeProperty("overflow");
      if (u.position) u.el.style.setProperty("position", u.position, u.pprio); else u.el.style.removeProperty("position");
    }
    st.unlocked = [];
    $("lbl").hidden = true;
    clearTimeout(scanT); popupPause = Infinity; // pilihan pengguna: biarkan tampil sampai pindah halaman
  }
  $("lblb").addEventListener("click", restoreKilled);
  $("lblx").addEventListener("click", () => ($("lbl").hidden = true));
  let scanT = 0, popupPause = 0;
  const queueScan = () => { if (Date.now() < popupPause) return; clearTimeout(scanT); scanT = setTimeout(scanPopups, 350); };

  // ---------- pilih elemen untuk disembunyikan ----------
  function selectorFor(el) {
    const goodId = (id) => id && /^[a-z][\w-]{2,40}$/i.test(id) && !/\d{4,}/.test(id);
    if (goodId(el.id) && document.querySelectorAll("#" + CSS.escape(el.id)).length === 1) return "#" + CSS.escape(el.id);
    const parts = [];
    for (let cur = el; cur && cur !== document.body && cur !== document.documentElement && parts.length < 6; cur = cur.parentElement) {
      if (goodId(cur.id)) { parts.unshift("#" + CSS.escape(cur.id)); break; }
      let p = cur.tagName.toLowerCase();
      const cls = [...cur.classList].filter((c) => /^[a-z][\w-]{1,40}$/i.test(c) && !/\d{3,}|^(active|show|open|hover|visible|is-|has-|js-)/i.test(c)).slice(0, 3);
      if (cls.length) p += "." + cls.map((c) => CSS.escape(c)).join(".");
      else if (cur.parentElement) { const same = [...cur.parentElement.children].filter((x) => x.tagName === cur.tagName); if (same.length > 1) p += `:nth-of-type(${same.indexOf(cur) + 1})`; }
      parts.unshift(p);
      const s = parts.join(" > ");
      try { if (document.querySelectorAll(s).length === 1) return s; } catch {}
    }
    return parts.join(" > ");
  }
  // mode "hide" = sembunyikan elemen · mode "cover" = pilih gambar untuk sampul buku di rak
  function startPicker(mode = "hide") {
    if (st.scroll) stopScroll();
    if (st.reader && mode === "hide") closeReader(true);
    st.picker = { el: null, depth: 0, mode };
    const title = mode === "cover" && !isReaderPage();
    $("ptip").textContent = mode === "dlbtn" ? "Klik tombol Download yang akan diklik bot di setiap chapter · Esc: batal"
      : mode === "nextbtn" ? "Klik tombol Next chapter yang akan diklik bot (khusus bot, terpisah dari tombol ‹ › mode baca) · Esc: batal"
      : mode === "allow"
      ? `${HP ? "Ketuk" : "Klik"} tombol yang link-nya boleh dibuka (mis. Download). Tombol di posisi yang sama di halaman lain situs ini ikut diizinkan.${HP ? "" : " · Esc: batal"}`
      : mode === "cover"
      ? (title ? `${HP ? "Ketuk" : "Klik"} gambar sampul. Bagian ini jadi patokan sampul untuk judul lain di situs ini.${HP ? "" : " · Esc: batal"}` : HP ? "Ketuk gambar yang mau dijadikan sampul" : "Klik gambar yang mau dijadikan sampul · Esc: batal")
      : (HP ? "Ketuk bagian yang mau disembunyikan" : "Klik bagian yang mau disembunyikan · roda mouse: pilih bagian lebih besar/kecil · Esc: batal");
    $("ptip").hidden = false;
  }
  // elemen bergambar terdekat di titik itu: <img>, kanvas, video, atau elemen dengan background-image
  function imageAt(x, y) {
    const inReader = st.reader ? [...root.elementsFromPoint ? root.elementsFromPoint(x, y) : []] : [];
    for (const el of [...inReader, ...document.elementsFromPoint(x, y)]) {
      if (el === host) continue;
      if (/^(IMG|CANVAS|VIDEO)$/.test(el.tagName)) return el;
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== "none" && /url\(/.test(bg)) return el;
    }
    return null;
  }
  function imageSrc(el) {
    if (el.tagName === "IMG") return srcOf(el) || el.currentSrc || el.src;
    if (el.tagName === "VIDEO") return el.poster || null;
    if (el.tagName === "CANVAS") { try { return el.toDataURL("image/jpeg", 0.9); } catch { return null; } }
    const m = getComputedStyle(el).backgroundImage.match(/url\(["']?(.*?)["']?\)/);
    return m ? new URL(m[1], location.href).href : null;
  }
  function stopPicker() { st.picker = null; $("pick").hidden = true; $("ptip").hidden = true; }
  function pickTarget(x, y) {
    if (st.picker && st.picker.mode === "cover") return imageAt(x, y);
    const list = document.elementsFromPoint(x, y).filter((e) => e !== host && e !== document.body && e !== document.documentElement);
    let el = list[0] || null;
    for (let i = 0; el && i < st.picker.depth; i++) if (el.parentElement && el.parentElement !== document.body) el = el.parentElement;
    return el;
  }
  function drawPick(el) {
    const p = $("pick");
    if (!el) { p.hidden = true; return; }
    const r = el.getBoundingClientRect();
    Object.assign(p.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    p.hidden = false;
  }
  let lastXY = [0, 0];
  addEventListener("mousemove", (e) => { if (!st.picker) return; lastXY = [e.clientX, e.clientY]; st.picker.el = pickTarget(e.clientX, e.clientY); drawPick(st.picker.el); }, true);
  addEventListener("wheel", (e) => {
    if (!st.picker || st.picker.mode === "cover") return;
    e.preventDefault(); e.stopPropagation();
    st.picker.depth = Math.max(0, st.picker.depth + (e.deltaY < 0 ? 1 : -1));
    st.picker.el = pickTarget(...lastXY); drawPick(st.picker.el);
  }, { capture: true, passive: false });
  addEventListener("click", async (e) => {
    if (!st.picker) return;
    if (e.composedPath().includes(host) && !(st.picker.mode === "cover" && st.reader && e.composedPath().includes(st.reader.el))) return;
    e.preventDefault(); e.stopPropagation();
    const el = st.picker.el || pickTarget(e.clientX, e.clientY);
    const mode = st.picker.mode;
    stopPicker();
    if (!el) { if (mode === "cover") toast("Tidak ada gambar di situ. Coba lagi dari menu."); return; }
    if (mode === "cover") {
      const r = el.getBoundingClientRect();
      try {
        const b = await H.setCover({ src: imageSrc(el), rect: { x: r.left, y: r.top, width: r.width, height: r.height }, info: pageInfo() });
        st.book = b;
        // dipilih di halaman judul (bukan chapter, bukan mode baca): jadikan patokan sampul untuk situs ini
        const sel = !isReaderPage() && !(st.reader && st.reader.el.contains(el)) ? coverSelector(el) : null;
        if (sel) { site = await H.setSite({ coverSel: sel }); toast(`Sampul ${b.title} diganti. Judul lain di situs ini ikut memakai area ini.`, 4000); }
        else toast(`Sampul ${b.title} diganti`);
      } catch (err) { toast(String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, "")); }
      return;
    }
    if (mode === "dlbtn" || mode === "nextbtn") {
      const target = el.closest("a,button,input,[role=button],[onclick]") || el;
      const sel = allowSelector(target);
      if (!sel) { toast("Tombol itu tidak bisa ditandai. Coba klik tepat di tulisan tombolnya."); return; }
      site = await H.setSite(mode === "dlbtn" ? { dlSel: sel } : { nextSel: sel });
      toast(mode === "dlbtn" ? "Tombol Download ditandai. Mulai lewat menu: Mulai unduh otomatis." : "Tombol Next chapter untuk bot ditandai. Bot akan mengekliknya untuk pindah chapter.", 4000);
      return;
    }
    if (mode === "allow") {
      const target = el.closest("a,button,input,[role=button],[onclick]") || el;
      const sel = allowSelector(target);
      if (!sel) { toast("Tombol itu tidak bisa ditandai. Coba klik tepat di tulisan tombolnya."); return; }
      site = await H.setSite({ popupAllow: [...new Set([...(site.popupAllow || []), sel])] });
      toast("Link dari tombol ini sekarang langsung dibuka. Klik lagi tombolnya untuk memakainya.", 4500);
      return;
    }
    const sel = selectorFor(el);
    site = await H.addHidden(sel);
    applyLook();
    st.lastHidden = sel;
    showUndo("Disembunyikan di situs ini", () => unhide(sel));
  }, true);

  // ---------- unduh otomatis (opsional, dimatikan bawaan) ----------
  // Halaman hanya memberi tahu posisi tombol & link chapter berikutnya. Klik & jeda diatur aplikasi.
  function botCommand(what) {
    const captcha = document.querySelector('iframe[src*="recaptcha"],iframe[src*="hcaptcha"],iframe[src*="challenges.cloudflare"],#challenge-form,#cf-challenge-running,.g-recaptcha,.h-captcha');
    if (captcha) return H.botReport({ error: "captcha" });
    if (what === "locate") {
      let el = null;
      try { el = site.dlSel && [...document.querySelectorAll(site.dlSel)].find((x) => x.getClientRects().length); } catch {}
      if (!el) return H.botReport({ error: "nodl" });
      el.scrollIntoView({ block: "center" });
      setTimeout(() => {
        const r = el.getBoundingClientRect();
        H.botReport({ rect: { x: r.left, y: r.top, w: r.width, h: r.height } });
      }, 400);
    }
    if (what === "next") {
      // tombol "Next chapter (bot)" yang ditandai: diklik sungguhan oleh aplikasi (posisinya dikirim)
      let n = null, href = null;
      try { n = site.nextSel && [...document.querySelectorAll(site.nextSel)].find((x) => x.getClientRects().length); } catch {}
      if (n) {
        href = n.href || (n.closest("a") || {}).href || null;
        n.scrollIntoView({ block: "center" });
        return setTimeout(() => { const r = n.getBoundingClientRect(); H.botReport({ next: href && href !== location.href ? href : null, rect: { x: r.left, y: r.top, w: r.width, h: r.height }, marked: true }); }, 400);
      }
      href = chapterLinks().next;
      H.botReport({ next: href && href !== location.href ? href : null });
    }
  }

  // ---------- tombol yang boleh membuka jendela baru (per situs) ----------
  // Selektor umum (tag & class, tanpa id khusus satu halaman), jadi tombol di posisi yang sama
  // di halaman lain situs ini ikut cocok
  function allowSelector(el) {
    const parts = [];
    for (let cur = el; cur && cur !== document.body && cur !== document.documentElement && parts.length < 4; cur = cur.parentElement) {
      let p = cur.tagName.toLowerCase();
      const cls = [...cur.classList].filter((c) => /^[a-z][\w-]{1,40}$/i.test(c) && !/\d{3,}|^(active|show|open|hover|focus|visible|loaded|is-|has-|js-)/i.test(c)).slice(0, 2);
      if (cls.length) p += "." + cls.map((c) => CSS.escape(c)).join(".");
      parts.unshift(p);
      // cukup khusus: tidak lebih dari beberapa elemen di halaman yang cocok
      try { const n = document.querySelectorAll(parts.join(" ")).length; if (el.matches(parts.join(" ")) && n <= 3 && (cls.length || parts.length > 1)) return parts.join(" "); } catch {}
    }
    try { return parts.length && el.matches(parts.join(" ")) ? parts.join(" ") : null; } catch { return null; }
  }
  const allowHit = (e) => {
    const list = site.popupAllow || [];
    if (!list.length || st.picker || !e.target || !e.target.closest) return;
    for (const sel of list) { try { if (e.target.closest(sel)) { H.allowPopup && H.allowPopup(); return; } } catch {} }
  };
  addEventListener("pointerdown", allowHit, true);
  addEventListener("click", allowHit, true);

  // ---------- area patokan sampul (per situs) ----------
  // Selektor umum untuk gambar sampul: memakai tag & class, bukan id khusus judul tertentu
  function coverSelector(el) {
    const okId = (id) => id && /^(cover|thumb|poster|image|img|series|manga|comic|komik|summary|info)[\w-]{0,20}$/i.test(id) && !/\d{2,}/.test(id);
    const parts = [];
    for (let cur = el; cur && cur !== document.body && cur !== document.documentElement && parts.length < 6; cur = cur.parentElement) {
      if (okId(cur.id)) { parts.unshift("#" + CSS.escape(cur.id)); }
      else {
        let p = cur.tagName.toLowerCase();
        const cls = [...cur.classList].filter((c) => /^[a-z][\w-]{1,40}$/i.test(c) && !/\d{3,}|^(active|show|open|hover|visible|lazy\w*|loaded|is-|has-|js-)/i.test(c)).slice(0, 2);
        if (cls.length) p += "." + cls.map((c) => CSS.escape(c)).join(".");
        parts.unshift(p);
      }
      const sel = parts.join(" ");
      try { if (document.querySelector(sel) === el) return sel; } catch {}
      if (parts[0].startsWith("#")) break;
    }
    const sel = parts.join(" ");
    try { return document.querySelector(sel) === el ? sel : null; } catch { return null; }
  }
  function srcFromParsed(el, base) {
    if (!el) return null;
    const abs = (v) => { try { return new URL(v.trim(), base).href; } catch { return null; } };
    if (el.tagName === "IMG") {
      for (const a of LAZY) { const v = el.getAttribute(a); if (v && !v.startsWith("data:")) return abs(v); }
      const ss = el.getAttribute("data-srcset") || el.getAttribute("srcset");
      if (ss) { const best = ss.split(",").map((x) => x.trim().split(/\s+/)).sort((a, b) => parseFloat(b[1] || 0) - parseFloat(a[1] || 0))[0]; if (best && best[0]) return abs(best[0]); }
      const v = el.getAttribute("src"); return v && !v.startsWith("data:") ? abs(v) : null;
    }
    const m = (el.getAttribute("style") || "").match(/url\(["']?(.*?)["']?\)/);
    if (m) return abs(m[1]);
    const img = el.querySelector && el.querySelector("img");
    return img ? srcFromParsed(img, base) : null;
  }
  let areaDone = "";
  async function applyAreaCover(force) {
    if (!site.coverSel || (!force && areaDone === location.href)) return;
    areaDone = location.href;
    let book = null;
    try { book = await H.shelf(location.href); } catch {}
    if (!book || (["manual", "file", "area"].includes(book.coverSource) && book.coverSrc)) return;
    let src = null, rect = null;
    if (!isReaderPage()) {
      // halaman judul: tunggu gambarnya muncul (sampai ±6 detik)
      for (let i = 0; i < 12 && !src; i++) {
        let el = null; try { el = document.querySelector(site.coverSel); } catch { return; }
        if (el) { const r = el.getBoundingClientRect(); src = imageSrc(el); if (r.width) rect = { x: r.left, y: r.top, width: r.width, height: r.height }; }
        if (!src) await new Promise((r) => setTimeout(r, 500));
      }
    } else {
      // halaman chapter: buka halaman judulnya di belakang layar lalu ambil gambar di area patokan
      const series = book.seriesUrl || findSeries();
      if (!series) return;
      try {
        const res = await fetch(series, { credentials: "include" });
        const doc = new DOMParser().parseFromString(await res.text(), "text/html");
        src = srcFromParsed(doc.querySelector(site.coverSel), series);
      } catch {}
    }
    if (!src && !rect) return;
    try { const b = await H.setCover({ src, rect, source: "area", info: pageInfo() }); if (b) st.book = b; } catch {}
  }

  // ---------- batalkan / kembalikan elemen tersembunyi ----------
  let undoT = 0, undoFn = null;
  function showUndo(text, fn, ms = 7000) {
    $("undoT").textContent = text; undoFn = fn; $("undo").hidden = false;
    clearTimeout(undoT); undoT = setTimeout(() => { $("undo").hidden = true; undoFn = null; }, ms);
  }
  $("undoB").addEventListener("click", async () => { const fn = undoFn; $("undo").hidden = true; undoFn = null; if (fn) await fn(); });
  async function unhide(sel) {
    if (!sel) return;
    site = await H.removeHidden(sel);
    if (st.lastHidden === sel) st.lastHidden = null;
    applyLook();
    toast("Elemen ditampilkan lagi");
  }
  function peek(sel) {
    styleEl("rb-peek").textContent = sel ? `${sel}{display:revert !important;outline:3px dashed #e53 !important;outline-offset:-3px !important}` : "";
    if (sel) { try { const el = document.querySelector(sel); if (el) el.scrollIntoView({ block: "nearest" }); } catch {} }
  }

  // ---------- mode baca (gambar komik saja) ----------
  const LAZY = ["data-src", "data-lazy-src", "data-original", "data-url", "data-lazy", "data-cfsrc", "data-pagespeed-lazy-src"];
  function srcOf(im) {
    for (const a of LAZY) { const v = im.getAttribute(a); if (v && !v.startsWith("data:")) return new URL(v.trim(), location.href).href; }
    const ss = im.getAttribute("data-srcset") || im.getAttribute("srcset");
    if (ss) { const best = ss.split(",").map((x) => x.trim().split(/\s+/)).sort((a, b) => parseFloat(b[1] || 0) - parseFloat(a[1] || 0))[0]; if (best && best[0] && !best[0].startsWith("data:")) return new URL(best[0], location.href).href; }
    const s = im.currentSrc || im.src;
    if (!s || (s.startsWith("data:") && s.length < 3000) || /(loading|lazy|placeholder|blank|spinner)\.(gif|png|svg)/i.test(s)) return null;
    return s;
  }
  function chapterImages() {
    const cands = [];
    for (const im of document.querySelectorAll("img")) {
      if (im.closest("header,nav,footer,aside,[class*=comment],[id*=comment],[class*=related],[class*=recommend],[class*=sidebar],[class*=avatar]")) continue;
      const src = srcOf(im);
      if (!src) continue;
      const r = im.getBoundingClientRect();
      const w = Math.max(im.naturalWidth || 0, r.width), h = Math.max(im.naturalHeight || 0, r.height);
      // gambar lazy yang belum dimuat: ukurannya 0, jadi pakai lebar wadahnya
      const lazy = LAZY.some((a) => im.hasAttribute(a)) || im.loading === "lazy";
      const pw = im.parentElement ? im.parentElement.getBoundingClientRect().width : 0;
      if (w < 280 && r.width < 280 && !(lazy && !im.naturalWidth && pw >= 280)) continue;
      if (im.naturalWidth && im.naturalHeight && im.naturalHeight < 150) continue;
      cands.push({ im, src, h });
    }
    if (!cands.length) return [];
    // kelompok gambar terbesar (wadah halaman komik)
    const count = new Map();
    for (const c of cands) for (let p = c.im.parentElement, d = 0; p && d < 5; p = p.parentElement, d++) count.set(p, (count.get(p) || 0) + 1);
    let best = null, bestN = 0;
    for (const [p, n] of count) if (n > bestN || (n === bestN && best && best.contains(p))) { best = p; bestN = n; }
    const chosen = bestN >= 2 ? cands.filter((c) => best.contains(c.im)) : cands;
    const seen = new Set();
    return chosen.filter((c) => (seen.has(c.src) ? false : (seen.add(c.src), true))).map((c) => c.src);
  }
  const CHRE = /(?:chapter|chap|ch|episode|eps?|bab)[\/_\-\.\s]*(\d+(?:[.\-]\d+)?)/i;
  const chNum = (u) => { try { const x = new URL(u, location.href); const q = x.searchParams.get("episode_no"); if (q) return parseFloat(q); const m = decodeURIComponent(x.pathname).match(CHRE); return m ? parseFloat(m[1].replace("-", ".")) : null; } catch { return null; } };
  // Nomor chapter dari tulisan di halaman (untuk situs yang alamat bacanya berupa kode, mis. /reader/9f74f668-…)
  const CHTEXT = /(?:chapter|chap|ch\.?|episode|ep\.?|eps\.?|bab)\s*[-:#.]?\s*(\d+(?:\.\d+)?)/i;
  function textChapter() {
    const sel = document.querySelector("select option:checked");
    const srcs = [document.title, meta("og:title"), (document.querySelector("h1") || {}).textContent, (document.querySelector("h2") || {}).textContent, sel && sel.textContent];
    for (const t of srcs) { const m = String(t || "").match(CHTEXT); if (m) return parseFloat(m[1]); }
    return null;
  }
  // Halaman baca chapter? Dari alamat (chapter-12), pola alamat pembaca (/reader/…), atau judul halaman + banyak gambar komik
  let readerCache = { url: "", v: false };
  function isReaderPage() {
    if (readerCache.url === location.href && readerCache.v) return true;
    // galeri berangka: /g/690628/1/ = halaman baca ke-1 (halaman judulnya /g/690628/)
    let v = chNum(location.href) != null || /\/(reader|read|viewer|chapter|episode)\/[^/]{4,}/i.test(location.pathname) || /^\/[a-z]{1,12}\/\d{3,}\/\d{1,4}\/?$/i.test(location.pathname);
    if (!v && textChapter() != null && document.body) { try { v = chapterImages().length >= 3; } catch {} }
    readerCache = { url: location.href, v };
    return v;
  }
  // Gambar sampul di halaman judul kalau situsnya tidak menyediakan og:image
  function findCoverInPage() {
    const words = (document.title || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3).slice(0, 6);
    let best = null, bestScore = 0;
    for (const im of document.querySelectorAll("img")) {
      if (im.closest("header nav,footer,[class*=comment],[class*=related],[class*=recommend],[class*=avatar],[class*=logo]")) continue;
      const r = im.getBoundingClientRect();
      if (r.width < 100 || r.top + scrollY > 1600) continue;
      const ratio = r.height / r.width;
      if (ratio < 1.05 || ratio > 2) continue;
      const src = srcOf(im);
      if (!src) continue;
      const hint = [im.className, im.id, im.alt, im.parentElement && im.parentElement.className, im.closest("[class]") && im.closest("[class]").className].join(" ").toLowerCase();
      let score = r.width * r.height / 1000;
      if (/cover|thumb|poster|series|summary|manga-?image|komik|sampul/.test(hint)) score += 200;
      if (words.some((w) => (im.alt || "").toLowerCase().includes(w))) score += 120;
      if (score > bestScore) { bestScore = score; best = src; }
    }
    return best;
  }
  function chapterLinks() {
    const cur = chNum(location.href) ?? textChapter();
    let next = null, prev = null, nNext = Infinity, nPrev = -Infinity;
    const links = [...document.querySelectorAll("a[href]")].filter((a) => { try { return new URL(a.href).host === location.host; } catch { return false; } });
    if (cur != null) for (const a of links) {
      const n = chNum(a.href);
      if (n == null || a.href.split("#")[0] === location.href.split("#")[0]) continue;
      if (n > cur && n < nNext) { nNext = n; next = a.href; }
      if (n < cur && n > nPrev) { nPrev = n; prev = a.href; }
    }
    const byText = (re) => links.find((a) => re.test((a.textContent || "").trim()) || re.test(a.getAttribute("aria-label") || "") || re.test(a.title || "") || re.test(a.className || ""));
    next = next || (document.querySelector("a[rel=next]") || {}).href || (byText(/^(next|selanjutnya|berikutnya|lanjut|›|»|→|>)\b|next[-_ ]?(chap|ch|ep)/i) || {}).href || null;
    prev = prev || (document.querySelector("a[rel=prev]") || {}).href || (byText(/^(prev|previous|sebelumnya|‹|«|←|<)\b|prev[-_ ]?(chap|ch|ep)/i) || {}).href || null;
    return { next, prev, cur };
  }
  // Link ke halaman judul (daftar chapter) dari halaman chapter
  function findSeries() {
    if (st.book && st.book.seriesUrl) return st.book.seriesUrl;
    const here = new URL(location.href);
    const path = decodeURIComponent(here.pathname).toLowerCase();
    const m = path.match(/(?:^|[\/_\-.])(?:chapter|chap|ch|episode|eps?|bab)[\/_\-.\s]*\d/);
    const before = m ? path.slice(0, m.index) : path.replace(/\/[^/]*\/?$/, "");
    const slug = before.split("/").filter(Boolean).pop() || "";
    const COMMON = /^(manga|manhwa|manhua|komik|comic|comics|series|title|read|baca|en|id|webtoon|list|detail|viewer)$/;
    let best = null, bestScore = 0;
    for (const a of document.querySelectorAll("a[href]")) {
      let u; try { u = new URL(a.href); } catch { continue; }
      if (u.host !== here.host || chNum(u.href) != null || u.href.split("#")[0] === here.href.split("#")[0]) continue;
      const p = decodeURIComponent(u.pathname).toLowerCase().replace(/\/+$/, "");
      if (p === "" || p === "/") continue;
      const last = p.split("/").pop();
      const text = (a.textContent || "").trim();
      let score = 0;
      if (slug && !COMMON.test(slug) && last === slug) score += 6;
      else if (slug && slug.length > 3 && last.includes(slug)) score += 3;
      if (before.length > 1 && (p === before.replace(/\/+$/, "") || path.startsWith(p + "/")) && !COMMON.test(last)) score += 4;
      if (/^(daftar|semua|list|all)\s*(chapter|bab|episode|ch)|chapter\s*list|^(info|detail|judul)$|episode list/i.test(text)) score += 4;
      if (a.closest("nav,[class*=breadcrumb],[id*=breadcrumb]")) score += 1;
      if (/^\/(manga|manhwa|manhua|komik|comic|comics|series|title|webtoon|novel)\/[^/]+$/.test(p)) score += 3;
      const pageTitle = (document.title || "").toLowerCase().split(/\s+[-|–—]\s+|\s+(?:chapter|ch\.?|episode|bab)\s*\d/i)[0].trim();
      if (text.length > 3 && pageTitle.length > 3 && (pageTitle.includes(text.toLowerCase()) || text.toLowerCase().includes(pageTitle))) score += 3;
      if (/^(home|beranda|index)$/i.test(text)) score -= 5;
      if (score > bestScore) { bestScore = score; best = u.href; }
    }
    // Webtoon: halaman daftar = /list?title_no=…
    if (!best && here.searchParams.get("title_no") && /\/viewer/.test(here.pathname)) best = here.origin + here.pathname.replace(/\/[^/]*\/viewer$/, "/list") + "?title_no=" + here.searchParams.get("title_no");
    return bestScore >= 3 || (best && /\/list\?title_no=/.test(best)) ? best : null;
  }
  function openReader(auto) {
    if (st.reader) return;
    const pages = chapterImages();
    if (pages.length < 2) { if (!auto) toast("Gambar komik tidak ditemukan di halaman ini"); return false; }
    const { next, prev, cur } = chapterLinks();
    const el = document.createElement("div");
    el.className = "reader";
    const width = site.readerWidth || (HP ? 100 : 60);
    const series = findSeries();
    el.innerHTML = `<div class="rbar"><button data-x="close" title="Tutup mode baca (Esc)">✕</button>
        ${series ? `<button data-x="series" title="Ke halaman judul / daftar chapter">☰ Judul</button>` : ""}
        <span class="t">${(document.title || "").replace(/[<>&]/g, "")}</span>
        ${HP ? "" : `<span>Lebar</span><input type="range" min="30" max="100" value="${width}" data-x="w">`}
        <button data-x="mode" title="Ganti mode: strip (manhwa) / per halaman (manga)">${site.readerMode === "page" ? "Per halaman" : "Strip"}</button>
        <span class="pnum" data-x="pnum"></span>
        <button data-x="theme" title="Latar gelap/terang">Latar</button>
        <button data-x="prev" ${prev ? "" : "disabled"} title="Chapter sebelumnya (←)">‹</button><button data-x="next" ${next ? "" : "disabled"} title="Chapter berikutnya (→)">›</button></div>
      <div class="pages" style="width:${width}%">${pages.map((s) => `<img src="${s.replace(/"/g, "&quot;")}" referrerpolicy="unsafe-url" loading="lazy" decoding="async">`).join("")}</div>
      <div class="paged" data-x="paged"><div class="pw"><img data-x="pimg" referrerpolicy="unsafe-url" alt=""></div></div>
      <div class="rend">${prev ? `<button data-x="prev">‹ Sebelumnya</button>` : ""}${series ? `<button data-x="series">☰ Daftar chapter</button>` : ""}${next ? `<button data-x="next">Berikutnya ›</button>` : "<span>Ini chapter terakhir yang ditemukan</span>"}</div>`;
    root.appendChild(el);
    st.reader = { el, next, prev, pages, i: 0, zoom: 1, paged: false };
    // ---- mode per halaman (manga): satu gambar, klik kanan/kiri layar atau panah untuk pindah, roda mouse = zoom
    const pg = el.querySelector(".paged"), pimg = el.querySelector('[data-x="pimg"]'), pnum = el.querySelector('[data-x="pnum"]');
    const R = st.reader;
    const showPage = (i) => {
      R.i = Math.max(0, Math.min(pages.length - 1, i));
      pimg.src = pages[R.i]; R.zoom = 1; applyZoom2();
      pnum.textContent = `${R.i + 1} / ${pages.length}`;
      pg.scrollTop = 0; pg.scrollLeft = 0;
      if (pages[R.i + 1]) { const pre = new Image(); pre.referrerPolicy = "unsafe-url"; pre.src = pages[R.i + 1]; }
    };
    const applyZoom2 = () => {
      pg.classList.toggle("z", R.zoom !== 1);
      if (R.zoom === 1) { pimg.style.width = ""; return; }
      const base = Math.min(pg.clientWidth / (pimg.naturalWidth || 1), (pg.clientHeight - 8) / (pimg.naturalHeight || 1), 1);
      pimg.style.width = Math.round((pimg.naturalWidth || 600) * base * R.zoom) + "px";
    };
    R.flip = (d) => {
      const n = R.i + d;
      if (n >= pages.length) { if (next) { toast("Akhir chapter · ke chapter berikutnya"); goChapter(next); } else toast("Ini halaman terakhir"); return; }
      if (n < 0) { if (prev) goChapter(prev); return; }
      showPage(n);
    };
    const setMode = (paged) => {
      R.paged = paged;
      el.classList.toggle("pm", paged);
      el.querySelector('[data-x="mode"]').textContent = paged ? "Per halaman" : "Strip";
      pnum.textContent = paged ? `${R.i + 1} / ${pages.length}` : "";
      if (paged) showPage(R.i);
    };
    // area klik: kiri & kanan (lebar diatur di Pengaturan) untuk pindah halaman; tengah untuk menggeser gambar
    const zoneAt = (x) => { const r = pg.getBoundingClientRect(), z = (site.pageZone || 15) / 100; return x < r.left + r.width * z ? -1 : x > r.right - r.width * z ? 1 : 0; };
    pg.addEventListener("click", (e) => {
      if (R.dragged) return;
      const z = zoneAt(e.clientX);
      if (z) R.flip(z * (site.readerRtl ? -1 : 1));
    });
    pg.addEventListener("mousemove", (e) => { const z = zoneAt(e.clientX); pg.style.cursor = z < 0 ? "w-resize" : z > 0 ? "e-resize" : R.zoom > 1 ? "grab" : "default"; });
    pg.addEventListener("wheel", (e) => { e.preventDefault(); R.zoom = Math.max(1, Math.min(5, R.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); if (R.zoom < 1.03) R.zoom = 1; applyZoom2(); }, { passive: false });
    // geser gambar yang diperbesar dengan seret
    let drag = null;
    pg.addEventListener("pointerdown", (e) => { if (R.zoom > 1 && !zoneAt(e.clientX)) { drag = { x: e.clientX, y: e.clientY, l: pg.scrollLeft, t: pg.scrollTop }; R.dragged = false; } });
    addEventListener("pointermove", (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 5) R.dragged = true; pg.scrollLeft = drag.l - dx; pg.scrollTop = drag.t - dy; });
    addEventListener("pointerup", () => { drag = null; setTimeout(() => (R.dragged = false), 0); });
    pimg.addEventListener("load", applyZoom2);
    if (site.readerMode === "page") setMode(true);
    if (site.readerDark === true || (site.readerDark == null && site.dark)) el.classList.add("dark");
    el.addEventListener("click", (e) => {
      const x = e.target.closest("[data-x]")?.dataset.x;
      if (x === "close") closeReader();
      if (x === "series" && series) location.href = series;
      if (x === "next" && next) goChapter(next);
      if (x === "prev" && prev) goChapter(prev);
      if (x === "mode") { setMode(!R.paged); H.setSite({ readerMode: R.paged ? "page" : "strip" }).then((s) => (site = s)).catch(() => {}); toast(R.paged ? `Mode per halaman: klik tepi kanan/kiri layar (${site.pageZone || 15}%) atau panah untuk pindah, roda mouse untuk zoom, seret bagian tengah untuk menggeser` : "Mode strip"); }
      if (x === "theme") { el.classList.toggle("dark"); H.setSite({ readerDark: el.classList.contains("dark") }).then((s) => (site = s)).catch(() => {}); }
    });
    const wIn = el.querySelector('[data-x="w"]');
    wIn?.addEventListener("input", (e) => { el.querySelector(".pages").style.width = e.target.value + "%"; });
    wIn?.addEventListener("change", (e) => { H.setSite({ readerWidth: +e.target.value }).then((s) => (site = s)).catch(() => {}); });
    // mode baca diingat per situs: chapter berikutnya otomatis terbuka di mode baca
    if (!auto && !site.reader) H.setSite({ reader: true }).then((s) => (site = s)).catch(() => {});
    document.documentElement.style.setProperty("overflow", "hidden", "important");
    if (cur != null) toast(`Mode baca · chapter ${cur} · ${pages.length} gambar`);
    return true;
  }
  // pindah chapter dari mode baca: chapter berikutnya langsung dibuka di mode baca juga
  function goChapter(url) { try { sessionStorage.setItem("rb.reader", "1"); } catch {} location.href = url; }
  // keep = tutup sementara (pindah halaman / pilih elemen), tanpa mematikan mode baca untuk situs ini
  function closeReader(keep) {
    if (!st.reader) return;
    st.reader.el.remove(); st.reader = null;
    if (!keep && site.reader) H.setSite({ reader: false }).then((s) => (site = s)).catch(() => {});
    document.documentElement.style.removeProperty("overflow");
    if (st.scroll) { stopScroll(); }
  }

  // ---------- info halaman (untuk rak buku) ----------
  function meta(n) { const m = document.querySelector(`meta[property="${n}"],meta[name="${n}"]`); return m ? m.content : null; }
  function pageInfo() {
    const isCh = isReaderPage();
    const og = meta("og:image") || meta("twitter:image");
    let cover = og ? new URL(og, location.href).href : null;
    if (!isCh && !cover) try { cover = findCoverInPage(); } catch {}
    return { url: location.href, siteName: meta("og:site_name"), title: meta("og:title") || document.title, cover, chapter: isCh, series: isCh ? findSeries() : null, chapterNum: isCh ? chNum(location.href) ?? textChapter() : null };
  }
  let lastUrl = "";
  function reportPage() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    if (popupPause === Infinity) popupPause = 0;
    try { H.pageInfo(pageInfo()); } catch {}
    // dikirim lagi setelah gambar & judul halaman selesai dimuat (situs yang lambat atau SPA)
    const u0 = location.href;
    setTimeout(() => { if (location.href === u0) try { readerCache.url = ""; H.pageInfo(pageInfo()); } catch {} }, 3500);
    st.killed = st.killed.filter((k) => k.el.isConnected);
    if (st.reader) closeReader(true); // pindah chapter tanpa muat ulang (situs SPA)
    if (site.coverSel) setTimeout(() => applyAreaCover().catch(() => {}), 1500);
    let carry = false;
    try { carry = sessionStorage.getItem("rb.reader") === "1"; sessionStorage.removeItem("rb.reader"); } catch {}
    if ((carry || site.reader) && isReaderPage()) {
      // gambar komik sering dimuat belakangan: coba terus sampai ±15 detik
      let tries = 0;
      const t = setInterval(() => { if (lastUrl !== location.href || openReader(true) || ++tries > 25) clearInterval(t); }, 600);
    }
  }

  // ---------- perintah dari aplikasi (tombol toolbar) ----------
  H.onCommand(async (cmd) => {
    if (cmd === "gray") { site = await H.setSite({ gray: !site.gray }); applyLook(); toast(site.gray ? "Hitam putih: nyala" : "Hitam putih: mati"); if (st.menu) renderMenu(); }
    if (cmd === "scroll") toggleScroll();
    if (cmd === "reader") st.reader ? closeReader() : openReader();
    if (cmd === "picker") startPicker();
    if (cmd === "coverpick") startPicker("cover");
    if (cmd === "allowpick") startPicker("allow");
    if (cmd === "unhide-all") { site = await H.removeHidden(null); applyLook(); toast("Semua elemen ditampilkan lagi"); }
    if (cmd === "cover-area") applyAreaCover(true).catch(() => {});
    if (cmd === "menu") st.menu ? closeMenu() : openMenu();
    if (cmd === "refresh-site") { site = await H.getSite(); checkDark(); applyLook(); if (st.menu) renderMenu(); }
    if (cmd === "dark") { site = await H.setSite({ dark: !site.dark }); checkDark(); toast(site.dark ? (st.darkOn ? "Mode gelap: nyala" : "Mode gelap: nyala (situs ini sudah gelap)") : "Mode gelap: mati"); if (st.menu) renderMenu(); }
    if (cmd && cmd.zoom) { site.zoom = cmd.zoom; if (st.menu) renderMenu(); }
    if (cmd && cmd.bot) botCommand(cmd.bot);
  });

  // ---------- mulai ----------
  // Pengamat perubahan halaman: dipasang sedini mungkin (sebelum halaman selesai dimuat)
  let observer = null;
  function startObserver() {
    if (observer || !document.documentElement) return;
    observer = new MutationObserver((muts) => {
      attach();
      if (!document.getElementById("rb-gray") || !document.getElementById("rb-hide")) applyLook();
      const nodes = [];
      for (const m of muts) {
        if (m.type === "childList") for (const n of m.addedNodes) { if (n.nodeType === 1) nodes.push(n); }
        else if (m.type === "attributes" && m.target.nodeType === 1 && m.target !== host) nodes.push(m.target);
        if (nodes.length > 200) break;
      }
      if (nodes.length) quickCheck(nodes);
      queueScan();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class", "hidden", "open"] });
  }
  startObserver();
  async function init() {
    try { site = await H.getSite(); } catch {}
    try { fabPos = (await H.getFab()) || fabPos; } catch {}
    applyLook();
    attach(); placeFab(); wake();
    startObserver();
    setInterval(() => { reportPage(); queueScan(); checkDark(); }, 1200);
    reportPage(); queueScan(); checkDark();
    // waktu baca: dihitung per 30 detik kalau halaman terlihat dan sedang dibaca (ada gerakan atau gulir otomatis)
    let lastInput = Date.now();
    for (const ev of ["pointerdown", "pointermove", "wheel", "keydown", "touchstart", "scroll"]) addEventListener(ev, () => (lastInput = Date.now()), { capture: true, passive: true });
    setInterval(() => { if (document.visibilityState === "visible" && (st.scroll || Date.now() - lastInput < 120000)) try { H.active(30); } catch {} }, 30000);
  }
  // gaya hitam putih dipasang sedini mungkin supaya halaman tidak sempat tampil berwarna
  H.getSite().then((s) => { site = s; if (site.dark && document.body) checkDark(); applyLook(); }).catch(() => {});
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
