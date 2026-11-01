package nl.bastiaandejong.luna

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import android.os.Bundle
import android.os.Looper
import android.provider.Settings
import android.util.Base64
import android.view.View
import android.view.KeyEvent
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.webkit.WebViewAssetLoader
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var lastDpadKeyCode = KeyEvent.KEYCODE_UNKNOWN
    private var lastDpadActionAt = 0L

    companion object {
        // A short physical press should always move exactly once. Repeats only begin
        // after a deliberate hold and stay calm enough for a projector remote.
        private const val DPAD_INITIAL_REPEAT_DELAY_MS = 650L
        private const val DPAD_REPEAT_INTERVAL_MS = 220L
        private const val DPAD_BOUNCE_INTERVAL_MS = 400L
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        hideSystemBars()
        webView = createWebView()
        setContentView(webView)
        SpotifySessionBridge.observe { payload -> pushSpotifyPlayback(payload) }
        webView.loadUrl("https://appassets.androidplatform.net/index.html")
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    override fun onResume() {
        super.onResume()
        // Returning from Play Store or another app refreshes Luna's local app catalogue.
        // The page can safely ignore this before its JavaScript has finished loading.
        webView.evaluateJavascript("window.dispatchEvent(new Event('luna:refresh-apps'));", null)
        pushSpotifyPlayback(SpotifySessionBridge.snapshot())
    }

    override fun onDestroy() {
        SpotifySessionBridge.observe(null)
        super.onDestroy()
    }

    private fun pushSpotifyPlayback(payload: String) {
        if (!::webView.isInitialized) return
        runOnUiThread {
            webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('luna:spotify-playback', { detail: $payload }));",
                null,
            )
        }
    }


    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val arrowKey = when (event.keyCode) {
            KeyEvent.KEYCODE_DPAD_LEFT -> "ArrowLeft"
            KeyEvent.KEYCODE_DPAD_RIGHT -> "ArrowRight"
            KeyEvent.KEYCODE_DPAD_UP -> "ArrowUp"
            KeyEvent.KEYCODE_DPAD_DOWN -> "ArrowDown"
            else -> null
        } ?: return super.dispatchKeyEvent(event)

        if (event.action == KeyEvent.ACTION_UP) return true
        if (event.action != KeyEvent.ACTION_DOWN) return super.dispatchKeyEvent(event)

        val now = event.eventTime
        val isInitialPress = event.repeatCount == 0
        val isDuplicateInitialPress =
            event.keyCode == lastDpadKeyCode && now - lastDpadActionAt < DPAD_BOUNCE_INTERVAL_MS
        val isHeldLongEnough = now - event.downTime >= DPAD_INITIAL_REPEAT_DELAY_MS
        val repeatIsDue = now - lastDpadActionAt >= DPAD_REPEAT_INTERVAL_MS

        if ((isInitialPress && !isDuplicateInitialPress) || (!isInitialPress && isHeldLongEnough && repeatIsDue)) {
            lastDpadKeyCode = event.keyCode
            lastDpadActionAt = now
            webView.evaluateJavascript(
                "document.dispatchEvent(new KeyboardEvent('keydown', { key: '$arrowKey', bubbles: true, cancelable: true }));",
                null,
            )
        }
        return true
    }

    override fun onBackPressed() {
        // Android TV would otherwise finish this Activity. Luna's focus controller owns Back:
        // it closes drawers and confirmation panels, while Back on the app row deliberately stays put.
        webView.evaluateJavascript(
            "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));",
            null,
        )
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
        fun launchComponent(componentName: String): Boolean = runOnUiThreadResult {
            val component = ComponentName.unflattenFromString(componentName)
            component != null && start(Intent(Intent.ACTION_MAIN).setComponent(component), "App is niet beschikbaar")
        }

        @JavascriptInterface
        fun getSpotifyPlayback(): String = SpotifySessionBridge.snapshot()

        @JavascriptInterface
        fun spotifyAction(action: String): Boolean = SpotifySessionBridge.action(action)

        @JavascriptInterface
        fun listLaunchableApps(): String = runOnUiThreadResultValue {
            val excludedPackages = setOf(
                packageName,
                "com.google.android.tvlauncher",
                "com.android.tv.settings",
            )
            val launchIntents = listOf(
                Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER),
            )
            val byPackage = linkedMapOf<String, android.content.pm.ResolveInfo>()
            launchIntents.flatMap { packageManager.queryIntentActivities(it, PackageManager.MATCH_ALL) }
                .forEach { resolveInfo ->
                    val activity = resolveInfo.activityInfo ?: return@forEach
                    if (activity.exported && activity.packageName !in excludedPackages) {
                        byPackage.putIfAbsent(activity.packageName, resolveInfo)
                    }
                }

            val apps = byPackage.values
                .map { resolveInfo ->
                    val activity = resolveInfo.activityInfo
                    val label = resolveInfo.loadLabel(packageManager).toString().ifBlank { activity.packageName }
                    Triple(label, ComponentName(activity.packageName, activity.name), resolveInfo.loadIcon(packageManager))
                }
                .sortedBy { it.first.lowercase() }

            JSONArray().apply {
                apps.forEach { (label, component, icon) ->
                    put(JSONObject().apply {
                        put("label", label)
                        put("component", component.flattenToString())
                        put("icon", drawableDataUri(icon))
                    })
                }
            }.toString()
        }

        @JavascriptInterface
        fun openSystem(destination: String): Boolean = runOnUiThreadResult {
            val intent = when (destination) {
                "inputs" -> Intent("com.xgimi.action.hdmiPlayer")
                    .setComponent(ComponentName("com.xgimi.xhplayer", "com.xgimi.xhplayer.InputActivity"))
                "wifi" -> Intent(Settings.ACTION_WIFI_SETTINGS)
                "settings" -> Intent(Settings.ACTION_SETTINGS)
                "spotify-notifications" -> Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
                "screensaver" -> Intent(Settings.ACTION_DREAM_SETTINGS)
                "atmosphere" -> Intent("com.xgimi.atmosphere.action.MAIN_UI")
                    .setComponent(ComponentName("com.xgimi.atmosphere", "com.xgimi.atmosphere.view.ScreensaverActivity"))
                else -> null
            }
            when {
                intent == null -> false
                destination == "atmosphere" && intent.resolveActivity(packageManager) == null -> false
                else -> start(intent, "Deze systeemfunctie is niet beschikbaar")
            }
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

    private fun runOnUiThreadResultValue(block: () -> String): String {
        if (Looper.myLooper() == Looper.getMainLooper()) return block()
        val latch = CountDownLatch(1)
        var result = "[]"
        runOnUiThread {
            result = block()
            latch.countDown()
        }
        latch.await(3, TimeUnit.SECONDS)
        return result
    }

    private fun drawableDataUri(drawable: Drawable): String {
        return try {
            val size = 96
            val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            drawable.setBounds(0, 0, size, size)
            drawable.draw(canvas)
            val bytes = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, bytes)
            "data:image/png;base64," + Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP)
        } catch (_: Exception) {
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADElEQVQIHWP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC"
        }
    }
}
