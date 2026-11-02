// Data Ruang Baca: pengaturan, pengaturan per situs, rak buku, dan situs favorit (satu file JSON).
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DEFAULTS = {
  theme: "normal",          // normal | dark | batik
  adblock: true,
  search: "google",         // google | duckduckgo | bing
  // tampilan hitam putih (bawaan, bisa diganti per situs)
  gray: false, paper: "putih", contrast: 115,
  popup: true,              // singkirkan pop-up Pro/koin
  label: "5",               // label pop-up yang disingkirkan: "5" detik · "tetap" · "sembunyi"
  dark: false,              // mode gelap situs (bawaan untuk situs baru)
  offlineDl: true,          // unduhan .zip/.rar/.7z berisi gambar otomatis masuk Rak Offline
  dlDir: "",                // folder unduhan (kosong = folder Downloads Windows)
  sbWidth: 0,               // lebar scrollbar (px); 0 = bawaan situs
  pageZone: 15,             // mode per halaman: lebar area klik kiri/kanan (% layar)
  autoDl: false, botMin: 5, botMax: 10.9, botLimit: 30, // unduh otomatis (bot): mati bawaan
  offWidth: 760, offDark: true, // tampilan pembaca offline
  dns: "bawaan",            // bawaan | cloudflare | google | quad9 | adguard | kustom
  dnsCustom: "",            // alamat DoH sendiri, mis. https://dns.contoh.id/dns-query
  speed: 40,                // kecepatan gulir otomatis 1–100
  fab: { x: 0.94, y: 0.78 }, // posisi tombol melayang (proporsi layar)
  allowAds: [],             // situs yang iklannya tidak diblokir
};

