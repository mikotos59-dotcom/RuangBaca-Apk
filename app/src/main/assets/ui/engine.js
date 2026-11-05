// Mesin data Ruang Baca versi HP. Berjalan di tampilan aplikasi (WebView lokal), memakai lib/data.js yang sama
// dengan versi PC. Penyimpanan file lewat RBUi (Java). Halaman situs bertanya ke mesin ini lewat Java (RBPage).
(() => {
"use strict";
// dibungkus fungsi: data.js versi PC sudah memakai nama Data, parseChapter, dll. di lingkup global
const { Data, parseChapter, learnRule } = window.RBDataLib;
const data = new Data("ruangbaca.json");

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const baseDomain = (h) => h.split(".").slice(-2).join(".");
const sameSite = (a, b) => !!a && !!b && baseDomain(hostOf(a)) === baseDomain(hostOf(b));
const wwwless = (h) => String(h || "").replace(/^www\./, "");

const E = {
  privateOpen: false,
  lastInfo: null,
  page: { url: "", title: "" },
  session: {},
  listeners: [],
};

// ---------- rak privat (PIN khusus HP; tidak ikut ekspor) ----------
const privHosts = () => (data.settings.privateHosts || []).map(wwwless);
const isPrivate = (host) => { const h = wwwless(host); return privHosts().some((p) => h === p || h.endsWith("." + p)); };
const visible = (host) => E.privateOpen || !isPrivate(host);
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
async function hashPin(pin, salt) {
  const key = await window.crypto.subtle.importKey("raw", new TextEncoder().encode(String(pin)), "PBKDF2", false, ["deriveBits"]);
  const bits = await window.crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 120000 }, key, 256);
  return hex(bits);
}
async function setPin(pin) {
  const salt = hex(window.crypto.getRandomValues(new Uint8Array(16)));
  data.settings.pinHp = { salt, hash: await hashPin(pin, salt) };
  data.flush();
}
async function pinOk(pin) {
  if (!data.settings.pinHp) await setPin("A123");
  const p = data.settings.pinHp;
  return (await hashPin(pin, p.salt)) === p.hash;
}

// ---------- tampilan buku ----------
function bookView(b) {
  if (!b) return null;
  const src = b.cover ? RBUi.coverPath(b.cover) : "";
  return { ...b, coverSrc: src || null, private: isPrivate(b.host) };
}
const shelfList = () => data.shelf().filter((b) => visible(b.host)).map(bookView);
const favList = () => data.favorites().filter((f) => visible(f.host)).map((f) => ({ ...f, private: isPrivate(f.host) }));

// Buang nama situs di belakang judul ("Judul - NamaSitus")
function stripSite(title, url, siteName) {
  let t = String(title || "");
  const host = hostOf(url).split(".")[0].toLowerCase();
  const m = t.match(/^(.{3,}?)\s+[-|–—]\s+([^-|–—]{2,40})$/);
  if (m) {
    const tail = m[2].trim().toLowerCase();
    if ((siteName && tail === String(siteName).trim().toLowerCase()) || tail.replace(/[^a-z0-9]/g, "").includes(host) || host.includes(tail.replace(/[^a-z0-9]/g, ""))) t = m[1];
  }
  return t;
}

// ---------- sampul (diunduh oleh Java) ----------
let coverSeq = 0;
const coverWait = new Map();
function downloadCover(b, url, referer, source) {
  if (!url || !/^https?:/.test(url)) return Promise.resolve(false);
  const id = ++coverSeq;
  return new Promise((res) => {
    coverWait.set(id, (name) => {
      if (!name) return res(false);
      const old = b.cover;
      data.updateBook(b.id, { cover: name, coverSource: source });
      if (old && old !== name) RBUi.deleteCover(old);
      notify();
      res(true);
    });
    RBUi.downloadCover(id, url, referer || "", b.id);
  });
}
// sampul otomatis hanya mengganti sampul tebakan, tidak pernah yang dipilih sendiri
const replaceable = (b) => !b.cover || !["manual", "file"].includes(b.coverSource);

