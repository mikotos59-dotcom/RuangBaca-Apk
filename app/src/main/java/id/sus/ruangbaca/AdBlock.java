package id.sus.ruangbaca;

import android.content.Context;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Pemblokir iklan tingkat domain. Daftar diambil dari EasyList, ABPindo (Indonesia), dan filter DNS AdGuard;
 * hanya aturan "||domain^" yang dipakai. Permintaan diblok kalau domainnya ada di daftar dan berasal dari situs lain.
 */
final class AdBlock {
    static final String[] LISTS = {
            "https://easylist.to/easylist/easylist.txt",
            "https://raw.githubusercontent.com/ABPindo/indonesianadblockrules/master/subscriptions/abpindo.txt",
            "https://adguardteam.github.io/AdGuardSDNSFilter/Filters/filter.txt",
    };
    private static final long WEEK = 7L * 24 * 3600 * 1000;
    // ||domain^ dengan opsi yang tidak membatasi ke situs tertentu
    private static final Pattern RULE = Pattern.compile("^(@@)?\\|\\|([a-z0-9][a-z0-9.-]*\\.[a-z]{2,})\\^?(?:\\$(.*))?$");
    private static final Set<String> OK_OPTS = new HashSet<>(Arrays.asList(
            "third-party", "3p", "script", "image", "popup", "subdocument", "xmlhttprequest", "media", "object", "important", "all", "ping", "other", "websocket"));
    private static final Set<String> SLD = new HashSet<>(Arrays.asList("co", "com", "net", "org", "ac", "go", "or", "web", "my", "sch", "gov", "edu", "biz", "mil", "ne"));

    private final File file, allowFile, stamp;
    private volatile Set<String> block = Collections.emptySet();
    private volatile Set<String> allow = Collections.emptySet();
    private volatile boolean updating = false;

    AdBlock(Context c) {
        File dir = new File(c.getFilesDir(), "iklan");
        dir.mkdirs();
        file = new File(dir, "blok.txt");
        allowFile = new File(dir, "izin.txt");
        stamp = new File(dir, "diperbarui.txt");
    }

    /** Muat daftar tersimpan (atau daftar bawaan), dan perbarui kalau sudah lebih dari seminggu. Jalankan di latar. */
    void load(Context c) {
        Set<String> b = readSet(file);
        if (b.isEmpty()) {
            try (InputStream in = c.getAssets().open("iklan-bawaan.txt")) { b = readLines(in); } catch (Exception ignored) { }
        }
        block = b;
        allow = readSet(allowFile);
        if (System.currentTimeMillis() - updated() > WEEK) update();
    }

    long updated() {
        try { return Long.parseLong(new String(readAll(stamp), StandardCharsets.UTF_8).trim()); } catch (Exception e) { return 0; }
    }
    int size() { return block.size(); }

    /** Unduh ulang semua daftar. Kembali true kalau berhasil. */
    synchronized boolean update() {
        if (updating) return false;
        updating = true;
        try {
            Set<String> b = new HashSet<>(), a = new HashSet<>();
            int ok = 0;
            for (String u : LISTS) {
                try { parse(u, b, a); ok++; } catch (Exception ignored) { }
            }
            if (ok == 0 || b.size() < 100) return false;
            b.removeAll(a);
            block = b;
            allow = a;
            try {
                writeSet(file, b);
                writeSet(allowFile, a);
                writeAll(stamp, String.valueOf(System.currentTimeMillis()));
            } catch (Exception ignored) { }
            return true;
        } finally { updating = false; }
    }

    private static void parse(String url, Set<String> b, Set<String> a) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setRequestProperty("User-Agent", "RuangBaca-HP");
        if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
        try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) {
                line = line.trim().toLowerCase();
                if (!line.startsWith("||") && !line.startsWith("@@||")) continue;
                Matcher m = RULE.matcher(line);
                if (!m.matches()) continue;
                String opts = m.group(3);
                if (opts != null && !optsOk(opts)) continue;
                (m.group(1) != null ? a : b).add(m.group(2));
            }
        } finally { c.disconnect(); }
    }

    private static boolean optsOk(String opts) {
        for (String o : opts.split(",")) {
            o = o.trim();
            if (o.startsWith("~") || o.contains("=")) return false; // dibatasi ke situs tertentu / pengecualian jenis
            if (!OK_OPTS.contains(o)) return false;
        }
        return true;
    }

    /** Apakah host ini (atau domain induknya) termasuk domain iklan. */
    boolean isAd(String host) {
        if (host == null || host.isEmpty()) return false;
        host = host.toLowerCase();
        Set<String> b = block, a = allow;
        String h = host;
        while (true) {
            if (a.contains(h)) return false;
            if (b.contains(h)) return true;
            int i = h.indexOf('.');
            if (i < 0 || h.indexOf('.', i + 1) < 0) return false;
            h = h.substring(i + 1);
        }
    }

    /** Domain utama (komikcast.id, contoh.co.id) untuk membedakan situs sendiri dan situs lain. */
    static String base(String host) {
        if (host == null) return "";
        String[] p = host.toLowerCase().split("\\.");
        if (p.length <= 2) return host.toLowerCase();
        int n = p[p.length - 1].length() == 2 && SLD.contains(p[p.length - 2]) ? 3 : 2;
        StringBuilder s = new StringBuilder();
        for (int i = p.length - n; i < p.length; i++) { if (s.length() > 0) s.append('.'); s.append(p[i]); }
        return s.toString();
    }

    // ---------- file ----------
    private static Set<String> readSet(File f) {
        if (!f.exists()) return new HashSet<>();
        try (InputStream in = new FileInputStream(f)) { return readLines(in); } catch (Exception e) { return new HashSet<>(); }
    }
    private static Set<String> readLines(InputStream in) throws Exception {
        Set<String> s = new HashSet<>();
        BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
        String line;
        while ((line = r.readLine()) != null) {
            line = line.trim().toLowerCase();
            if (!line.isEmpty() && !line.startsWith("#")) s.add(line);
        }
        return s;
    }
    private static void writeSet(File f, Set<String> s) throws Exception {
        File tmp = new File(f.getPath() + ".tmp");
        try (Writer w = new OutputStreamWriter(new FileOutputStream(tmp), StandardCharsets.UTF_8)) {
            for (String x : s) { w.write(x); w.write('\n'); }
        }
        if (!tmp.renameTo(f)) throw new Exception("gagal menyimpan " + f);
    }
    static byte[] readAll(File f) throws Exception {
        try (InputStream in = new FileInputStream(f)) {
            java.io.ByteArrayOutputStream o = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) o.write(buf, 0, n);
            return o.toByteArray();
        }
    }
    static void writeAll(File f, String s) throws Exception {
        try (FileOutputStream o = new FileOutputStream(f)) { o.write(s.getBytes(StandardCharsets.UTF_8)); }
    }
}