class Data {
  constructor(file) {
    this.file = file;
    this.d = { settings: { ...DEFAULTS }, sites: {}, shelf: [], favorites: [] };
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      this.d = { ...this.d, ...raw, settings: { ...DEFAULTS, ...(raw.settings || {}) } };
    } catch {}
    // judul lama dari alamat galeri berangka (/g/690628/) dulu tersimpan dengan nama pendek "g": dibetulkan
    for (const b of this.d.shelf || []) {
      if (b.slug && b.slug.length >= 3) continue;
      const info = parseChapter(b.seriesUrl || b.lastUrl || "");
      if (info && info.slug !== b.slug) b.slug = info.slug;
    }
    this.timer = null;
    ruleLookup = (host) => (this.d.sites[host] && this.d.sites[host].urlRule) || null;
  }
  save() { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 300); }
  flush() {
    clearTimeout(this.timer);
    try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); fs.writeFileSync(this.file + ".tmp", JSON.stringify(this.d, null, 1)); fs.renameSync(this.file + ".tmp", this.file); } catch {}
  }
  get settings() { return this.d.settings; }

  // Pengaturan efektif untuk satu situs (bawaan + yang diubah di situs itu)
  site(host) {
    const s = this.d.sites[host] || {};
    const g = this.d.settings;
    return { host, gray: s.gray ?? g.gray, paper: s.paper ?? g.paper, contrast: s.contrast ?? g.contrast, popup: s.popup ?? g.popup,
      speed: s.speed ?? g.speed, hidden: s.hidden || [], reader: !!s.reader, paywall: s.paywall || [], ads: !g.allowAds.includes(host),
      dark: s.dark ?? g.dark, zoom: s.zoom ?? 100, label: g.label,
      readerWidth: s.readerWidth ?? null, readerDark: s.readerDark ?? null, coverSel: s.coverSel || null,
      antiAdblock: !!s.antiAdblock, popupAllow: s.popupAllow || [], popupHosts: s.popupHosts || [],
      bot: !!g.autoDl, dlSel: s.dlSel || null, nextSel: s.nextSel || null,
      readerMode: s.readerMode === "page" ? "page" : "strip", readerRtl: !!s.readerRtl, pageZone: g.pageZone ?? 15, sbWidth: g.sbWidth || 0,
      urlRule: s.urlRule || null, learnTitle: s.learnTitle || null, learnRead: s.learnRead || null };
  }
  setSite(host, patch) {
    const s = this.d.sites[host] || (this.d.sites[host] = {});
    for (const [k, v] of Object.entries(patch)) {
      if (["gray", "popup", "reader", "dark", "antiAdblock", "readerRtl"].includes(k)) s[k] = !!v;
      else if (k === "readerMode") s[k] = v === "page" ? "page" : "strip";
      else if (k === "zoom") s[k] = Math.max(30, Math.min(300, Math.round(+v || 100)));
      else if (k === "readerWidth") s[k] = Math.max(30, Math.min(100, Math.round(+v || 60)));
      else if (k === "readerDark") s[k] = v === null ? null : !!v;
      else if (k === "popupHosts") s[k] = Array.isArray(v) ? v.map((x) => String(x).slice(0, 120)).slice(-30) : [];
      else if (k === "popupAllow") s[k] = Array.isArray(v) ? v.map((x) => String(x).slice(0, 300)).slice(-20) : [];
      else if (k === "urlRule") s[k] = v && Array.isArray(v.title) ? v : null;
      else if (k === "learnTitle" || k === "learnRead") s[k] = v ? String(v).slice(0, 500) : null;
      else if (k === "learnKind") s[k] = v === "chapter" ? "chapter" : "page";
      else if (k === "dlSel" || k === "nextSel") s[k] = v ? String(v).slice(0, 300) : null;
      else if (k === "coverSel") s[k] = v ? String(v).slice(0, 300) : null; // area sampul di halaman judul situs ini
      else if (k === "paper" && ["putih", "krem"].includes(v)) s[k] = v;
      else if (k === "contrast") s[k] = Math.max(80, Math.min(180, Math.round(+v || 100)));
      else if (k === "speed") s[k] = Math.max(1, Math.min(100, Math.round(+v || 30)));
    }
    this.save();
    return this.site(host);
  }
  addHidden(host, sel) {
    const s = this.d.sites[host] || (this.d.sites[host] = {});
    s.hidden = [...new Set([...(s.hidden || []), String(sel).slice(0, 400)])].slice(-200);
    this.save();
    return this.site(host);
  }
  removeHidden(host, sel) {
    const s = this.d.sites[host];
    if (s && s.hidden) { s.hidden = sel ? s.hidden.filter((x) => x !== sel) : []; this.save(); }
    return this.site(host);
  }

  // ---------- rak buku ----------
  shelf() { return this.d.shelf; }
  findBook(url) {
    // alamat baca berupa kode (mis. /reader/9f74…) yang sudah pernah dikaitkan ke sebuah judul
    const alias = this.d.shelf.find((b) => b.lastUrl === url || (b.readerUrls || []).includes(url));
    if (alias) return alias;
    const info = parseChapter(url);
    if (!info) return null;
    // judul ber-ID angka (mis. g-690628) harus sama persis: g-12345 bukan g-123456
    const idSlug = (x) => /-\d{3,}$/.test(x);
    return this.d.shelf.find((b) => b.host === info.host && b.slug.length >= 3 && (info.exact || idSlug(info.slug) || idSlug(b.slug) ? b.slug === info.slug : info.slug.includes(b.slug) || b.slug.includes(info.slug))) || null;
  }
  addBook({ url, title, cover }) {
    const info = parseChapter(url);
    if (!info) throw new Error("Alamat halaman tidak dikenali.");
    let b = this.findBook(url);
    if (!b) {
      b = { id: crypto.randomBytes(6).toString("hex"), host: info.host, slug: info.slug, title: cleanTitle(title) || info.slug.replace(/-/g, " "), seriesUrl: info.root || (info.page != null ? galleryRoot(url) : info.chapter == null ? url : null),
        added: Date.now(), cover: null, coverUrl: cover || null };
      this.d.shelf.unshift(b);
    }
    if (info.chapter != null) Object.assign(b, { lastUrl: url, lastChapter: info.chapter, lastRead: Date.now() });
    else if (info.page != null) { Object.assign(b, { lastUrl: url, lastRead: Date.now() }); if (!b.seriesUrl || b.seriesUrl === url) b.seriesUrl = info.root || galleryRoot(url); }
    else if (!b.seriesUrl) b.seriesUrl = url;
    this.save();
    return b;
  }
  // Dipanggil setiap halaman dibuka: chapter terakhir otomatis tercatat
  track(url) {
    const info = parseChapter(url);
    if (info && info.chapter == null && info.page != null) {
      // galeri / pola halaman: halaman terakhir yang dibuka dipakai untuk "Lanjut"
      const g = this.findBook(url);
      if (g) { g.lastUrl = url; g.lastRead = Date.now(); this.save(); }
      return g || null;
    }
    if (!info || info.chapter == null) return null;
    const b = this.findBook(url);
    if (!b) return null;
    b.lastUrl = url; b.lastChapter = info.chapter; b.lastRead = Date.now();
    if (b.maxChapter == null || info.chapter > b.maxChapter) b.maxChapter = info.chapter;
    this.save();
    return b;
  }
  updateBook(id, patch) {
    const b = this.d.shelf.find((x) => x.id === id);
    if (!b) return null;
    if ("title" in patch) b.title = String(patch.title || "").trim().slice(0, 120) || b.title;
    if ("cover" in patch) b.cover = patch.cover;
    // asal sampul: seri (halaman judul) · manual (dipilih di halaman) · file · halaman (gambar halaman chapter) · potret (tangkapan layar)
    if ("coverSource" in patch) b.coverSource = patch.coverSource;
    if ("seriesUrl" in patch && patch.seriesUrl) b.seriesUrl = patch.seriesUrl;
    this.save();
    return b;
  }
  // Kaitkan halaman baca tanpa nomor di alamat ke judulnya (chapter dari tulisan di halaman)
  trackAlias(b, url, chapter) {
    b.lastUrl = url; b.lastRead = Date.now();
    if (chapter != null && isFinite(chapter)) { b.lastChapter = chapter; if (b.maxChapter == null || chapter > b.maxChapter) b.maxChapter = chapter; }
    b.readerUrls = [url, ...(b.readerUrls || []).filter((x) => x !== url)].slice(0, 60);
    this.save();
    return b;
  }
  // waktu baca (detik) untuk buku dari alamat halaman
  addReading(url, sec) {
    const b = this.findBook(url);
    if (!b) return null;
    b.readSeconds = (b.readSeconds || 0) + sec;
    const day = new Date().toLocaleDateString("sv");
    this.d.today = this.d.today && this.d.today.day === day ? this.d.today : { day, seconds: 0 };
    this.d.today.seconds += sec;
    this.save();
    return b;
  }
  today() { const day = new Date().toLocaleDateString("sv"); return this.d.today && this.d.today.day === day ? this.d.today.seconds : 0; }
  setFavoriteIcon(host, icon) {
    let n = 0;
    const w = (x) => String(x || "").replace(/^www\./, "");
    for (const f of this.d.favorites) if (w(f.host) === w(host)) { if (f.icon !== icon) { f.icon = icon; n++; } }
    if (n) this.save();
    return n;
  }
  removeBook(id) { this.d.shelf = this.d.shelf.filter((b) => b.id !== id); this.save(); }

  // ---------- situs favorit ----------
  favorites() { return this.d.favorites; }
  addFavorite({ url, title }) {
    let host; try { host = new URL(url).hostname; } catch { throw new Error("Alamat tidak valid."); }
    if (!this.d.favorites.some((f) => f.url === url)) this.d.favorites.push({ url, title: String(title || host).slice(0, 60), host });
    this.save();
    return this.d.favorites;
  }
  removeFavorite(url) { this.d.favorites = this.d.favorites.filter((f) => f.url !== url); this.save(); return this.d.favorites; }

  // ---------- ekspor / impor (untuk dipindah ke HP atau PC lain) ----------
  exportJson() { return { app: "Ruang Baca", version: 1, at: Date.now(), shelf: this.d.shelf.map(({ cover, ...b }) => b), favorites: this.d.favorites, sites: this.d.sites }; }
  importJson(j) {
    if (!j || j.app !== "Ruang Baca") throw new Error("Ini bukan file ekspor Ruang Baca.");
    let added = 0;
    for (const b of j.shelf || []) {
      const have = this.d.shelf.find((x) => x.host === b.host && x.slug === b.slug);
      if (have) { if ((b.lastRead || 0) > (have.lastRead || 0)) Object.assign(have, { lastUrl: b.lastUrl, lastChapter: b.lastChapter, lastRead: b.lastRead }); }
      else { this.d.shelf.push({ ...b, cover: null }); added++; }
    }
    for (const f of j.favorites || []) if (!this.d.favorites.some((x) => x.url === f.url)) this.d.favorites.push(f);
    for (const [h, s] of Object.entries(j.sites || {})) this.d.sites[h] = { ...s, ...(this.d.sites[h] || {}), hidden: [...new Set([...(s.hidden || []), ...((this.d.sites[h] || {}).hidden || [])])] };
    this.save();
    return { added };
  }
}