// ---------- perubahan ke tampilan & Java ----------
function nativeState() {
  const s = data.settings;
  const popupHosts = {};
  for (const [h, x] of Object.entries(data.d.sites)) if (x.popupHosts && x.popupHosts.length) popupHosts[h] = x.popupHosts;
  RBUi.setNative(JSON.stringify({ adblock: !!s.adblock, allowAds: s.allowAds || [], popupHosts, theme: s.theme || "normal", search: s.search || "google", dns: s.dns || "bawaan", dnsCustom: s.dnsCustom || "", antiAdblock: Object.keys(data.d.sites).filter((h) => data.d.sites[h].antiAdblock) }));
}
function toolbarState() {
  const url = E.page.url;
  const b = url ? data.findBook(url) : null;
  const pc = url ? parseChapter(url) : null;
  RBUi.setToolbar(JSON.stringify({ saved: !!b, title: b ? b.title : "", chapter: pc && pc.chapter != null ? pc.chapter : b && b.lastUrl === url ? b.lastChapter ?? null : null }));
}
function notify() { for (const f of E.listeners) try { f(); } catch {} toolbarState(); }

// ---------- pertanyaan dari halaman situs (RBPage → Java → sini) ----------
// url ditentukan Java dari WebView halaman, bukan dari halaman itu sendiri
const PAGE = {
  getSite(url) { return data.site(hostOf(url)); },
  setSite(url, patch) {
    const ok = {};
    // halaman hanya boleh mengubah pengaturan tampilan situsnya sendiri
    for (const k of ["gray", "paper", "contrast", "popup", "speed", "reader", "dark", "readerWidth", "readerDark", "coverSel", "readerMode", "readerRtl", "popupAllow", "zoom"]) if (patch && k in patch) ok[k] = patch[k];
    const r = data.setSite(hostOf(url), ok);
    nativeState();
    return r;
  },
  addHidden(url, sel) { return data.addHidden(hostOf(url), sel); },
  removeHidden(url, sel) { return data.removeHidden(hostOf(url), sel); },
  pageInfo(url, info) {
    if (!info || !sameSite(info.url, url)) return null;
    E.lastInfo = info;
    const b = data.track(url) || data.findBook(url);
    // sampul asli dari halaman judul kalau sampulnya masih tebakan
    if (b && replaceable(b) && !b.cover && info.cover && !info.chapter) downloadCover(b, info.cover, url, "seri");
    notify();
    return null;
  },
  shelf(url) { return bookView(data.findBook(url)); },
  async addToShelf(url, info) {
    info = info || {};
    const b = data.addBook({ url, title: stripSite(info.title, url, info.siteName), cover: info.cover || null });
    if (info.series && sameSite(info.series, url) && !b.seriesUrl) data.updateBook(b.id, { seriesUrl: info.series });
    if (replaceable(b) && info.cover) downloadCover(b, info.cover, url, info.chapter ? "halaman" : "seri");
    notify();
    return bookView(b);
  },
  getFab() { return data.settings.fab || null; },
  setFab(url, pos) { if (pos && isFinite(pos.x) && isFinite(pos.y)) { data.settings.fab = { x: +pos.x, y: +pos.y }; data.save(); } return true; },
  async setCover(url, o) {
    let b = data.findBook(url);
    if (!b) { const i = (o && o.info) || {}; b = data.addBook({ url, title: stripSite(i.title, url, i.siteName) }); }
    const src = o && typeof o.src === "string" ? o.src : null;
    if (!src || !(await downloadCover(b, src, url, o && o.source === "area" ? "area" : "manual"))) throw new Error("Gambar itu tidak bisa diambil. Coba gambar lain.");
    notify();
    return bookView(data.findBook(url));
  },
  active(url, sec) {
    const b = data.addReading(url, Math.min(60, +sec || 0));
    if (b) { E.session[b.id] = (E.session[b.id] || 0) + (+sec || 0); notify(); }
    return null;
  },
  learn(url, kind) { return learnSite(url, hostOf(url), kind); },
  allowPopup() { RBUi.allowPopup(); return null; },
  botStart() { RBUi.toast("Unduh otomatis belum ada di versi HP."); return null; },
};

// Ajari pola alamat situs (sama seperti versi PC)
function learnSite(url, h, kind) {
  if (kind === "forget") { data.setSite(h, { urlRule: null, learnTitle: null, learnRead: null }); notify(); return { msg: "Pola alamat situs ini dilupakan." }; }
  const before = data.findBook(url);
  if (kind === "title") data.setSite(h, { learnTitle: url });
  else data.setSite(h, { learnRead: url, learnKind: kind === "read-chapter" ? "chapter" : "page" });
  const site = data.d.sites[h] || {};
  if (!site.learnTitle || !site.learnRead) return { msg: kind === "title" ? "Halaman judul dicatat. Sekarang buka halaman bacanya, lalu pilih \"Ini halaman baca\"." : "Halaman baca dicatat. Sekarang buka halaman judulnya, lalu pilih \"Ini halaman judul\"." };
  const r = learnRule(site.learnTitle, site.learnRead, site.learnKind);
  if (r.error) { data.setSite(h, { learnRead: null }); return { msg: r.error }; }
  data.setSite(h, { urlRule: r.rule });
  const books = data.shelf().filter((b) => b.host === h);
  for (const b of books) { const info = parseChapter(b.seriesUrl || b.lastUrl || ""); if (info && info.learned) { b.slug = info.slug; if (info.root) b.seriesUrl = info.root; } }
  if (before) { const info = parseChapter(url); if (info && info.learned) { before.slug = info.slug; if (info.root) before.seriesUrl = info.root; } }
  data.save(); notify();
  const pat = "/" + r.rule.title.map((x) => (x === "*" ? "{judul}" : x)).join("/") + "/";
  return { msg: `Pola situs dipelajari: judul ${pat}. Semua judul di situs ini mengikuti pola ini.` };
}

