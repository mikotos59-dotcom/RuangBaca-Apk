package id.sus.ruangbaca;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.util.Base64;
import androidx.webkit.ProxyConfig;
import androidx.webkit.ProxyController;
import androidx.webkit.WebViewFeature;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.text.InputType;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.Menu;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.RenderProcessGoneDetail;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Ruang Baca versi HP. Dua WebView:
 *  - page: situs komik (dengan jembatan-hp.js + inti.js disuntikkan sejak awal dokumen)
 *  - ui:   Rak Buku & mesin data (aset lokal, tidak pernah membuka internet)
 */
public class MainActivity extends Activity {
    private static final String UI_HOST = "appassets.androidplatform.net";
    private static final String UI_URL = "https://" + UI_HOST + "/assets/ui/index.html";
    private static final int REQ_EXPORT = 11, REQ_IMPORT = 12, REQ_FILE = 13, REQ_STORAGE = 14;
    private static final Pattern URL_IN_TEXT = Pattern.compile("https?://\\S+");

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService bg = Executors.newFixedThreadPool(3);

    private WebView page, ui;
    private LinearLayout bar, notice;
    private EditText address;
    private TextView btnBack, btnStar, btnHome, btnMore, noticeText, noticeOpen, noticeAlways;
    private ProgressBar progress;
    private FrameLayout stack, fullBox;
    private View fullView;
    private WebChromeClient.CustomViewCallback fullCb;
    private ValueCallback<Uri[]> fileCb;

    private AdBlock ads;
    private WebViewAssetLoader loader;
    private File dataDir, coverDir;
    private String userAgent = "";
    private String injectScript = "";
    private boolean docStart = false;

    // ui siap menerima perintah?
    private boolean uiReady = false;
    private final List<String> uiQueue = new ArrayList<>();
    // permintaan halaman yang menunggu jawaban mesin
    private int seq = 0;
    private final Map<Integer, Pend> pending = new HashMap<>();

    // keadaan dari mesin (setNative)
    private volatile boolean adblock = true;
    private volatile Set<String> allowAds = Collections.emptySet();
    private volatile Set<String> antiAdblock = Collections.emptySet();
    private volatile Map<String, Set<String>> popupHosts = Collections.emptyMap();
    private volatile String topHost = "";
    private String theme = "normal", search = "google";
    private boolean saved = false, home = true;
    private long allowNextUntil = 0;
    private String noticeUrl = null;
    private boolean noticeIsPopup = false;
    private String pendingExport = null;
    // DNS aman
    private DnsAman dns;
    private String dnsKey = "bawaan", dnsCustom = "";
    // ikon situs favorit yang sudah dicoba diambil (supaya tidak diulang terus)
    private final Set<String> iconTried = Collections.synchronizedSet(new java.util.HashSet<>());

    private static final class Pend {
        final int id; final JavaScriptReplyProxy proxy;
        Pend(int id, JavaScriptReplyProxy proxy) { this.id = id; this.proxy = proxy; }
    }

    // ================= awal =================
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        dataDir = new File(getFilesDir(), "data");
        coverDir = new File(getFilesDir(), "covers");
        dataDir.mkdirs();
        coverDir.mkdirs();
        ads = new AdBlock(this);
        bg.execute(() -> ads.load(this));
        loader = new WebViewAssetLoader.Builder()
                .setDomain(UI_HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .addPathHandler("/covers/", new WebViewAssetLoader.InternalStoragePathHandler(this, coverDir))
                .build();
        try { injectScript = asset("jembatan-hp.js") + "\n;\n" + asset("inti.js"); } catch (Exception e) { injectScript = ""; }
        buildLayout();
        setupUi();
        setupPage();
        applyTheme();
        showHome(true);
        handleIntent(getIntent());
    }

    private String asset(String name) throws Exception {
        try (InputStream in = getAssets().open(name)) { return new String(readStream(in, 4 << 20), StandardCharsets.UTF_8); }
    }

