package id.sus.ruangbaca;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import javax.net.ssl.SNIHostName;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;
import java.util.Collections;
import java.util.concurrent.Executors;

/**
 * DNS aman khusus Ruang Baca (setelan HP tidak diubah).
 * WebView diarahkan ke proksi kecil di 127.0.0.1. Proksi ini hanya mencari alamat situs lewat
 * DNS-over-HTTPS lalu meneruskan sambungan apa adanya: HTTPS tetap terenkripsi ujung ke ujung
 * (proksi tidak bisa membaca isinya).
 */
final class DnsAman {
    private static final class Entry { final InetAddress[] a; final long until; Entry(InetAddress[] a, long until) { this.a = a; this.until = until; } }

    private final ConcurrentHashMap<String, Entry> cache = new ConcurrentHashMap<>();
    private final ExecutorService pool = Executors.newCachedThreadPool();
    /** Satu jalur DNS: DoH (url) atau DNS-over-TLS (ip + nama sertifikat, port 853, sama seperti "DNS pribadi" Android). */
    static final class Jalur {
        final String doh, ip, sni;
        Jalur(String doh, String ip, String sni) { this.doh = doh; this.ip = ip; this.sni = sni; }
        String label() { return doh != null ? "DoH " + doh.replaceFirst("^https://", "").replaceFirst("/.*$", "") : "DoT " + ip; }
    }
    private volatile List<Jalur> jalur = Collections.emptyList();
    private volatile int good = 0;               // jalur yang terakhir berhasil (dicoba duluan)
    private volatile String status = "";          // untuk ditampilkan di Pengaturan
    private volatile String doh = "";
    private ServerSocket server;
    private final String userAgent;

    DnsAman(String userAgent) { this.userAgent = userAgent; }

    /** Alamat DoH untuk pilihan bawaan. Memakai alamat IP supaya tidak bergantung DNS penyedia internet. */
    static String urlFor(String key, String custom) {
        switch (key == null ? "" : key) {
            case "cloudflare": return "https://1.1.1.1/dns-query";
            case "google": return "https://8.8.8.8/dns-query";
            case "quad9": return "https://9.9.9.9/dns-query";
            case "adguard": return "https://dns.adguard-dns.com/dns-query";
            case "kustom": return custom != null && custom.matches("^https://[^\\s/]+\\.[^\\s]+$") ? custom : "";
            default: return "";
        }
    }

    void setServer(String url) { setServer(url, null); }
    /** key = pilihan di Pengaturan (cloudflare/google/…); url = alamat DoH utama. */
    void setServer(String url, String key) {
        String id = url + "|" + key;
        if (id.equals(doh)) return;
        doh = id; cache.clear(); good = 0; status = "";
        List<Jalur> l = new ArrayList<>();
        switch (key == null ? "" : key) {
            case "cloudflare":
                l.add(new Jalur(null, "1.1.1.1", "one.one.one.one")); l.add(new Jalur("https://1.1.1.1/dns-query", null, null));
                l.add(new Jalur(null, "1.0.0.1", "one.one.one.one")); l.add(new Jalur("https://1.0.0.1/dns-query", null, null)); break;
            case "google":
                l.add(new Jalur(null, "8.8.8.8", "dns.google")); l.add(new Jalur("https://8.8.8.8/dns-query", null, null));
                l.add(new Jalur(null, "8.8.4.4", "dns.google")); l.add(new Jalur("https://8.8.4.4/dns-query", null, null)); break;
            case "quad9":
                l.add(new Jalur(null, "9.9.9.9", "dns.quad9.net")); l.add(new Jalur("https://9.9.9.9/dns-query", null, null));
                l.add(new Jalur(null, "149.112.112.112", "dns.quad9.net")); break;
            case "adguard":
                l.add(new Jalur(null, "94.140.14.14", "dns.adguard-dns.com")); l.add(new Jalur("https://dns.adguard-dns.com/dns-query", null, null));
                l.add(new Jalur(null, "94.140.15.15", "dns.adguard-dns.com")); break;
            default:
                if (!url.isEmpty()) l.add(new Jalur(url, null, null));
        }
        jalur = l;
    }
    String status() { return status; }
    /** Tes cepat untuk Pengaturan. */
    String test() {
        long t0 = System.currentTimeMillis();
        cache.remove("cloudflare.com");
        try { InetAddress[] a = resolve("cloudflare.com"); return status + " · " + (System.currentTimeMillis() - t0) + " ms" + (a.length > 0 ? "" : ""); }
        catch (Exception e) { return "Gagal: " + e.getMessage(); }
    }

