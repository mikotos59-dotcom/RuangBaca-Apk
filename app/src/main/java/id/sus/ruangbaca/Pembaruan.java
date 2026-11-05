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

    /** Dijalankan di utas latar. */
    JSONObject check() throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL("https://api.github.com/repos/" + REPO + "/releases/latest").openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(20000);
        c.setRequestProperty("User-Agent", "RuangBaca-HP");
        c.setRequestProperty("Accept", "application/vnd.github+json");
        int code = c.getResponseCode();
        if (code == 404) throw new Exception("Belum ada rilis di GitHub.");
        if (code != 200) throw new Exception("GitHub menjawab " + code + ". Coba lagi nanti.");
        String body;
        try (InputStream in = c.getInputStream()) { body = new String(DnsAman.readAll(in, 4 << 20), StandardCharsets.UTF_8); }
        finally { c.disconnect(); }
        JSONObject j = new JSONObject(body);
        JSONObject asset = null;
        JSONArray as = j.optJSONArray("assets");
        for (int i = 0; as != null && i < as.length(); i++) {
            JSONObject x = as.optJSONObject(i);
            if (x != null && x.optString("name").toLowerCase().endsWith(".apk")) {
                asset = new JSONObject().put("name", x.optString("name")).put("url", x.optString("browser_download_url")).put("size", x.optLong("size"));
                break;
            }
        }
        String latest = j.optString("tag_name", j.optString("name", "")).replaceFirst("^[vV]", "");
        String notes = j.optString("body", "");
        if (notes.length() > 6000) notes = notes.substring(0, 6000);
        JSONObject o = new JSONObject();
        o.put("current", current()); o.put("latest", latest); o.put("newer", !latest.isEmpty() && newer(latest, current()));
        o.put("page", j.optString("html_url", "https://github.com/" + REPO + "/releases"));
        o.put("notes", notes); o.put("asset", asset == null ? JSONObject.NULL : asset); o.put("at", System.currentTimeMillis());
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
                    a.runOnUiThread(() -> {
                        try {
                            Intent i = new Intent(Intent.ACTION_VIEW).setDataAndType(apk, "application/vnd.android.package-archive")
                                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                            a.startActivity(i);
                        } catch (Exception e) { openPage(); }
                    });
                    return;
                }
                p.put("progress", new JSONObject().put("done", done).put("total", Math.max(total, 0)));
                cb.on(p);
            }
        } catch (Exception e) {
            try { cb.on(new JSONObject(u.toString()).put("error", e.getMessage())); } catch (Exception ignored) { }
        } finally { downloading = -1; }
    }

    void openPage() {
        String page = last != null ? last.optString("page") : "https://github.com/" + REPO + "/releases";
        try { a.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(page)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) { }
    }
}
