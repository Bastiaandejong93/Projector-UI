package nl.bastiaandejong.luna

import android.annotation.SuppressLint
import android.service.dreams.DreamService
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader

class LunaDreamService : DreamService() {
    private var webView: WebView? = null

    private val spotifyObserver: (String) -> Unit = { payload ->
        webView?.post {
            webView?.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('luna:spotify-playback', { detail: $payload }));",
                null,
            )
        }
    }

    private inner class DreamBridge {
        @JavascriptInterface
        fun getSpotifyPlayback(): String = SpotifySessionBridge.snapshot()

        @JavascriptInterface
        fun spotifyAction(action: String): Boolean = SpotifySessionBridge.action(action)
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        isInteractive = false
        isFullscreen = true
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        val dreamView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            overScrollMode = View.OVER_SCROLL_NEVER
            addJavascriptInterface(DreamBridge(), "LunaHost")
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                    return assetLoader.shouldInterceptRequest(request.url)
                }

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    return request.url.host != "appassets.androidplatform.net"
                }
            }
            loadUrl("https://appassets.androidplatform.net/index.html?mode=dream")
        }
        webView = dreamView
        SpotifySessionBridge.observe(spotifyObserver)
        setContentView(dreamView)
    }

    override fun onDetachedFromWindow() {
        SpotifySessionBridge.observe(null)
        webView?.destroy()
        webView = null
        super.onDetachedFromWindow()
    }
}
