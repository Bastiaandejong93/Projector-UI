package nl.bastiaandejong.luna

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
import android.os.Looper
import android.provider.Settings
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.webkit.WebViewAssetLoader
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class MainActivity : Activity() {
    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        hideSystemBars()
        webView = createWebView()
        setContentView(webView)
        webView.loadUrl("https://appassets.androidplatform.net/index.html")
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    @SuppressLint("SetJavaScriptEnabled", "AddJavascriptInterface")
    private fun createWebView(): WebView {
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        return WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            overScrollMode = View.OVER_SCROLL_NEVER
            addJavascriptInterface(LunaBridge(), "LunaHost")
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                    return assetLoader.shouldInterceptRequest(request.url)
                }

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    return request.url.host != "appassets.androidplatform.net"
                }
            }
        }
    }

    private fun hideSystemBars() {
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE
    }

    private fun start(intent: Intent, unavailable: String): Boolean = try {
        if (intent.resolveActivity(packageManager) == null) {
            Toast.makeText(this, unavailable, Toast.LENGTH_SHORT).show()
            false
        } else {
            startActivity(intent)
            true
        }
    } catch (_: Exception) {
        Toast.makeText(this, unavailable, Toast.LENGTH_SHORT).show()
        false
    }

    private inner class LunaBridge {
        @JavascriptInterface
        fun launchApp(appId: String): Boolean = runOnUiThreadResult {
            val component = when (appId) {
                "apple-tv" -> ComponentName("com.apple.atve.androidtv.appletv", "com.apple.atve.androidtv.appletv.MainActivity")
                "netflix" -> ComponentName("com.netflix.ninja", "com.netflix.ninja.MainActivity")
                "prime-video" -> ComponentName("com.amazon.amazonvideo.livingroom", "com.amazon.ignition.IgnitionActivity")
                "max" -> ComponentName("com.wbd.hbomax", "com.wbd.beam.BeamActivity")
                "youtube" -> ComponentName("com.google.android.youtube.tv", "com.google.android.apps.youtube.tv.activity.ShellActivity")
                "disney-plus" -> ComponentName("com.disney.disneyplus", "com.bamtechmedia.dominguez.main.MainActivity")
                else -> null
            }
            component != null && start(Intent(Intent.ACTION_MAIN).setComponent(component), "App is niet beschikbaar")
        }

        @JavascriptInterface
        fun openSystem(destination: String): Boolean = runOnUiThreadResult {
            val intent = when (destination) {
                "inputs" -> Intent("com.xgimi.action.hdmiPlayer")
                    .setComponent(ComponentName("com.xgimi.xhplayer", "com.xgimi.xhplayer.InputActivity"))
                "wifi" -> Intent(Settings.ACTION_WIFI_SETTINGS)
                "settings" -> Intent(Settings.ACTION_SETTINGS)
                else -> null
            }
            intent != null && start(intent, "Deze systeemfunctie is niet beschikbaar")
        }

        @JavascriptInterface
        fun exitToStockHome(): Boolean = runOnUiThreadResult {
            start(
                Intent(Intent.ACTION_MAIN)
                    .addCategory(Intent.CATEGORY_HOME)
                    .setComponent(ComponentName("com.google.android.tvlauncher", "com.google.android.tvlauncher.MainActivity")),
                "Stock Home is niet beschikbaar",
            )
        }
    }

    private fun runOnUiThreadResult(block: () -> Boolean): Boolean {
        if (Looper.myLooper() == Looper.getMainLooper()) return block()
        val latch = CountDownLatch(1)
        var result = false
        runOnUiThread {
            result = block()
            latch.countDown()
        }
        latch.await(3, TimeUnit.SECONDS)
        return result
    }
}
