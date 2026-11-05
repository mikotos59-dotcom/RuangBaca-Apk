package id.sus.ruangbaca;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Pembaruan dari rilis GitHub: cek versi terbaru, unduh .apk lewat pengelola unduhan Android, lalu buka pemasang.
 * APK baru harus ditandatangani dengan kunci yang sama (Pabrik SuS) supaya bisa dipasang menimpa versi lama.
 */
final class Pembaruan {
    static final String REPO = "mikotos59-dotcom/RuangBaca-Apk";
    interface Progress { void on(JSONObject p); }

    private final Activity a;
    private JSONObject last;
    private volatile long downloading = -1;
    private static final String PREF = "pembaruan";

    Pembaruan(Activity a) { this.a = a; }

    String current() {
        try { return a.getPackageManager().getPackageInfo(a.getPackageName(), 0).versionName; } catch (Exception e) { return "0"; }
    }

    static int[] ver(String v) {
        String s = v == null ? "" : v.replaceFirst("^[^\\d]*", "");
        String[] p = s.split("[.\\-+]");
        int[] o = new int[3];
        for (int i = 0; i < 3 && i < p.length; i++) { try { o[i] = Integer.parseInt(p[i].replaceAll("\\D.*", "")); } catch (Exception ignored) { } }
        return o;
    }
    static boolean newer(String a, String b) {
        int[] x = ver(a), y = ver(b);
        for (int i = 0; i < 3; i++) if (x[i] != y[i]) return x[i] > y[i];
        return false;
    }

    /** Nomor versi pertama yang ada di teks, mis. "RuangBaca-HP-v0.2.3.apk" → "0.2.3". */
    static String findVer(String t) {
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("(\\d+\\.\\d+(?:\\.\\d+)?)").matcher(t == null ? "" : t);
        return m.find() ? m.group(1) : "";
    }