    private int dp(float v) { return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics())); }

    private TextView barButton(String text, String desc, View.OnClickListener l) {
        TextView b = new TextView(this);
        b.setText(text);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        b.setGravity(Gravity.CENTER);
        b.setContentDescription(desc);
        b.setMinWidth(dp(42));
        b.setPadding(dp(6), 0, dp(6), 0);
        TypedValue tv = new TypedValue();
        if (getTheme().resolveAttribute(android.R.attr.selectableItemBackgroundBorderless, tv, true)) b.setBackgroundResource(tv.resourceId);
        b.setOnClickListener(l);
        b.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.MATCH_PARENT));
        return b;
    }

    private void buildLayout() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);

        bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setPadding(dp(4), dp(6), dp(4), dp(6));
        btnBack = barButton("‹", "Kembali", v -> onBackPressed());
        btnBack.setTextSize(TypedValue.COMPLEX_UNIT_SP, 30);
        address = new EditText(this);
        address.setSingleLine(true);
        address.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        address.setHint("Cari atau ketik alamat");
        address.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        address.setImeOptions(EditorInfo.IME_ACTION_GO);
        address.setSelectAllOnFocus(true);
        address.setPadding(dp(12), 0, dp(12), 0);
        address.setOnEditorActionListener((v, id, ev) -> {
            if (id == EditorInfo.IME_ACTION_GO || (ev != null && ev.getKeyCode() == KeyEvent.KEYCODE_ENTER && ev.getAction() == KeyEvent.ACTION_DOWN)) {
                navigate(address.getText().toString());
                return true;
            }
            return false;
        });
        LinearLayout.LayoutParams ap = new LinearLayout.LayoutParams(0, dp(40), 1);
        ap.gravity = Gravity.CENTER_VERTICAL;
        ap.setMargins(dp(2), 0, dp(2), 0);
        address.setLayoutParams(ap);
        btnStar = barButton("☆", "Simpan ke rak", v -> {
            if (home) toast("Buka halaman komiknya dulu.");
            else evalUi("RBEngine.saveCurrent()");
        });
        btnHome = barButton("📚", "Rak Buku", v -> showHome(!home || page.getUrl() == null ? true : false));
        btnHome.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        btnMore = barButton("⋮", "Menu", v -> openMenu());
        bar.addView(btnBack);
        bar.addView(address);
        bar.addView(btnStar);
        bar.addView(btnHome);
        bar.addView(btnMore);
        root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(54)));

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setVisibility(View.GONE);
        root.addView(progress, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)));

        // bilah pemberitahuan pop-up / halaman iklan
        notice = new LinearLayout(this);
        notice.setOrientation(LinearLayout.HORIZONTAL);
        notice.setGravity(Gravity.CENTER_VERTICAL);
        notice.setPadding(dp(12), dp(4), dp(4), dp(4));
        noticeText = new TextView(this);
        noticeText.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        noticeText.setMaxLines(2);
        noticeText.setEllipsize(TextUtils.TruncateAt.END);
        notice.addView(noticeText, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        noticeOpen = barButton("Buka", "Buka di sini", v -> {
            String u = noticeUrl;
            hideNotice();
            if (u != null) go(u);
        });
        noticeAlways = barButton("Selalu", "Selalu buka pop-up ini", v -> {
            String u = noticeUrl, cur = page.getUrl();
            hideNotice();
            if (u != null && cur != null) { evalUi("RBEngine.popupAlways(" + q(cur) + "," + q(u) + ")"); go(u); }
        });
        TextView noticeClose = barButton("✕", "Tutup", v -> hideNotice());
        for (TextView t : new TextView[]{noticeOpen, noticeAlways, noticeClose}) {
            t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
            t.setTypeface(Typeface.DEFAULT_BOLD);
            notice.addView(t, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(40)));
        }
        notice.setVisibility(View.GONE);
        root.addView(notice, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        stack = new FrameLayout(this);
        page = new WebView(this);
        ui = new WebView(this);
        fullBox = new FrameLayout(this);
        fullBox.setBackgroundColor(Color.BLACK);
        fullBox.setVisibility(View.GONE);
        stack.addView(page, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        stack.addView(ui, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        stack.addView(fullBox, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(stack, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);
    }

    // ================= tampilan Rak Buku (lokal) =================
    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void setupUi() {
        WebSettings s = ui.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        ui.setBackgroundColor(Color.parseColor("#f4efe6"));
        ui.addJavascriptInterface(new UiBridge(), "RBUi");
        ui.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                WebResourceResponse res = loader.shouldInterceptRequest(r.getUrl());
                // tampilan rak tidak boleh memuat apa pun dari internet
                return res != null ? res : empty();
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return true; }
            @Override
            public void onPageFinished(WebView v, String url) {
                uiReady = true;
                for (String js : uiQueue) ui.evaluateJavascript(js, null);
                uiQueue.clear();
                syncVisit();
            }
            @Override
            public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail d) { recreate(); return true; }
        });
        ui.loadUrl(UI_URL);
    }

    /** Jalankan skrip di tampilan rak (antre sampai siap). Aman dipanggil dari utas mana pun. */
    private void evalUi(String js) {
        main.post(() -> {
            if (uiReady) ui.evaluateJavascript(js, null);
            else uiQueue.add(js);
        });
    }

    private static String q(String s) { return JSONObject.quote(s == null ? "" : s); }

    private static WebResourceResponse empty() {
        return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
    }

    // ================= halaman situs =================
    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void setupPage() {
        WebSettings s = page.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        // sebagian situs menolak WebView; pakai identitas Chrome biasa
        userAgent = s.getUserAgentString().replace("; wv", "").replaceAll("Version/\\d+\\.\\d+ ", "");
        s.setUserAgentString(userAgent);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(page, true);

        Set<String> all = new HashSet<>();
        all.add("*");
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            // hanya halaman utama yang boleh berbicara ke aplikasi (iframe iklan ditolak)
            WebViewCompat.addWebMessageListener(page, "RBPage", all, (WebView v, WebMessageCompat msg, Uri origin, boolean isMain, JavaScriptReplyProxy proxy) -> {
                if (!isMain || msg.getData() == null) return;
                try {
                    JSONObject o = new JSONObject(msg.getData());
                    pageCall(o.optInt("id"), o.optString("m"), o.optString("a", "[]"), proxy);
                } catch (Exception ignored) { }
            });
        } else {
            page.addJavascriptInterface(new Object() {
                @JavascriptInterface
                public void call(int id, String m, String args) { main.post(() -> pageCall(id, m, args, null)); }
            }, "RBPage");
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT) && !injectScript.isEmpty()) {
            WebViewCompat.addDocumentStartJavaScript(page, injectScript, all);
            docStart = true;
        }

        page.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                Uri u = r.getUrl();
                String sc = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
                if (!sc.equals("http") && !sc.equals("https")) {
                    // intent:// dan sejenisnya hampir selalu iklan; hanya buka tautan aplikasi lain kalau diketuk
                    if (r.isForMainFrame() && r.hasGesture() && !sc.equals("intent") && !sc.equals("javascript")) openExternal(u);
                    return true;
                }
                if (!r.isForMainFrame()) return false;
                String h = u.getHost(), top = topHost;
                // klik pertama dibajak iklan: halaman utama dibawa ke situs iklan
                if (adblock && h != null && !top.isEmpty() && !AdBlock.base(h).equals(AdBlock.base(top)) && !adsAllowed(top) && ads.isAd(h)) {
                    showNotice("Halaman iklan diblok: " + h, u.toString(), false);
                    return true;
                }
                return false;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                if (!adblock || r.isForMainFrame()) return null;
                String h = r.getUrl().getHost(), top = topHost;
                if (h == null || top.isEmpty() || AdBlock.base(h).equals(AdBlock.base(top))) return null;
                if (adsAllowed(top)) return null;
                return ads.isAd(h) ? empty() : null;
            }

            @Override
            public void onPageStarted(WebView v, String url, Bitmap fav) {
                topHost = hostOf(url);
                if (!home && !address.hasFocus()) address.setText(url);
                hideNotice();
                if (!docStart) inject();
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                if (!docStart) inject();
                syncVisit();
            }

            @Override
            public void doUpdateVisitedHistory(WebView v, String url, boolean reload) {
                topHost = hostOf(url);
                if (!home && !address.hasFocus()) address.setText(url);
                syncVisit();
            }

            @Override
            public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail d) { recreate(); return true; }
        });

        page.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView v, int p) {
                progress.setProgress(p);
                progress.setVisibility(p < 100 && !home ? View.VISIBLE : View.GONE);
                if (!docStart && p >= 30) inject();
            }
            @Override
            public void onReceivedTitle(WebView v, String title) { syncVisit(); }
            @Override
            public void onReceivedIcon(WebView v, Bitmap icon) {
                String url = v.getUrl();
                if (icon == null || url == null || !url.startsWith("http")) return;
                String host = Uri.parse(url).getHost();
                String d = iconData(icon);
                if (host != null && d != null) evalUi("RBEngine.favIcon(" + q(host) + "," + q(d) + ")");
            }

            @Override
            public boolean onCreateWindow(WebView v, boolean dialog, boolean gesture, Message result) {
                // pop-up tanpa ketukan selalu iklan
                if (!gesture && System.currentTimeMillis() > allowNextUntil) return false;
                WebView tmp = new WebView(MainActivity.this);
                tmp.setWebViewClient(new WebViewClient() {
                    boolean done = false;
                    void take(String url) {
                        if (done || url == null || url.isEmpty() || url.equals("about:blank")) return;
                        done = true;
                        main.post(() -> { tmp.stopLoading(); tmp.destroy(); handlePopup(url); });
                    }
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView w, WebResourceRequest r) { take(r.getUrl().toString()); return true; }
                    @Override
                    public void onPageStarted(WebView w, String url, Bitmap f) { take(url); }
                });
                main.postDelayed(() -> { try { tmp.destroy(); } catch (Exception ignored) { } }, 15000);
                WebView.WebViewTransport t = (WebView.WebViewTransport) result.obj;
                t.setWebView(tmp);
                result.sendToTarget();
                return true;
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback cb) {
                if (fullView != null) { cb.onCustomViewHidden(); return; }
                fullView = view;
                fullCb = cb;
                fullBox.addView(view, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                fullBox.setVisibility(View.VISIBLE);
                setChrome(false);
            }
            @Override
            public void onHideCustomView() { exitFullscreen(); }

            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                try { startActivityForResult(p.createIntent(), REQ_FILE); } catch (ActivityNotFoundException e) { fileCb = null; return false; }
                return true;
            }
        });

        page.setDownloadListener((url, ua, cd, mime, len) -> download(url, cd, mime));
    }

    private void inject() {
        if (!injectScript.isEmpty()) page.evaluateJavascript("if(!window.__RB_INTI){" + injectScript + "\n}", null);
    }

    private boolean adsAllowed(String top) {
        String h = wwwless(top);
        return allowAds.contains(h) || antiAdblock.contains(h);
    }

    private static String hostOf(String url) {
        try { String h = Uri.parse(url).getHost(); return h == null ? "" : h.toLowerCase(); } catch (Exception e) { return ""; }
    }
    private static String wwwless(String h) { return h == null ? "" : h.replaceFirst("^www\\.", ""); }

    /** Halaman bertanya ke mesin data. Alamat diambil dari WebView, bukan dari halaman. */
    private void pageCall(int pageId, String method, String args, JavaScriptReplyProxy proxy) {
        String url = page.getUrl();
        if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) return;
        int jid = 0;
        if (pageId != 0) {
            jid = ++seq;
            pending.put(jid, new Pend(pageId, proxy));
        }
        evalUi("RBEngine.page(" + jid + "," + q(url) + "," + q(method) + "," + q(args) + ")");
    }

    private void syncVisit() {
        if (!uiReady) return;
        String url = page.getUrl();
        if (url == null) return;
        ui.evaluateJavascript("RBEngine.visit(" + q(url) + "," + q(page.getTitle()) + ")", null);
    }

    private void pageCmd(String cmd) {
        page.evaluateJavascript("window.__RBcmd&&window.__RBcmd(" + q(cmd) + ")", null);
    }

    // ================= pop-up =================
    private void handlePopup(String url) {
        if (!url.startsWith("http://") && !url.startsWith("https://")) return;
        String cur = page.getUrl();
        String top = wwwless(hostOf(cur)), th = wwwless(hostOf(url));
        boolean allowNext = System.currentTimeMillis() < allowNextUntil;
        allowNextUntil = 0;
        Set<String> list = popupHosts.get(top);
        if (allowNext || AdBlock.base(th).equals(AdBlock.base(top)) || (list != null && list.contains(th))) {
            go(url); // dibuka di tempat, bukan jendela baru
            return;
        }
        if (ads.isAd(th)) return; // pop-up iklan: diam-diam diblok
        showNotice("Pop-up ke " + th + " diblok", url, true);
    }

    private void showNotice(String text, String url, boolean popup) {
        noticeText.setText(text);
        noticeUrl = url;
        noticeIsPopup = popup;
        noticeAlways.setVisibility(popup ? View.VISIBLE : View.GONE);
        notice.setVisibility(View.VISIBLE);
        main.removeCallbacks(hideNoticeLater);
        main.postDelayed(hideNoticeLater, 12000);
    }
    private final Runnable hideNoticeLater = this::hideNotice;
    private void hideNotice() { notice.setVisibility(View.GONE); noticeUrl = null; }

    // ================= navigasi =================
    private void navigate(String text) {
        String t = text.trim();
        if (t.isEmpty()) return;
        String url;
        if (t.matches("(?i)^[a-z][a-z0-9+.-]*://.*")) url = t;
        else if (!t.contains(" ") && t.matches("^[^/]+\\.[a-zA-Z]{2,}(?::\\d+)?(/.*)?$")) url = "https://" + t;
        else {
            String base = "duckduckgo".equals(search) ? "https://duckduckgo.com/?q=" : "bing".equals(search) ? "https://www.bing.com/search?q=" : "https://www.google.com/search?q=";
            try { url = base + URLEncoder.encode(t, "UTF-8"); } catch (Exception e) { return; }
        }
        hideKeyboard();
        go(url);
    }

    private void go(String url) {
        if (url == null || url.isEmpty()) return;
        showHome(false);
        topHost = hostOf(url);
        page.loadUrl(url);
    }

    private void showHome(boolean on) {
        home = on;
        ui.setVisibility(on ? View.VISIBLE : View.GONE);
        progress.setVisibility(View.GONE);
        address.clearFocus();
        String url = page.getUrl();
        address.setText(on || url == null ? "" : url);
        btnStar.setAlpha(on ? 0.35f : 1f);
        btnHome.setAlpha(on && url == null ? 0.35f : 1f);
        if (on) { hideNotice(); evalUi("window.RBHome&&RBHome.refresh()"); }
        updateStar();
    }

    private void hideKeyboard() {
        InputMethodManager im = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
        if (im != null) im.hideSoftInputFromWindow(address.getWindowToken(), 0);
        address.clearFocus();
    }

    private void openExternal(Uri u) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, u).addCategory(Intent.CATEGORY_BROWSABLE)); }
        catch (Exception e) { toast("Tidak ada aplikasi untuk membuka tautan ini."); }
    }

    private void openMenu() {
        PopupMenu m = new PopupMenu(this, btnMore);
        Menu x = m.getMenu();
        String url = page.getUrl();
        boolean onPage = !home && url != null;
        if (onPage) {
            x.add(0, 1, 0, "Muat ulang");
            x.add(0, 2, 0, "Mode baca");
            x.add(0, 3, 0, "Gulir otomatis");
            x.add(0, 4, 0, "Hitam putih");
            x.add(0, 5, 0, "Mode gelap situs");
            x.add(0, 6, 0, "Menu Ruang Baca di halaman");
            x.add(0, 7, 0, "Pilih sampul dari halaman");
            x.add(0, 8, 0, "Sembunyikan elemen");
            x.add(0, 9, 0, adsAllowed(topHost) ? "Blok iklan lagi di situs ini" : "Izinkan iklan di situs ini");
            x.add(0, 10, 0, "Bagikan alamat");
            x.add(0, 11, 0, "Buka di browser lain");
        } else if (url != null) {
            x.add(0, 12, 0, "Kembali ke halaman terakhir");
        }
        x.add(0, 13, 0, "Pengaturan");
        m.setOnMenuItemClickListener(it -> {
            switch (it.getItemId()) {
                case 1: page.reload(); break;
                case 2: pageCmd("reader"); break;
                case 3: pageCmd("scroll"); break;
                case 4: pageCmd("gray"); break;
                case 5: pageCmd("dark"); break;
                case 6: pageCmd("menu"); break;
                case 7: pageCmd("coverpick"); break;
                case 8: pageCmd("picker"); break;
                case 9: evalUi("RBEngine.toggleAds(" + q(page.getUrl()) + ")"); break;
                case 10: {
                    Intent s = new Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, page.getUrl());
                    startActivity(Intent.createChooser(s, "Bagikan"));
                    break;
                }
                case 11: openExternal(Uri.parse(page.getUrl())); break;
                case 12: showHome(false); break;
                case 13: showHome(true); evalUi("RBHome.settings()"); break;
            }
            return true;
        });
        m.show();
    }

    // ================= unduhan =================
    private void download(String url, String cd, String mime) {
        if (url == null || !(url.startsWith("http://") || url.startsWith("https://"))) {
            toast("Unduhan jenis ini belum didukung di versi HP.");
            return;
        }
        if (Build.VERSION.SDK_INT < 29 && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_STORAGE);
            toast("Izinkan penyimpanan, lalu ketuk unduh lagi.");
            return;
        }
        try {
            String name = URLUtil.guessFileName(url, cd, mime);
            DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie != null) r.addRequestHeader("Cookie", cookie);
            r.addRequestHeader("User-Agent", userAgent);
            if (page.getUrl() != null) r.addRequestHeader("Referer", page.getUrl());
            if (mime != null) r.setMimeType(mime);
            r.setTitle(name);
            r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, "RuangBaca/" + name);
            DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
            dm.enqueue(r);
            toast("Mengunduh " + name + " ke Download/RuangBaca");
        } catch (Exception e) {
            toast("Gagal mengunduh: " + e.getMessage());
        }
    }

    // ================= sampul =================
    private void fetchCover(int id, String url, String referer, String bookId) {
        String name = "";
        HttpURLConnection c = null;
        try {
            String u = url;
            for (int i = 0; i < 6; i++) {
                c = open(u);
                c.setInstanceFollowRedirects(false);
                c.setConnectTimeout(15000);
                c.setReadTimeout(30000);
                c.setRequestProperty("User-Agent", userAgent);
                c.setRequestProperty("Accept", "image/avif,image/webp,image/*,*/*;q=0.8");
                if (!referer.isEmpty()) c.setRequestProperty("Referer", referer);
                String cookie = CookieManager.getInstance().getCookie(u);
                if (cookie != null) c.setRequestProperty("Cookie", cookie);
                int code = c.getResponseCode();
                if (code >= 300 && code < 400 && c.getHeaderField("Location") != null) {
                    u = new URL(new URL(u), c.getHeaderField("Location")).toString();
                    c.disconnect();
                    continue;
                }
                if (code != 200) throw new Exception("HTTP " + code);
                break;
            }
            String type = c.getContentType() == null ? "" : c.getContentType().toLowerCase();
            if (type.startsWith("text/") || type.contains("json")) throw new Exception("bukan gambar");
            byte[] b;
            try (InputStream in = c.getInputStream()) { b = readStream(in, 12 << 20); }
            if (b.length < 200) throw new Exception("terlalu kecil");
            String ext = type.contains("png") ? ".png" : type.contains("webp") ? ".webp" : type.contains("gif") ? ".gif" : type.contains("avif") ? ".avif" : ".jpg";
            String n = safe(bookId) + "-" + System.currentTimeMillis() + ext;
            try (FileOutputStream o = new FileOutputStream(new File(coverDir, n))) { o.write(b); }
            name = n;
        } catch (Exception ignored) {
        } finally {
            if (c != null) c.disconnect();
        }
        evalUi("RBEngine.coverDone(" + id + "," + q(name) + ")");
    }

    // sambungan keluar ikut DNS aman kalau sedang dipakai
    private HttpURLConnection open(String u) throws Exception {
        if (dns != null && !"bawaan".equals(dnsKey) && dns.port() > 0)
            return (HttpURLConnection) new URL(u).openConnection(new java.net.Proxy(java.net.Proxy.Type.HTTP, new java.net.InetSocketAddress("127.0.0.1", dns.port())));
        return (HttpURLConnection) new URL(u).openConnection();
    }

    // ================= DNS aman =================
    private void applyDns(boolean reload) {
        String url = DnsAman.urlFor(dnsKey, dnsCustom);
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) {
            if (!url.isEmpty()) toast("DNS khusus butuh Android System WebView yang lebih baru. Perbarui lewat Play Store.");
            return;
        }
        Runnable done = () -> { if (reload && !home && page.getUrl() != null) page.reload(); };
        if (url.isEmpty()) {
            ProxyController.getInstance().clearProxyOverride(main::post, done);
            return;
        }
        if (dns == null) dns = new DnsAman(userAgent);
        dns.setServer(url);
        bg.execute(() -> {
            try {
                int port = dns.start();
                main.post(() -> {
                    ProxyConfig cfg = new ProxyConfig.Builder().addProxyRule("127.0.0.1:" + port).addDirect(ProxyConfig.MATCH_ALL_SCHEMES).build();
                    ProxyController.getInstance().setProxyOverride(cfg, main::post, done);
                });
            } catch (Exception e) { toast("DNS tidak bisa dipakai: " + e.getMessage()); }
        });
    }

    // ================= ikon situs =================
    private static String iconData(Bitmap b) {
        try {
            if (b == null || b.getWidth() < 8) return null;
            int s = 64;
            Bitmap o = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
            new Canvas(o).drawBitmap(b, new Rect(0, 0, b.getWidth(), b.getHeight()), new Rect(0, 0, s, s), new Paint(Paint.FILTER_BITMAP_FLAG));
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            o.compress(Bitmap.CompressFormat.PNG, 100, out);
            return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        } catch (Exception e) { return null; }
    }
    private static final Pattern LINK_TAG = Pattern.compile("<link\\b[^>]*>", Pattern.CASE_INSENSITIVE);
    private static final Pattern ATTR = Pattern.compile("(rel|href|sizes)\\s*=\\s*(\"[^\"]*\"|'[^']*'|[^\\s>]+)", Pattern.CASE_INSENSITIVE);
    /** Ambil ikon dari halaman situs: apple-touch-icon / icon di HTML, lalu /favicon.ico. */
    private String loadIcon(String pageUrl) {
        List<String> cand = new ArrayList<>();
        try {
            byte[] html = get(pageUrl, "text/html,*/*", 512 << 10);
            String h = new String(html, StandardCharsets.UTF_8);
            java.util.regex.Matcher m = LINK_TAG.matcher(h);
            List<String> touch = new ArrayList<>(), icon = new ArrayList<>();
            while (m.find()) {
                String rel = "", href = "";
                java.util.regex.Matcher a = ATTR.matcher(m.group());
                while (a.find()) {
                    String v = a.group(2).replaceAll("^[\"']|[\"']$", "");
                    if (a.group(1).equalsIgnoreCase("rel")) rel = v.toLowerCase(); else if (a.group(1).equalsIgnoreCase("href")) href = v;
                }
                if (href.isEmpty() || !rel.contains("icon")) continue;
                String abs = new URL(new URL(pageUrl), href.replace("&amp;", "&")).toString();
                if (rel.contains("apple-touch")) touch.add(abs); else icon.add(abs);
            }
            cand.addAll(touch); cand.addAll(icon);
        } catch (Exception ignored) { }
        try { cand.add(new URL(new URL(pageUrl), "/favicon.ico").toString()); } catch (Exception ignored) { }
        for (String u : cand) {
            try {
                if (u.startsWith("data:")) continue;
                byte[] b = get(u, "image/*,*/*;q=0.8", 2 << 20);
                Bitmap bm = BitmapFactory.decodeByteArray(b, 0, b.length);
                String d = iconData(bm);
                if (d != null) return d;
            } catch (Exception ignored) { }
        }
        return null;
    }
    private byte[] get(String url, String accept, int max) throws Exception {
        String u = url;
        for (int i = 0; i < 6; i++) {
            HttpURLConnection c = open(u);
            try {
                c.setInstanceFollowRedirects(false);
                c.setConnectTimeout(12000); c.setReadTimeout(20000);
                c.setRequestProperty("User-Agent", userAgent);
                c.setRequestProperty("Accept", accept);
                String cookie = CookieManager.getInstance().getCookie(u);
                if (cookie != null) c.setRequestProperty("Cookie", cookie);
                int code = c.getResponseCode();
                if (code >= 300 && code < 400 && c.getHeaderField("Location") != null) { u = new URL(new URL(u), c.getHeaderField("Location")).toString(); continue; }
                if (code != 200) throw new Exception("HTTP " + code);
                try (InputStream in = c.getInputStream()) { return readStream(in, max); }
            } finally { c.disconnect(); }
        }
        throw new Exception("terlalu banyak alihan");
    }

    private static byte[] readStream(InputStream in, int max) throws Exception {
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = in.read(buf)) > 0) {
            o.write(buf, 0, n);
            if (o.size() > max) throw new Exception("terlalu besar");
        }
        return o.toByteArray();
    }

    private static String safe(String name) {
        String s = name == null ? "" : name.replaceAll("[^A-Za-z0-9._-]", "_");
        while (s.startsWith(".")) s = s.substring(1);
        return s.isEmpty() ? "x" : s;
    }

    // ================= tema =================
    private void applyTheme() {
        int barC, ink, field, accent;
        boolean light = false;
        switch (theme) {
            case "dark": barC = 0xff1b1b1f; ink = 0xffececf0; field = 0xff24242a; accent = 0xffe5604f; break;
            case "batik": barC = 0xff25190d; ink = 0xfff5e8cf; field = 0xff312214; accent = 0xffdcaa2c; break;
            default: barC = 0xfffffdf8; ink = 0xff1d1b17; field = 0xfff1ebdf; accent = 0xffb4372c; light = true;
        }
        bar.setBackgroundColor(barC);
        notice.setBackgroundColor(field);
        noticeText.setTextColor(ink);
        for (TextView t : new TextView[]{btnBack, btnHome, btnMore}) t.setTextColor(ink);
        noticeOpen.setTextColor(accent);
        noticeAlways.setTextColor(accent);
        btnStar.setTag(new int[]{ink, accent});
        updateStar();
        GradientDrawable g = new GradientDrawable();
        g.setColor(field);
        g.setCornerRadius(dp(20));
        address.setBackground(g);
        address.setTextColor(ink);
        address.setHintTextColor((ink & 0x00ffffff) | 0x88000000);
        progress.setProgressTintList(ColorStateList.valueOf(accent));
        int bgC = "dark".equals(theme) ? 0xff121214 : "batik".equals(theme) ? 0xff1a120a : 0xfff4efe6;
        ui.setBackgroundColor(bgC);
        getWindow().setStatusBarColor(barC);
        getWindow().setNavigationBarColor(bgC);
        View d = getWindow().getDecorView();
        int f = d.getSystemUiVisibility();
        f = light ? (f | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR)
                : (f & ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR & ~View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        d.setSystemUiVisibility(f);
    }

    private void updateStar() {
        int[] c = btnStar.getTag() instanceof int[] ? (int[]) btnStar.getTag() : new int[]{Color.BLACK, Color.RED};
        boolean on = saved && !home;
        btnStar.setText(on ? "★" : "☆");
        btnStar.setTextColor(on ? c[1] : c[0]);
    }

    private void setChrome(boolean show) {
        bar.setVisibility(show ? View.VISIBLE : View.GONE);
        if (!show) { progress.setVisibility(View.GONE); notice.setVisibility(View.GONE); }
        View d = getWindow().getDecorView();
        int f = d.getSystemUiVisibility();
        int full = View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
        d.setSystemUiVisibility(show ? f & ~full : f | full);
        if (show) getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    private void exitFullscreen() {
        if (fullView == null) return;
        fullBox.removeView(fullView);
        fullBox.setVisibility(View.GONE);
        fullView = null;
        if (fullCb != null) fullCb.onCustomViewHidden();
        fullCb = null;
        setChrome(true);
    }

    private void toast(String s) { main.post(() -> Toast.makeText(this, s, Toast.LENGTH_SHORT).show()); }

    // ================= jembatan untuk tampilan rak (hanya WebView ui) =================
    private final class UiBridge {
        private File dataFile(String n) { return new File(dataDir, safe(n)); }

        @JavascriptInterface
        public String readFile(String name) {
            File f = dataFile(name);
            if (!f.exists()) return null;
            try { return new String(AdBlock.readAll(f), StandardCharsets.UTF_8); } catch (Exception e) { return null; }
        }
        @JavascriptInterface
        public void writeFile(String name, String text) {
            try { AdBlock.writeAll(dataFile(name), text); } catch (Exception ignored) { }
        }
        @JavascriptInterface
        public void rename(String a, String b) {
            File fa = dataFile(a), fb = dataFile(b);
            if (!fa.renameTo(fb)) {
                try { AdBlock.writeAll(fb, new String(AdBlock.readAll(fa), StandardCharsets.UTF_8)); fa.delete(); } catch (Exception ignored) { }
            }
        }
        @JavascriptInterface
        public String coverPath(String name) {
            File f = new File(coverDir, safe(name));
            return f.exists() ? "https://" + UI_HOST + "/covers/" + f.getName() : "";
        }
        @JavascriptInterface
        public void deleteCover(String name) { new File(coverDir, safe(name)).delete(); }
        @JavascriptInterface
        public void downloadCover(int id, String url, String referer, String bookId) {
            bg.execute(() -> fetchCover(id, url, referer == null ? "" : referer, bookId));
        }
        @JavascriptInterface
        public void reply(int id, String json) {
            main.post(() -> {
                Pend p = pending.remove(id);
                if (p == null) return;
                try {
                    if (p.proxy != null) {
                        JSONObject o = new JSONObject();
                        o.put("id", p.id);
                        o.put("v", json);
                        p.proxy.postMessage(o.toString());
                    } else {
                        page.evaluateJavascript("window.__RBres&&window.__RBres(" + p.id + "," + q(json) + ")", null);
                    }
                } catch (Exception ignored) { }
            });
        }
        @JavascriptInterface
        public void setNative(String json) {
            try {
                JSONObject o = new JSONObject(json);
                adblock = o.optBoolean("adblock", true);
                allowAds = toSet(o.optJSONArray("allowAds"));
                antiAdblock = toSet(o.optJSONArray("antiAdblock"));
                Map<String, Set<String>> ph = new HashMap<>();
                JSONObject p = o.optJSONObject("popupHosts");
                if (p != null) for (java.util.Iterator<String> it = p.keys(); it.hasNext(); ) { String k = it.next(); ph.put(wwwless(k), toSet(p.optJSONArray(k))); }
                popupHosts = ph;
                String th = o.optString("theme", "normal"), se = o.optString("search", "google");
                String dk = o.optString("dns", "bawaan"), dc = o.optString("dnsCustom", "");
                main.post(() -> {
                    search = se;
                    if (!dk.equals(dnsKey) || !dc.equals(dnsCustom)) { dnsKey = dk; dnsCustom = dc; applyDns(true); }
                    if (!th.equals(theme)) { theme = th; applyTheme(); }
                });
            } catch (Exception ignored) { }
        }
        @JavascriptInterface
        public void setToolbar(String json) {
            try {
                boolean s = new JSONObject(json).optBoolean("saved");
                main.post(() -> { saved = s; updateStar(); });
            } catch (Exception ignored) { }
        }
        @JavascriptInterface
        public void fetchIcon(String host, String url) {
            if (host == null || url == null || !iconTried.add(host)) return;
            bg.execute(() -> {
                String d = loadIcon(url);
                if (d != null) evalUi("RBEngine.favIcon(" + q(host) + "," + q(d) + ")");
            });
        }
        @JavascriptInterface
        public void go(String url) { main.post(() -> MainActivity.this.go(url)); }
        @JavascriptInterface
        public void toast(String msg) { MainActivity.this.toast(msg); }
        @JavascriptInterface
        public void allowPopup() { main.post(() -> allowNextUntil = System.currentTimeMillis() + 5000); }
        @JavascriptInterface
        public void exportFile(String name, String text) {
            main.post(() -> {
                pendingExport = text;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                        .setType("application/json").putExtra(Intent.EXTRA_TITLE, name);
                try { startActivityForResult(i, REQ_EXPORT); } catch (ActivityNotFoundException e) { MainActivity.this.toast("Tidak bisa membuka pemilih file."); }
            });
        }
        @JavascriptInterface
        public void importFile() {
            main.post(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                try { startActivityForResult(i, REQ_IMPORT); } catch (ActivityNotFoundException e) { MainActivity.this.toast("Tidak bisa membuka pemilih file."); }
            });
        }
        @JavascriptInterface
        public String adStatus() {
            try { return new JSONObject().put("rules", ads.size()).put("updated", ads.updated()).toString(); } catch (Exception e) { return "{}"; }
        }
        @JavascriptInterface
        public void adUpdate() {
            bg.execute(() -> {
                boolean ok = ads.update();
                MainActivity.this.toast(ok ? "Daftar iklan diperbarui." : "Gagal memperbarui daftar iklan. Cek internet.");
                evalUi("RBHome.adDone()");
            });
        }
        @JavascriptInterface
        public String version() {
            try { return getPackageManager().getPackageInfo(getPackageName(), 0).versionName; } catch (Exception e) { return ""; }
        }
        @JavascriptInterface
        public void clearData() {
            main.post(() -> {
                CookieManager.getInstance().removeAllCookies(null);
                WebStorage.getInstance().deleteAllData();
                page.clearCache(true);
                page.clearHistory();
                MainActivity.this.toast("Riwayat, cookie, dan cache situs dihapus.");
            });
        }
    }

    private static Set<String> toSet(JSONArray a) {
        Set<String> s = new HashSet<>();
        if (a != null) for (int i = 0; i < a.length(); i++) s.add(wwwless(a.optString(i).toLowerCase()));
        return s;
    }

    // ================= hasil pemilih file =================
    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_FILE) {
            if (fileCb != null) fileCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
            fileCb = null;
            return;
        }
        Uri u = data == null ? null : data.getData();
        if (req == REQ_EXPORT) {
            String text = pendingExport;
            pendingExport = null;
            if (res != RESULT_OK || u == null || text == null) return;
            bg.execute(() -> {
                try (OutputStream o = openOut(u)) {
                    o.write(text.getBytes(StandardCharsets.UTF_8));
                    toast("Ekspor tersimpan. Pindahkan file ini ke PC lalu Impor di Ruang Baca PC.");
                } catch (Exception e) { toast("Gagal menyimpan: " + e.getMessage()); }
            });
        } else if (req == REQ_IMPORT) {
            if (res != RESULT_OK || u == null) return;
            bg.execute(() -> {
                try (InputStream in = getContentResolver().openInputStream(u)) {
                    String text = new String(readStream(in, 40 << 20), StandardCharsets.UTF_8);
                    evalUi("RBEngine.imported(" + q(text) + ")");
                } catch (Exception e) { toast("Gagal membaca file: " + e.getMessage()); }
            });
        }
    }

    private OutputStream openOut(Uri u) throws Exception {
        try { return getContentResolver().openOutputStream(u, "wt"); } catch (Exception e) { return getContentResolver().openOutputStream(u, "w"); }
    }

    // ================= intent dari aplikasi lain =================
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent i) {
        if (i == null) return;
        if (Intent.ACTION_VIEW.equals(i.getAction()) && i.getData() != null) {
            go(i.getData().toString());
        } else if (Intent.ACTION_SEND.equals(i.getAction())) {
            String t = i.getStringExtra(Intent.EXTRA_TEXT);
            if (t == null) return;
            Matcher m = URL_IN_TEXT.matcher(t);
            if (m.find()) go(m.group());
            else navigate(t);
        }
    }

    // ================= tombol kembali & siklus hidup =================
    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (fullView != null) { exitFullscreen(); return; }
        if (address.hasFocus()) { hideKeyboard(); return; }
        if (notice.getVisibility() == View.VISIBLE) { hideNotice(); return; }
        if (home) {
            ui.evaluateJavascript("window.RBHome?RBHome.back():false", r -> {
                if ("true".equals(r)) return;
                if (page.getUrl() != null) showHome(false);
                else finish();
            });
            return;
        }
        if (page.canGoBack()) { page.goBack(); return; }
        showHome(true);
    }

    @Override
    protected void onPause() {
        super.onPause();
        evalUi("RBEngine.flush()");
        CookieManager.getInstance().flush();
        page.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        page.onResume();
    }

    @Override
    protected void onDestroy() {
        bg.shutdown();
        if (page != null) page.destroy();
        if (ui != null) ui.destroy();
        super.onDestroy();
    }
}