    /** Jalankan proksi (sekali), kembalikan nomor port-nya. */
    synchronized int start() throws Exception {
        if (server != null && !server.isClosed()) return server.getLocalPort();
        server = new ServerSocket(0, 64, InetAddress.getByName("127.0.0.1"));
        final ServerSocket s = server;
        Thread t = new Thread(() -> {
            while (!s.isClosed()) {
                try { Socket c = s.accept(); pool.execute(() -> handle(c)); } catch (Exception e) { if (s.isClosed()) break; }
            }
        }, "rb-dns");
        t.setDaemon(true);
        t.start();
        return server.getLocalPort();
    }
    int port() { return server == null ? 0 : server.getLocalPort(); }

    // ---------------- DNS-over-HTTPS ----------------
    InetAddress[] resolve(String host) throws Exception {
        host = host.toLowerCase(Locale.ROOT);
        if (host.startsWith("[") && host.endsWith("]")) host = host.substring(1, host.length() - 1);
        if (host.matches("^[0-9.]+$") || host.contains(":") || host.equals("localhost")) return InetAddress.getAllByName(host);
        Entry e = cache.get(host);
        if (e != null && e.until > System.currentTimeMillis()) return e.a;
        List<Jalur> l = jalur;
        if (l.isEmpty()) return InetAddress.getAllByName(host);
        List<InetAddress> out = new ArrayList<>();
        long ttl = 300;
        boolean answered = false, anyOk = false;
        Exception last = null;
        for (int type : new int[]{1, 28}) { // A lalu AAAA
            // coba jalur yang terakhir berhasil dulu, lalu sisanya
            for (int k = 0; k < l.size() && !answered; k++) {
                int i = (good + k) % l.size();
                Jalur j = l.get(i);
                try { ttl = Math.min(ttl, j.doh != null ? query(j.doh, host, type, out) : queryTls(j, host, type, out)); answered = true; good = i; status = "Aktif lewat " + j.label(); }
                catch (Exception ex) { last = ex; }
            }
            if (!answered) break;
            anyOk = true;
            if (type == 1 && !out.isEmpty()) break; // IPv4 cukup
            answered = false;
        }
        if (out.isEmpty()) {
            if (!anyOk && last != null) {
                status = "Server DNS tidak bisa dihubungi (" + last.getMessage() + "), sementara memakai DNS bawaan";
                return InetAddress.getAllByName(host); // semua jalur gagal: jangan sampai internet mati total
            }
            throw new java.net.UnknownHostException(host);
        }
        InetAddress[] a = out.toArray(new InetAddress[0]);
        cache.put(host, new Entry(a, System.currentTimeMillis() + Math.max(30, Math.min(ttl, 3600)) * 1000));
        return a;
    }

    private static byte[] question(String host, int type) throws Exception {
        ByteArrayOutputStream q = new ByteArrayOutputStream();
        q.write(new byte[]{0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0});
        for (String label : host.split("\\.")) {
            byte[] b = label.getBytes(StandardCharsets.US_ASCII);
            if (b.length == 0 || b.length > 63) throw new Exception("nama salah");
            q.write(b.length); q.write(b);
        }
        q.write(0); q.write(type >> 8); q.write(type & 255); q.write(0); q.write(1);
        return q.toByteArray();
    }