    /**
     * Dijalankan di utas latar. Semua rilis diperiksa (bukan hanya yang ditandai "Latest"), termasuk pra-rilis.
     * Versi dibaca dari nama file .apk (paling dipercaya), kalau tidak ada dari tag, lalu judul rilis.
     */
    JSONObject check() throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL("https://api.github.com/repos/" + REPO + "/releases?per_page=30").openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(20000);
        c.setUseCaches(false);
        c.setRequestProperty("User-Agent", "RuangBaca-HP");
        c.setRequestProperty("Accept", "application/vnd.github+json");
        c.setRequestProperty("Cache-Control", "no-cache");
        int code = c.getResponseCode();
        if (code == 404) throw new Exception("Repo " + REPO + " tidak ditemukan atau bukan publik.");
        if (code == 403) throw new Exception("Batas pengecekan GitHub tercapai. Coba lagi sejam lagi.");
        if (code != 200) throw new Exception("GitHub menjawab " + code + ". Coba lagi nanti.");
        String body;
        try (InputStream in = c.getInputStream()) { body = new String(DnsAman.readAll(in, 8 << 20), StandardCharsets.UTF_8); }
        finally { c.disconnect(); }
        JSONArray list = new JSONArray(body);
        JSONObject best = null, bestAsset = null;
        String bestVer = "";
        for (int k = 0; k < list.length(); k++) {
            JSONObject j = list.optJSONObject(k);
            if (j == null || j.optBoolean("draft")) continue;
            JSONObject asset = null;
            String v = findVer(j.optString("tag_name"));
            if (v.isEmpty()) v = findVer(j.optString("name"));
            JSONArray as = j.optJSONArray("assets");
            for (int i = 0; as != null && i < as.length(); i++) {
                JSONObject x = as.optJSONObject(i);
                if (x != null && x.optString("name").toLowerCase().endsWith(".apk")) {
                    asset = new JSONObject().put("name", x.optString("name")).put("url", x.optString("browser_download_url")).put("size", x.optLong("size"));
                    // nomor di nama file APK = versi aplikasi sebenarnya (tag rilis bisa punya penomoran sendiri, mis. v0.1.5)
                    String av = findVer(x.optString("name"));
                    if (!av.isEmpty()) v = av;
                    break;
                }
            }
            if (v.isEmpty()) continue;
            if (best == null || newer(v, bestVer)) { best = j; bestVer = v; bestAsset = asset; }
        }
        if (best == null) throw new Exception("Belum ada rilis bernomor versi di GitHub.");
        String notes = best.optString("body", "");
        if (notes.length() > 6000) notes = notes.substring(0, 6000);
        JSONObject o = new JSONObject();
        o.put("current", current()); o.put("latest", bestVer); o.put("newer", newer(bestVer, current()));
        o.put("tag", best.optString("tag_name")); o.put("pre", best.optBoolean("prerelease")); o.put("count", list.length());
        o.put("page", best.optString("html_url", "https://github.com/" + REPO + "/releases"));
        o.put("notes", notes); o.put("asset", bestAsset == null ? JSONObject.NULL : bestAsset); o.put("at", System.currentTimeMillis());
        last = o;
        return o;
    }

    /** "page" = dibuka di browser, "izin" = perlu izin pasang aplikasi, "unduh" = mulai mengunduh. Dijalankan di utas utama. */
    String install(Progress cb) throws Exception {
        JSONObject u = last;
        if (u == null || !u.optBoolean("newer")) throw new Exception("Cek pembaruan dulu.");
        JSONObject asset = u.optJSONObject("asset");
        if (asset == null || !asset.optString("url").startsWith("https://github.com/")) { openPage(); return "page"; }
        if (Build.VERSION.SDK_INT >= 26 && !a.getPackageManager().canRequestPackageInstalls()) {
            a.startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + a.getPackageName())));
            return "izin";
        }
        if (downloading >= 0) throw new Exception("Pembaruan sedang diunduh.");
        DownloadManager dm = (DownloadManager) a.getSystemService(Context.DOWNLOAD_SERVICE);
        // sudah pernah diunduh sampai selesai (mis. pemasangan tadi dibatalkan): langsung pasang, tidak unduh ulang
        Uri done = finished(dm, asset.optString("name"), asset.optLong("size"));
        if (done != null) {
            cb.on(new JSONObject(u.toString()).put("progress", new JSONObject().put("done", 1).put("total", 1).put("ready", true)));
            openInstaller(done);
            return "pasang";
        }
        String name = asset.optString("name").replaceAll("[^\\w.\\-]", "_");
        File old = new File(a.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), name);
        if (old.exists()) old.delete();
        DownloadManager.Request r = new DownloadManager.Request(Uri.parse(asset.optString("url")));
        r.setTitle("Ruang Baca " + u.optString("latest"));
        r.setMimeType("application/vnd.android.package-archive");
        r.setDestinationInExternalFilesDir(a, Environment.DIRECTORY_DOWNLOADS, name);
        r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE);
        long id = dm.enqueue(r);
        downloading = id;
        a.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().putLong("id", id).putString("name", asset.optString("name")).apply();
        new Thread(() -> watch(dm, id, u, cb)).start();
        return "unduh";
    }

    private void watch(DownloadManager dm, long id, JSONObject u, Progress cb) {
        try {
            while (true) {
                Thread.sleep(500);
                int status; long done, total;
                try (Cursor c = dm.query(new DownloadManager.Query().setFilterById(id))) {
                    if (c == null || !c.moveToFirst()) throw new Exception("Unduhan dibatalkan.");
                    status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                    done = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                    total = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                }
                JSONObject p = new JSONObject(u.toString());
                if (status == DownloadManager.STATUS_FAILED) throw new Exception("Unduhan gagal. Coba lagi.");
                if (status == DownloadManager.STATUS_SUCCESSFUL) {
                    p.put("progress", new JSONObject().put("done", done).put("total", done).put("ready", true));
                    cb.on(p);
                    Uri apk = dm.getUriForDownloadedFile(id);
                    openInstaller(apk);
                    return;
                }
                p.put("progress", new JSONObject().put("done", done).put("total", Math.max(total, 0)));
                cb.on(p);
            }
        } catch (Exception e) {
            try { cb.on(new JSONObject(u.toString()).put("error", e.getMessage())); } catch (Exception ignored) { }
        } finally { downloading = -1; }
    }

    /** Unduhan yang sudah selesai untuk file ini (atau null). */
    private Uri finished(DownloadManager dm, String name, long size) {
        android.content.SharedPreferences sp = a.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        long id = sp.getLong("id", -1);
        if (id < 0 || !name.equals(sp.getString("name", ""))) return null;
        try (Cursor c = dm.query(new DownloadManager.Query().setFilterById(id))) {
            if (c == null || !c.moveToFirst()) return null;
            if (c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)) != DownloadManager.STATUS_SUCCESSFUL) return null;
            long got = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
            if (size > 0 && got != size) return null;
            return dm.getUriForDownloadedFile(id);
        } catch (Exception e) { return null; }
    }

    private void openInstaller(Uri apk) {
        a.runOnUiThread(() -> {
            try {
                Intent i = new Intent(Intent.ACTION_VIEW).setDataAndType(apk, "application/vnd.android.package-archive")
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                a.startActivity(i);
            } catch (Exception e) { openPage(); }
        });
    }

    void openPage() {
        String page = last != null ? last.optString("page") : "https://github.com/" + REPO + "/releases";
        try { a.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(page)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) { }
    }
}