// ---------- antarmuka untuk Java ----------
window.RBEngine = {
  // permintaan halaman: hasil dikirim balik lewat RBUi.reply(id, json)
  page(id, url, method, argsJson) {
    let args = [];
    try { args = JSON.parse(argsJson) || []; } catch {}
    const f = PAGE[method];
    const done = (v) => { if (id) RBUi.reply(id, JSON.stringify(v === undefined ? null : v)); };
    if (!f) return done({ __err: "tidak dikenal" });
    Promise.resolve().then(() => f(url, ...args)).then(done, (e) => done({ __err: String((e && e.message) || e) }));
  },
  visit(url, title) {
    E.page = { url: url || "", title: title || "" };
    if (url && /^https?:/.test(url)) { const b = data.track(url); if (b) notify(); }
    toolbarState();
  },
  // ikon situs favorit dari Java (data:image/png). Disimpan terpisah dari ikon versi PC (nama file).
  favIcon(host, icon) {
    if (!/^data:image\//.test(icon || "")) return;
    const w = (x) => String(x || "").replace(/^www\./, "");
    let n = 0;
    for (const f of data.favorites()) if (w(f.host) === w(host) && f.iconData !== icon) { f.iconData = icon; n++; }
    if (n) { data.save(); if (window.RBHome) RBHome.refresh(); }
  },
  coverDone(id, name) { const f = coverWait.get(id); coverWait.delete(id); if (f) f(name || ""); },
  saveCurrent() {
    const url = E.page.url;
    if (!url) return RBUi.toast("Buka halaman komiknya dulu.");
    const info = E.lastInfo && sameSite(E.lastInfo.url, url) ? E.lastInfo : { url, title: E.page.title };
    try {
      PAGE.addToShelf(url, info).then((b) => RBUi.toast(`Disimpan ke rak: ${b.title}`));
    } catch (e) { RBUi.toast(String(e.message || e)); }
  },
  imported(text) {
    try {
      const r = data.importJson(JSON.parse(text));
      notify();
      RBUi.toast(`Impor selesai: ${r.added} judul baru`);
    } catch (e) { RBUi.toast(String(e.message || e)); }
  },
  flush() { data.flush(); },
  // tombol "Selalu" di bilah pop-up: pop-up dari situs ini ke situs tujuan dibuka di tempat
  popupAlways(pageUrl, target) {
    const h = hostOf(pageUrl), t = wwwless(hostOf(target));
    if (!h || !t) return;
    const cur = data.site(h).popupHosts || [];
    if (!cur.includes(t)) data.setSite(h, { popupHosts: [...cur, t] });
    nativeState();
    RBUi.toast(`Pop-up ke ${t} dari situs ini akan dibuka langsung.`);
  },
  // izinkan / blok lagi iklan di satu situs
  toggleAds(pageUrl) {
    const h = wwwless(hostOf(pageUrl));
    if (!h) return;
    const list = (data.settings.allowAds || []).map(wwwless);
    const on = list.includes(h);
    data.settings.allowAds = on ? list.filter((x) => x !== h) : [...list, h];
    data.save(); nativeState();
    RBUi.toast(on ? `Iklan di ${h} diblok lagi. Muat ulang halaman.` : `Iklan di ${h} diizinkan. Muat ulang halaman.`);
  },
};

// dipakai tampilan rak (ui.js)
window.RB = {
  data, E, shelfList, favList, bookView, isPrivate, visible, pinOk, setPin, privHosts, wwwless, hostOf, nativeState,
  onChange(f) { E.listeners.push(f); },
  notify,
  sessionSeconds(id) { return E.session[id] || 0; },
};
if (!data.settings.pinHp) setPin("A123");
nativeState();
})();