    /** DNS-over-TLS (port 853), jalur yang sama dengan "DNS pribadi" Android. */
    private long queryTls(Jalur j, String host, int type, List<InetAddress> out) throws Exception {
        byte[] body = question(host, type);
        Socket s = new Socket(); // sambungan TCP biasa, TLS dipasang di atasnya (dengan nama sertifikat/SNI)
        try {
            s.connect(new InetSocketAddress(InetAddress.getByName(j.ip), 853), 5000);
            s.setSoTimeout(6000);
            SSLSocket t = (SSLSocket) ((SSLSocketFactory) SSLSocketFactory.getDefault()).createSocket(s, j.sni, 853, true);
            SSLParameters p = t.getSSLParameters();
            p.setServerNames(Collections.singletonList(new SNIHostName(j.sni)));
            p.setEndpointIdentificationAlgorithm("HTTPS"); // sertifikat harus atas nama server DNS itu
            t.setSSLParameters(p);
            t.startHandshake();
            OutputStream o = t.getOutputStream();
            byte[] msg = new byte[body.length + 2];
            msg[0] = (byte) (body.length >> 8); msg[1] = (byte) body.length;
            System.arraycopy(body, 0, msg, 2, body.length);
            o.write(msg); o.flush();
            InputStream in = t.getInputStream();
            int a = in.read(), b = in.read();
            if (a < 0 || b < 0) throw new Exception("jawaban DoT kosong");
            int len = (a << 8) | b;
            byte[] r = new byte[len];
            int got = 0;
            while (got < len) { int n = in.read(r, got, len - got); if (n < 0) throw new Exception("jawaban DoT terpotong"); got += n; }
            t.close();
            return parse(r, type, out);
        } finally { try { s.close(); } catch (Exception ignored) { } }
    }

    private long query(String url, String host, int type, List<InetAddress> out) throws Exception {
        byte[] body = question(host, type);
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        try {
            c.setConnectTimeout(6000); c.setReadTimeout(6000);
            c.setRequestMethod("POST"); c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/dns-message");
            c.setRequestProperty("Accept", "application/dns-message");
            c.setRequestProperty("User-Agent", "RuangBaca-HP");
            try (OutputStream o = c.getOutputStream()) { o.write(body); }
            if (c.getResponseCode() != 200) throw new Exception("DoH HTTP " + c.getResponseCode());
            byte[] r;
            try (InputStream in = c.getInputStream()) { r = readAll(in, 65535); }
            return parse(r, type, out);
        } finally { c.disconnect(); }
    }

    private static long parse(byte[] r, int want, List<InetAddress> out) throws Exception {
        if (r.length < 12) throw new Exception("jawaban pendek");
        int rcode = r[3] & 15;
        if (rcode != 0 && rcode != 3) throw new Exception("DNS menjawab kode " + rcode);
        int qd = u16(r, 4), an = u16(r, 6), p = 12;
        long ttl = 3600;
        for (int i = 0; i < qd; i++) { p = skipName(r, p); p += 4; }
        for (int i = 0; i < an; i++) {
            p = skipName(r, p);
            int type = u16(r, p), len = u16(r, p + 8);
            long t = ((long) (r[p + 4] & 255) << 24) | ((r[p + 5] & 255) << 16) | ((r[p + 6] & 255) << 8) | (r[p + 7] & 255);
            p += 10;
            if (type == want && ((want == 1 && len == 4) || (want == 28 && len == 16))) {
                byte[] a = new byte[len];
                System.arraycopy(r, p, a, 0, len);
                out.add(InetAddress.getByAddress(a));
                ttl = Math.min(ttl, t);
            }
            p += len;
        }
        return ttl;
    }
    private static int skipName(byte[] r, int p) {
        while (true) {
            int n = r[p] & 255;
            if (n == 0) return p + 1;
            if ((n & 0xC0) == 0xC0) return p + 2;
            p += n + 1;
        }
    }
    private static int u16(byte[] r, int p) { return ((r[p] & 255) << 8) | (r[p + 1] & 255); }