// ---------- mengenali chapter dari alamat ----------
// contoh: /manga/solo-leveling/chapter-57/  ·  /solo-leveling-chapter-57  ·  /series/abc/ep/12  ·  ?episode_no=12
const CH = /(?:^|[\/_\-\.])(?:chapter|chap|ch|episode|eps?|bab|cap[ií]tulo)[\/_\-\.\s]*(\d+(?:[.\-]\d+)?)(?=$|[\/_\-\.?#])/i;
// ---------- pola alamat yang diajarkan pengguna (per situs) ----------
// rule: { title: ["g", "*"], extra: ["#"], kind: "page"|"chapter", slash: true }
//   "*" = bagian yang berbeda tiap judul, "#" = bagian berisi nomor (halaman/chapter), kata lain = harus sama persis
let ruleLookup = () => null;
const segs = (pathname) => pathname.split("/").filter(Boolean);
const numIn = (seg) => { const m = String(seg).match(/(\d+(?:[.-]\d+)?)(?!.*\d)/); return m ? parseFloat(m[1].replace("-", ".")) : null; };
// Pelajari pola dari satu alamat halaman judul & satu alamat halaman baca
function learnRule(titleUrl, readUrl, kind) {
  let t, r; try { t = new URL(titleUrl); r = new URL(readUrl); } catch { return { error: "Alamatnya tidak valid." }; }
  if (t.hostname !== r.hostname) return { error: "Halaman judul dan halaman baca harus dari situs yang sama." };
  const T = segs(decodeURIComponent(t.pathname).toLowerCase()), R = segs(decodeURIComponent(r.pathname).toLowerCase());
  if (!T.length) return { error: "Halaman judul tidak boleh halaman depan situs." };
  if (R.length <= T.length || T.some((x, i) => R[i] !== x)) return { error: "Alamat halaman baca harus diawali alamat halaman judul (mis. /g/123/ → /g/123/1/). Untuk situs seperti ini Ruang Baca memakai cara pengenalan biasa." };
  const extra = R.slice(T.length);
  if (numIn(extra[extra.length - 1]) == null) return { error: "Di bagian akhir alamat halaman baca tidak ada nomor halaman/chapter." };
  // bagian terakhir alamat judul dan bagian yang berupa angka = pembeda judul; kata lain dianggap tetap
  const title = T.map((x, i) => (i === T.length - 1 || /\d/.test(x) ? "*" : x));
  return { rule: { title, extra: extra.map((x, i) => (i === extra.length - 1 ? "#" : /\d/.test(x) ? "*" : x)), kind: kind === "chapter" ? "chapter" : "page", slash: /\/$/.test(t.pathname) } };
}
function byRule(u, host, rule) {
  const S = segs(decodeURIComponent(u.pathname).toLowerCase());
  const n = rule.title.length;
  if (S.length !== n && S.length !== n + rule.extra.length) return null;
  const fits = (pat, val) => pat === "*" || pat === "#" || pat === val;
  if (!rule.title.every((p, i) => fits(p, S[i]))) return null;
  if (S.length > n && !rule.extra.every((p, i) => fits(p, S[n + i]))) return null;
  const vars = S.slice(0, n).filter((_, i) => rule.title[i] === "*");
  const slug = ("p-" + vars.join("-")).replace(/[^a-z0-9]+/g, "-").replace(/-$/, "");
  const raw = u.pathname.split("/").filter(Boolean).slice(0, n).join("/");
  const root = `${u.origin}/${raw}${rule.slash ? "/" : ""}`;
  if (S.length === n) return { host, slug, chapter: null, exact: true, root, learned: true };
  const num = numIn(S[S.length - 1]);
  return rule.kind === "chapter" ? { host, slug, chapter: num, exact: true, root, learned: true } : { host, slug, chapter: null, page: num, exact: true, root, learned: true };
}

function parseChapter(url) {
  let u; try { u = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.replace(/^www\./, "");
  const rule = ruleLookup(host);
  if (rule) { const r = byRule(u, host, rule); if (r) return r; }
  const pathname = decodeURIComponent(u.pathname).toLowerCase();
  // Alamat galeri berangka: /g/690628/ (halaman judul) dan /g/690628/1/ (halaman baca ke-1).
  // Satu ID = satu judul; angka sesudahnya nomor halaman, bukan chapter.
  const gm = pathname.match(/^\/([a-z]{1,12})\/(\d{3,})(?:\/(\d{1,4}))?\/?$/);
  if (gm && !/^(chapter|chap|ch|episode|eps|ep|read|reader|viewer|baca)$/.test(gm[1])) return { host, slug: `${gm[1]}-${gm[2]}`, chapter: null, page: gm[3] ? +gm[3] : null, exact: true };
  let chapter = null, slugPath = pathname;
  // nomor chapter di parameter (mis. Webtoon: ?title_no=1&episode_no=420) lebih bisa dipercaya
  const q = u.searchParams.get("episode_no") || u.searchParams.get("chapter") || u.searchParams.get("ch");
  const m = pathname.match(CH);
  if (q && /^\d+(\.\d+)?$/.test(q)) chapter = parseFloat(q);
  else if (m) { chapter = parseFloat(m[1].replace("-", ".")); slugPath = pathname.slice(0, m.index); }
  // nama seri: bagian alamat yang paling "bernama" (bukan kata umum seperti manga/komik/series)
  const COMMON = /^(manga|manhwa|manhua|komik|comic|comics|series|title|read|baca|en|id|webtoon|list|detail|episode|viewer|chapter)$/;
  const parts = slugPath.split("/").map((p) => p.replace(/[-_](chapter|ch|eps?|episode|bab)$/, "").replace(/^-+|-+$/g, "")).filter((p) => p && !COMMON.test(p) && !/^\d+$/.test(p));
  let slug = parts.length ? parts[parts.length - 1] : "";
  if (u.searchParams.get("title_no")) slug = "title-" + u.searchParams.get("title_no");
  slug = slug.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!slug) return null;
  return { host, slug, chapter };
}
// /g/690628/1/ → /g/690628/ (halaman judul galeri)
function galleryRoot(url) { try { const u = new URL(url); u.pathname = u.pathname.replace(/\/\d{1,4}\/?$/, "/"); u.search = ""; u.hash = ""; return u.href; } catch { return url; } }
function cleanTitle(t) {
  return String(t || "")
    .replace(/\s*[|–—-]\s*(chapter|ch\.?|episode|eps?\.?|bab)\s*\d+.*$/i, "")
    .replace(/\s*[|–—-]\s*(page|halaman|hal\.?)\s*\d+.*$/i, "")
    .replace(/\s+(chapter|ch\.?|episode|bab)\s*\d+.*$/i, "")
    .replace(/\s*[|–—]\s*[^|–—]{2,40}$/, "")
    .replace(/\s+-\s+[^-]*(scans?|komik\w*|manga\w*|manhwa\w*|comics?|webtoons?|\.\w{2,3})$/i, "")
    .replace(/^(baca|read)\s+(komik|manga|manhwa)?\s*/i, "")
    .trim().slice(0, 120);
}

module.exports = { Data, parseChapter, cleanTitle, DEFAULTS, learnRule };
