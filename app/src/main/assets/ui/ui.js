// Tampilan Rak Buku versi HP (halaman lokal). Data dari engine.js (window.RB), aksi ke Java lewat RBUi.
"use strict";
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const { data } = RB;
  const S = () => data.settings;
  const setS = (patch) => { Object.assign(data.settings, patch); data.save(); RB.nativeState(); applyTheme(); };
  let filterText = "";

  // ---------- tema ----------
  function applyTheme() { document.documentElement.dataset.theme = S().theme || "normal"; }

  // ---------- rak ----------
  const ago = (t) => {
    if (!t) return "";
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return "baru saja";
    if (m < 60) return m + " mnt lalu";
    const h = Math.round(m / 60);
    if (h < 24) return h + " jam lalu";
    const d = Math.round(h / 24);
    return d < 30 ? d + " hari lalu" : new Date(t).toLocaleDateString("id");
  };
  const mins = (s) => { s = Math.round(s / 60); return s < 60 ? s + " menit" : Math.floor(s / 60) + " jam " + (s % 60) + " menit"; };

  function renderShelf() {
    const all = RB.shelfList();
    const q = filterText.trim().toLowerCase();
    const list = q ? all.filter((b) => (b.title + " " + b.host).toLowerCase().includes(q)) : all;
    $("#filter").hidden = all.length < 6;
    $("#empty").hidden = all.length > 0;
    $("#shelf").innerHTML = list.map((b) => `
      <div class="book" data-id="${esc(b.id)}">
        ${b.private ? '<span class="lockb">privat</span>' : ""}
        <div class="cov">${b.coverSrc ? `<img src="${esc(b.coverSrc)}" alt="" loading="lazy">` : `<div class="ph">${esc(b.title)}</div>`}
          ${b.lastChapter != null ? `<span class="ch">Ch ${esc(b.lastChapter)}</span>` : ""}</div>
        <button class="more" data-more="${esc(b.id)}" aria-label="Menu">⋮</button>
        <div class="t">${esc(b.title)}</div>
        <div class="m">${esc(b.host)}${b.lastRead ? " · " + esc(ago(b.lastRead)) : ""}</div>
      </div>`).join("");
    const t = data.today();
    $("#homeSub").textContent = all.length ? `${all.length} judul${t >= 60 ? " · hari ini " + mins(t) : ""}` : "Belum ada judul tersimpan";
    $("#eye").classList.toggle("on", RB.E.privateOpen);
  }

  const colorOf = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 45% 42%)`; };
  function renderFavs() {
    const f = RB.favList();
    $("#favs").innerHTML = f.length ? f.map((x) => `
      <div class="fav" data-url="${esc(x.url)}">
        ${x.iconData ? `<span class="ico img"><img src="${esc(x.iconData)}" alt=""></span>` : `<span class="ico" style="background:${colorOf(x.host)}">${esc((x.title || x.host).trim()[0] || "?").toUpperCase()}</span>`}
        <b>${esc(x.title)}</b><small>${esc(RB.wwwless(x.host))}</small>
        <button class="del" data-del="${esc(x.url)}" aria-label="Hapus">✕</button>
      </div>`).join("") : '<p class="hint">Simpan situs komik yang sering dibuka di sini.</p>';
    // ambil ikon yang belum ada (sekali per sesi per situs; Java yang mencegah pengulangan)
    for (const x of f) if (!x.iconData) try { RBUi.fetchIcon(x.host, x.url); } catch {}
  }
  function render() { renderShelf(); renderFavs(); }

  // ---------- menu buku ----------
  const menu = $("#bookMenu");
  function closeMenu() { menu.hidden = true; }
  function openBookMenu(id, btn) {
    const b = data.shelf().find((x) => x.id === id);
    if (!b) return;
    const priv = RB.isPrivate(b.host);
    menu.innerHTML = `
      ${b.lastUrl ? `<button data-a="go">Lanjut baca${b.lastChapter != null ? " (Ch " + esc(b.lastChapter) + ")" : ""}</button>` : ""}
      ${b.seriesUrl ? '<button data-a="series">Buka halaman judul</button>' : ""}
      <button data-a="rename">Ganti judul</button>
      <button data-a="priv">${priv ? "Keluarkan situs dari rak privat" : "Masukkan situs ke rak privat"}</button>
      <button data-a="del" class="dan">Hapus dari rak</button>`;
    menu.hidden = false;
    const r = btn.getBoundingClientRect();
    const w = menu.offsetWidth, h = menu.offsetHeight;
    menu.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + "px";
    menu.style.top = (r.bottom + h + 8 > innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4) + "px";
    menu.onclick = (e) => {
      const a = e.target.closest("button")?.dataset.a;
      if (!a) return;
      closeMenu();
      if (a === "go") RBUi.go(b.lastUrl);
      else if (a === "series") RBUi.go(b.seriesUrl);
      else if (a === "rename") renameBook(b);
      else if (a === "priv") togglePrivate(b.host, !priv);
      else if (a === "del") confirmSheet(`Hapus "${b.title}" dari rak?`, "Hapus", () => {
        if (b.cover) RBUi.deleteCover(b.cover);
        data.removeBook(b.id); RB.notify();
      });
    };
  }
  function togglePrivate(host, on) {
    const h = RB.wwwless(host);
    const list = RB.privHosts().filter((x) => x !== h);
    if (on) list.push(h);
    setS({ privateHosts: list });
    RB.notify();
    RBUi.toast(on ? `${h} masuk rak privat` : `${h} keluar dari rak privat`);
  }

  // ---------- lembar bawah ----------
  const sheet = $("#sheet"), panel = $("#panel");
  function openSheet(title, html, onclick) {
    panel.innerHTML = `<h2>${esc(title)}<button data-close aria-label="Tutup">✕</button></h2>${html}`;
    panel.onclick = (e) => { if (e.target.closest("[data-close]")) return closeSheet(); if (onclick) onclick(e); };
    panel.oninput = null; panel.onchange = null;
    sheet.hidden = false;
  }
  function closeSheet() { sheet.hidden = true; panel.innerHTML = ""; }
  sheet.addEventListener("click", (e) => { if (e.target === sheet) closeSheet(); });

  function confirmSheet(msg, okLabel, fn) {
    openSheet("Yakin?", `<p>${esc(msg)}</p><div class="btns"><button class="tb pri dan" data-ok>${esc(okLabel)}</button><button class="tb" data-close>Batal</button></div>`, (e) => {
      if (e.target.closest("[data-ok]")) { closeSheet(); fn(); }
    });
  }
  function renameBook(b) {
    openSheet("Ganti judul", `<input class="field" id="nt" value="${esc(b.title)}"><div class="btns"><button class="tb pri" data-ok>Simpan</button></div>`, (e) => {
      if (!e.target.closest("[data-ok]")) return;
      data.updateBook(b.id, { title: $("#nt").value }); closeSheet(); RB.notify();
    });
    setTimeout(() => $("#nt")?.focus(), 50);
  }
  function addFav() {
    openSheet("Tambah situs favorit", `
      <label>Alamat<input class="field" id="fu" placeholder="contoh: komikcast.id" inputmode="url" autocapitalize="off"></label>
      <label>Nama (boleh kosong)<input class="field" id="fn"></label>
      <div class="btns"><button class="tb pri" data-ok>Simpan</button></div>`, (e) => {
      if (!e.target.closest("[data-ok]")) return;
      let u = $("#fu").value.trim();
      if (!u) return;
      if (!/^https?:\/\//i.test(u)) u = "https://" + u;
      try { data.addFavorite({ url: u, title: $("#fn").value.trim() || RB.hostOf(u) }); closeSheet(); render(); }
      catch (err) { RBUi.toast(err.message); }
    });
  }

  // ---------- PIN rak privat ----------
  function askPin(then) {
    openSheet("Rak privat", `<div class="pinbox"><input class="field" id="pin" type="password" inputmode="text" placeholder="PIN" autocomplete="off">
      <p class="pinhint" id="ph"></p><button class="tb pri" data-ok>Buka</button>
      <p class="stat">PIN awal: <b>A123</b>. Ganti di Pengaturan. PIN HP terpisah dari PC dan tidak ikut ekspor.</p></div>`, async (e) => {
      if (!e.target.closest("[data-ok]")) return;
      if (await RB.pinOk($("#pin").value)) { closeSheet(); then(); } else $("#ph").textContent = "PIN salah.";
    });
    $("#pin").onkeydown = (e) => { if (e.key === "Enter") panel.querySelector("[data-ok]").click(); };
    setTimeout(() => $("#pin")?.focus(), 50);
  }

  // ---------- pengaturan ----------
  const sw = (k, on) => `<button class="sw${on ? " on" : ""}" data-sw="${k}" aria-pressed="${!!on}"></button>`;
  const seg = (k, val, opts) => `<div class="seg" data-seg="${k}">${opts.map(([v, l]) => `<button data-v="${esc(v)}" class="${String(val) === String(v) ? "sel" : ""}">${esc(l)}</button>`).join("")}</div>`;
  const row = (title, note, ctl) => `<div class="row"><div class="lab">${esc(title)}${note ? `<small>${esc(note)}</small>` : ""}</div>${ctl}</div>`;
  const rowS = (title, note, ctl) => `<div class="row stack"><div class="lab">${esc(title)}${note ? `<small>${esc(note)}</small>` : ""}</div>${ctl}</div>`;
  const range = (k, v, min, max, unit) => `<input type="range" data-r="${k}" min="${min}" max="${max}" value="${v}"><span class="val" id="v-${k}">${v}${unit || ""}</span>`;

  function adText() {
    let a = {};
    try { a = JSON.parse(RBUi.adStatus() || "{}"); } catch {}
    return a.rules ? `${a.rules.toLocaleString("id")} domain iklan${a.updated ? " · diperbarui " + ago(a.updated) : " · daftar bawaan"}` : "Daftar iklan belum dimuat.";
  }

  function openSettings() {
    const s = S();
    openSheet("Pengaturan", `
      <h4>Tampilan</h4>
      ${rowS("Tema aplikasi", "", seg("theme", s.theme, [["normal", "Kertas"], ["dark", "Gelap"], ["neon", "Neon gelap"], ["neonlight", "Neon putih"]]))}
      ${row("Mode gelap situs", "Bawaan untuk situs baru", sw("dark", s.dark))}
      ${row("Hitam putih", "Bawaan untuk situs baru", sw("gray", s.gray))}
      ${row("Warna kertas", "", seg("paper", s.paper, [["putih", "Putih"], ["krem", "Krem"], ["abu", "Abu"]]))}
      ${row("Kontras", "", range("contrast", s.contrast, 80, 160, "%"))}
      <h4>Membaca</h4>
      ${row("Kecepatan gulir otomatis", "", range("speed", s.speed, 1, 100))}
      ${row("Area ketuk mode per halaman", "Lebar area kiri/kanan untuk pindah halaman", range("pageZone", s.pageZone, 5, 45, "%"))}
      <h4>Iklan & pop-up</h4>
      ${row("Blok iklan", "Memblok domain iklan dari pihak ketiga", sw("adblock", s.adblock))}
      <p class="stat" id="adst">${esc(adText())}</p>
      <div class="btns"><button class="tb" data-act="adUpdate">Perbarui daftar iklan</button></div>
      ${row("Singkirkan pop-up Pro/koin", "", sw("popup", s.popup))}
      ${row("Label pop-up yang disingkirkan", "", seg("label", s.label, [["5", "5 detik"], ["tetap", "Tetap"], ["sembunyi", "Sembunyi"]]))}
      ${s.allowAds && s.allowAds.length ? `<p class="stat">Iklan diizinkan di: ${s.allowAds.map(esc).join(", ")}</p><div class="btns"><button class="tb" data-act="clearAllow">Blok lagi di semua situs</button></div>` : ""}
      <h4>DNS (opsional)</h4>
      <p class="stat">Situs yang tidak bisa dibuka karena diblokir lewat DNS penyedia internet biasanya bisa terbuka dengan DNS lain. Hanya berlaku di Ruang Baca, setelan HP tidak diubah. Lewat jalur terenkripsi (DNS-over-TLS / DNS-over-HTTPS).</p>
      <label>Server DNS<select class="field" data-sel="dns">${[["bawaan", "Bawaan (penyedia internet)"], ["cloudflare", "Cloudflare · 1.1.1.1 (disarankan)"], ["google", "Google · 8.8.8.8"], ["quad9", "Quad9 · 9.9.9.9 (blok situs berbahaya)"], ["adguard", "AdGuard (ikut blok iklan)"], ["kustom", "Alamat sendiri…"]].map(([v, l]) => `<option value="${v}" ${(s.dns || "bawaan") === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
      <div id="dnsK" ${s.dns === "kustom" ? "" : "hidden"}><label>Alamat DoH<input class="field" id="dnsC" placeholder="https://dns.contoh.id/dns-query" value="${esc(s.dnsCustom || "")}" spellcheck="false" autocapitalize="off"></label><div class="btns"><button class="tb" data-act="dnsSave">Pakai</button></div></div>
      <p class="stat" id="dnsSt"></p>
      <div class="btns"><button class="tb" data-act="dnsTest">Tes DNS</button></div>
      <h4>Pencarian</h4>
      ${rowS("Mesin pencari", "Startpage: hasil Google tanpa melacak kamu", seg("search", s.search, [["startpage", "Startpage"], ["google", "Google"], ["duckduckgo", "DuckDuckGo"], ["bing", "Bing"]]))}
      <h4>Rak privat</h4>
      <p class="stat">${RB.privHosts().length ? "Situs privat: " + RB.privHosts().map(esc).join(", ") : "Belum ada situs privat. Pakai menu ⋮ pada buku untuk memasukkan situsnya."}</p>
      <label>PIN baru<input class="field" id="np" type="password" autocomplete="off" placeholder="minimal 4 karakter"></label>
      <div class="btns"><button class="tb" data-act="pin">Ganti PIN</button></div>
      <h4>Pindah data PC ↔ HP</h4>
      <p class="stat">Ekspor membuat file .json berisi rak, favorit, dan pengaturan situs. File dari Ruang Baca PC (Pengaturan → Ekspor) bisa diimpor di sini, dan sebaliknya. Sampul tidak ikut di file, tapi diambil ulang otomatis dari situsnya setelah impor. PIN tidak ikut.</p>
      <div class="btns"><button class="tb pri" data-act="export">Ekspor…</button><button class="tb" data-act="import">Impor…</button></div>
      <h4>Pembaruan</h4>
      ${row("Cek pembaruan otomatis", "Saat aplikasi dibuka, paling sering 12 jam sekali", sw("autoUpdate", s.autoUpdate !== false))}
      <div id="updSt">${updHtml(true)}</div>
      <h4>Lainnya</h4>
      <div class="btns"><button class="tb dan" data-act="clear">Hapus riwayat & cookie situs</button></div>
      <p class="stat">Ruang Baca HP ${esc(RBUi.version())} · @SuS_X_x</p>`, async (e) => {
      const t = e.target;
      const swb = t.closest("[data-sw]");
      if (swb) { const k = swb.dataset.sw; const v = !S()[k]; setS({ [k]: v }); swb.classList.toggle("on", v); swb.setAttribute("aria-pressed", v); return; }
      const sg = t.closest("[data-seg] button");
      if (sg) {
        const box = sg.parentElement; let v = sg.dataset.v;
        setS({ [box.dataset.seg]: v });
        box.querySelectorAll("button").forEach((b) => b.classList.toggle("sel", b === sg));
        return;
      }
      const act = t.closest("[data-act]")?.dataset.act;
      if (act === "updCheck") { updState = { checking: true }; renderUpd(); RBUi.updateCheck(); return; }
      if (act === "updInstall") { RBUi.updateInstall(); return; }
      if (act === "updPage") { RBUi.updatePage(); return; }
      if (act === "dnsTest") { $("#dnsSt").textContent = "Mengetes…"; RBUi.dnsTest(); return; }
      if (act === "dnsSave") {
        const u = $("#dnsC").value.trim();
        if (u && !/^https:\/\/[^\s/]+\.[^\s]+$/.test(u)) return RBUi.toast("Alamat DNS harus alamat DoH, misalnya https://dns.contoh.id/dns-query");
        setS({ dnsCustom: u }); RBUi.toast(u ? "DNS diterapkan." : "Alamat DNS dikosongkan.");
        return;
      }
      if (act === "adUpdate") { RBUi.adUpdate(); $("#adst").textContent = "Memperbarui…"; }
      else if (act === "clearAllow") { setS({ allowAds: [] }); openSettings(); }
      else if (act === "pin") {
        const p = $("#np").value;
        if (p.length < 4) return RBUi.toast("PIN minimal 4 karakter.");
        await RB.setPin(p); $("#np").value = ""; RBUi.toast("PIN rak privat diganti.");
      }
      else if (act === "export") { data.flush(); RBUi.exportFile(`ruangbaca-${new Date().toLocaleDateString("sv")}.json`, JSON.stringify(data.exportJson(), null, 1)); }
      else if (act === "import") RBUi.importFile();
      else if (act === "clear") confirmSheet("Hapus riwayat, cookie, dan cache semua situs? Kamu akan keluar dari akun situs. Rak buku tidak terhapus.", "Hapus", () => RBUi.clearData());
    });
    panel.oninput = (e) => {
      const r = e.target.closest("[data-r]");
      if (!r) return;
      const k = r.dataset.r, v = +r.value;
      $("#v-" + k).textContent = v + (k === "contrast" || k === "pageZone" ? "%" : "");
      data.settings[k] = v; data.save();
    };
    panel.onchange = (e) => {
      if (e.target.closest("[data-r]")) RB.nativeState();
      const sel = e.target.closest("[data-sel]");
      if (sel) {
        const v = sel.value;
        $("#dnsK").hidden = v !== "kustom";
        setS({ [sel.dataset.sel]: v });
        RBUi.toast(v === "bawaan" ? "DNS kembali ke bawaan." : v === "kustom" ? "Isi alamat DNS lalu tekan Pakai." : "DNS diterapkan.");
      }
    };
  }

  // ---------- pembaruan (rilis GitHub RuangBaca-Apk) ----------
  let updState = null;
  const mb = (n) => (n / 1048576).toFixed(1).replace(".", ",") + " MB";
  function updHtml(inSettings) {
    const u = updState;
    if (!u) return inSettings ? `<p class="stat">Versi terpasang ${esc(RBUi.version())}.</p><div class="btns"><button class="tb" data-act="updCheck">Cek pembaruan</button></div>` : "";
    if (u.checking) return `<p class="stat">Memeriksa versi terbaru…</p>`;
    if (u.error) return inSettings ? `<p class="stat">Gagal memeriksa: ${esc(u.error)}</p><div class="btns"><button class="tb" data-act="updCheck">Coba lagi</button></div>` : "";
    if (!u.newer) return inSettings ? `<p class="stat">Sudah versi terbaru (${esc(u.current)}). Rilis tertinggi di GitHub: <b>${esc(u.latest)}</b>${u.tag ? ` (tag ${esc(u.tag)})` : ""}${u.pre ? ", pra-rilis" : ""}.</p><div class="btns"><button class="tb" data-act="updCheck">Cek lagi</button><button class="tb" data-act="updPage">Lihat di GitHub</button></div>` : "";
    const p = u.progress;
    const bar = p ? (p.ready ? `<p class="stat">Unduhan selesai. Ikuti layar pemasangan Android. Kalau Google Play Protect menawarkan pindai, pilih <b>Pindai aplikasi</b> atau <b>Instal tanpa memindai</b>. Kalau terlanjur dibatalkan, tekan <b>Pasang sekarang</b> (tidak perlu unduh ulang).</p><div class="btns"><button class="tb pri" data-act="updInstall">Pasang sekarang</button></div>` : `<div class="ubar"><i style="width:${p.total ? Math.round((p.done / p.total) * 100) : 5}%"></i></div><p class="stat">Mengunduh ${mb(p.done)}${p.total ? " / " + mb(p.total) : ""}…</p>`) : "";
    const notes = inSettings && u.notes ? `<div class="unotes">${mdLite(u.notes)}</div>` : "";
    return `<p class="stat"><b>Versi baru ${esc(u.latest)} tersedia</b> (terpasang ${esc(u.current)}).</p>${notes}${bar}
      ${p ? "" : `<div class="btns"><button class="tb pri" data-act="updInstall">${u.asset ? `Perbarui${u.asset.size ? " · " + mb(u.asset.size) : ""}` : "Buka halaman rilis"}</button>${inSettings ? `<button class="tb" data-act="updPage">Lihat di GitHub</button>` : `<button class="tb" data-act="updLater">Nanti</button>`}</div>`}`;
  }
  // catatan rilis GitHub (Markdown sederhana): judul, poin, tebal, kode
  function mdLite(t) {
    return esc(t).split(/\r?\n/).map((l) => {
      let x = l.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>");
      if (/^#{1,6}\s/.test(l)) return `<b class="uh">${x.replace(/^#{1,6}\s+/, "")}</b>`;
      if (/^\s*[-*]\s/.test(l)) return `<span class="ul">• ${x.replace(/^\s*[-*]\s+/, "")}</span>`;
      return x.trim() ? `<span>${x}</span>` : "";
    }).filter(Boolean).join("<br>");
  }
  function renderUpd() {
    const st = $("#updSt"); if (st) st.innerHTML = updHtml(true);
    const b = $("#updBar"), h = updHtml(false);
    b.hidden = !h || updState?.dismissed; b.innerHTML = h;
  }
  $("#updBar").addEventListener("click", (e) => {
    const a = e.target.closest("[data-act]")?.dataset.act;
    if (a === "updInstall") RBUi.updateInstall();
    if (a === "updLater") { updState.dismissed = true; renderUpd(); }
  });
  if (S().autoUpdate !== false && Date.now() - (+S().updAt || 0) > 12 * 3600e3) { data.settings.updAt = Date.now(); data.save(); setTimeout(() => { try { RBUi.updateCheck(); } catch {} }, 2500); }

  // buku tanpa sampul (mis. hasil impor dari PC): coba ambil sampulnya di belakang layar
  setTimeout(() => { try { RBEngine.refetchCovers(); } catch {} }, 4000);

  // dipanggil Java
  window.RBHome = {
    settings: openSettings,
    adDone() { const el = $("#adst"); if (el) el.textContent = adText(); },
    back() {
      if (!menu.hidden) { closeMenu(); return true; }
      if (!sheet.hidden) { closeSheet(); return true; }
      return false;
    },
    refresh: render,
    dnsSt(t) { const el = $("#dnsSt"); if (el) el.textContent = t; },
    upd(j) { try { const o = JSON.parse(j); const dis = updState && updState.dismissed && !o.progress; updState = o; if (dis) o.dismissed = true; renderUpd(); } catch {} },
  };

  // ---------- event ----------
  $("#shelf").addEventListener("click", (e) => {
    const more = e.target.closest("[data-more]");
    if (more) { e.stopPropagation(); return openBookMenu(more.dataset.more, more); }
    const card = e.target.closest(".book");
    if (!card) return;
    const b = data.shelf().find((x) => x.id === card.dataset.id);
    if (b) RBUi.go(b.lastUrl || b.seriesUrl);
  });
  $("#shelf").addEventListener("contextmenu", (e) => {
    const card = e.target.closest(".book");
    if (card) { e.preventDefault(); openBookMenu(card.dataset.id, card.querySelector(".more")); }
  });
  $("#favs").addEventListener("click", (e) => {
    const del = e.target.closest("[data-del]");
    if (del) { data.removeFavorite(del.dataset.del); renderFavs(); return; }
    const f = e.target.closest(".fav");
    if (f) RBUi.go(f.dataset.url);
  });
  $("#favAdd").onclick = addFav;
  $("#filter").oninput = (e) => { filterText = e.target.value; renderShelf(); };
  $("#eye").onclick = () => {
    if (RB.E.privateOpen) { RB.E.privateOpen = false; render(); return; }
    askPin(() => { RB.E.privateOpen = true; render(); });
  };
  document.addEventListener("click", (e) => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); }, true);

  try { $("#ver").textContent = RBUi.version(); } catch {}
  applyTheme();
  RB.onChange(render);
  render();
})();