    // ---------------- proksi ----------------
    private void handle(Socket client) {
        Socket up = null;
        try {
            client.setSoTimeout(60000);
            InputStream ci = client.getInputStream();
            OutputStream co = client.getOutputStream();
            // baca kepala permintaan
            ByteArrayOutputStream hb = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int end = -1;
            while (end < 0) {
                int n = ci.read(buf);
                if (n <= 0) { client.close(); return; }
                hb.write(buf, 0, n);
                end = indexOf(hb.toByteArray(), "\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
                if (hb.size() > 65536) throw new Exception("kepala terlalu besar");
            }
            byte[] all = hb.toByteArray();
            String head = new String(all, 0, end, StandardCharsets.ISO_8859_1);
            byte[] rest = new byte[all.length - end - 4];
            System.arraycopy(all, end + 4, rest, 0, rest.length);
            String[] lines = head.split("\r\n");
            String[] rl = lines[0].split(" ");
            if (rl.length < 3) throw new Exception("permintaan salah");
            client.setSoTimeout(0);
            if (rl[0].equalsIgnoreCase("CONNECT")) {
                String hp = rl[1];
                int colon = hp.lastIndexOf(':');
                String host = colon > 0 ? hp.substring(0, colon) : hp;
                int port = colon > 0 ? Integer.parseInt(hp.substring(colon + 1)) : 443;
                up = connect(host, port);
                co.write("HTTP/1.1 200 Connection Established\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
                co.flush();
                if (rest.length > 0) up.getOutputStream().write(rest);
            } else {
                URL u = new URL(rl[1]);
                int port = u.getPort() > 0 ? u.getPort() : 80;
                up = connect(u.getHost(), port);
                StringBuilder sb = new StringBuilder();
                String path = u.getFile().isEmpty() ? "/" : u.getFile();
                sb.append(rl[0]).append(' ').append(path).append(' ').append(rl[2]).append("\r\n");
                for (int i = 1; i < lines.length; i++) {
                    String l = lines[i].toLowerCase(Locale.ROOT);
                    if (l.startsWith("proxy-connection:") || l.startsWith("connection:") || l.startsWith("keep-alive:")) continue;
                    sb.append(lines[i]).append("\r\n");
                }
                sb.append("Connection: close\r\n\r\n");
                OutputStream uo = up.getOutputStream();
                uo.write(sb.toString().getBytes(StandardCharsets.ISO_8859_1));
                if (rest.length > 0) uo.write(rest);
            }
            final Socket upF = up;
            pool.execute(() -> pipe(client, upF, true));
            pipe(upF, client, false);
        } catch (Exception e) {
            try { client.getOutputStream().write("HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".getBytes(StandardCharsets.US_ASCII)); } catch (Exception ignored) { }
            closeQuiet(client); closeQuiet(up);
        }
    }

    private Socket connect(String host, int port) throws Exception {
        Exception last = null;
        InetAddress[] list = resolve(host);
        // utamakan IPv4 (lebih umum didukung jaringan rumah / seluler)
        List<InetAddress> order = new ArrayList<>();
        for (InetAddress a : list) if (a instanceof Inet4Address) order.add(a);
        for (InetAddress a : list) if (!(a instanceof Inet4Address)) order.add(a);
        for (InetAddress a : order) {
            Socket s = new Socket();
            try { s.connect(new InetSocketAddress(a, port), 10000); s.setTcpNoDelay(true); return s; }
            catch (Exception e) { last = e; closeQuiet(s); }
        }
        throw last != null ? last : new Exception("tidak ada alamat");
    }

    private static void pipe(Socket from, Socket to, boolean clientSide) {
        byte[] b = new byte[32768];
        try {
            InputStream in = from.getInputStream();
            OutputStream out = to.getOutputStream();
            int n;
            while ((n = in.read(b)) > 0) { out.write(b, 0, n); out.flush(); }
        } catch (Exception ignored) {
        } finally { closeQuiet(from); closeQuiet(to); }
    }

    private static void closeQuiet(Socket s) { if (s != null) try { s.close(); } catch (Exception ignored) { } }
    private static int indexOf(byte[] a, byte[] p) {
        outer:
        for (int i = 0; i + p.length <= a.length; i++) { for (int j = 0; j < p.length; j++) if (a[i + j] != p[j]) continue outer; return i; }
        return -1;
    }
    static byte[] readAll(InputStream in, int max) throws Exception {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) > 0) { o.write(buf, 0, n); if (o.size() > max) throw new Exception("terlalu besar"); }
        return o.toByteArray();
    }
}
