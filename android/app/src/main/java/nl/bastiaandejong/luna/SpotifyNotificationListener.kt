package nl.bastiaandejong.luna

import android.content.ComponentName
import android.content.Context
import android.graphics.Bitmap
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Base64
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.min
import org.json.JSONObject

/**
 * A dormant bridge: Android binds it only after the owner grants Notification
 * Access. It observes Spotify's real media session and never polls Spotify or
 * a network service.
 */
class SpotifyNotificationListener : NotificationListenerService() {
    private var controller: MediaController? = null
    private val sessions by lazy { getSystemService(Context.MEDIA_SESSION_SERVICE) as MediaSessionManager }
    private val activeSessionsListener = MediaSessionManager.OnActiveSessionsChangedListener {
        // Spotify TV creates its media session before it becomes active.  A
        // notification callback alone therefore misses the moment playback
        // begins; Android's session-stack callback is the authoritative edge.
        refreshController()
    }
    private val callback = object : MediaController.Callback() {
        override fun onPlaybackStateChanged(state: PlaybackState?) = publish()
        override fun onMetadataChanged(metadata: android.media.MediaMetadata?) = publish()
        override fun onSessionDestroyed() = refreshController()
    }

    override fun onListenerConnected() {
        try {
            sessions.addOnActiveSessionsChangedListener(
                activeSessionsListener,
                ComponentName(this, SpotifyNotificationListener::class.java),
            )
        } catch (_: SecurityException) {
            // The normal notification callbacks still work when access is
            // being revoked while this service is alive.
        }
        refreshController()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (sbn.packageName == SPOTIFY_PACKAGE) refreshController()
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification) {
        if (sbn.packageName == SPOTIFY_PACKAGE) refreshController()
    }

    override fun onDestroy() {
        sessions.removeOnActiveSessionsChangedListener(activeSessionsListener)
        controller?.unregisterCallback(callback)
        SpotifySessionBridge.clear()
        super.onDestroy()
    }

    private fun refreshController() {
        val next = try {
            sessions.getActiveSessions(ComponentName(this, SpotifyNotificationListener::class.java))
                .firstOrNull { it.packageName == SPOTIFY_PACKAGE }
        } catch (_: SecurityException) { null }
        if (next?.sessionToken != controller?.sessionToken) {
            controller?.unregisterCallback(callback)
            controller = next
            controller?.registerCallback(callback)
        }
        publish()
    }

    private fun publish() {
        val active = controller
        val metadata = active?.metadata
        val playbackState = active?.playbackState
        val state = playbackState?.state
        val playing = state == PlaybackState.STATE_PLAYING || state == PlaybackState.STATE_BUFFERING
        SpotifySessionBridge.update(
            controller = active,
            connected = active != null,
            playing = playing,
            title = metadata?.getString(android.media.MediaMetadata.METADATA_KEY_TITLE).orEmpty(),
            artist = metadata?.getString(android.media.MediaMetadata.METADATA_KEY_ARTIST).orEmpty(),
            artworkDataUri = artworkDataUri(metadata),
            positionMs = playbackState?.position ?: 0L,
            durationMs = metadata?.getLong(android.media.MediaMetadata.METADATA_KEY_DURATION) ?: 0L,
        )
    }

    private fun artworkDataUri(metadata: android.media.MediaMetadata?): String {
        val bitmap = metadata?.getBitmap(android.media.MediaMetadata.METADATA_KEY_ART)
            ?: metadata?.getBitmap(android.media.MediaMetadata.METADATA_KEY_ALBUM_ART)
            ?: return ""
        val scaled = if (bitmap.width > 280 || bitmap.height > 280) {
            val scale = minOf(280f / bitmap.width, 280f / bitmap.height)
            Bitmap.createScaledBitmap(bitmap, (bitmap.width * scale).toInt(), (bitmap.height * scale).toInt(), true)
        } else bitmap
        return ByteArrayOutputStream().use { output ->
            scaled.compress(Bitmap.CompressFormat.JPEG, 82, output)
            "data:image/jpeg;base64," + Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
        }
    }

    companion object { private const val SPOTIFY_PACKAGE = "com.spotify.tv.android" }
}

object SpotifySessionBridge {
    @Volatile private var controller: MediaController? = null
    @Volatile private var payload = "{\"connected\":false,\"playing\":false,\"title\":\"\",\"artist\":\"\"}"
    @Volatile private var onChanged: ((String) -> Unit)? = null
    @Synchronized fun update(controller: MediaController?, connected: Boolean, playing: Boolean, title: String, artist: String, artworkDataUri: String, positionMs: Long, durationMs: Long) {
        this.controller = controller
        payload = JSONObject().apply {
            put("connected", connected)
            put("playing", playing)
            put("title", title)
            put("artist", artist)
            put("positionMs", max(0L, positionMs))
            put("durationMs", max(0L, durationMs))
            if (artworkDataUri.isNotEmpty()) put("artworkUrl", artworkDataUri)
        }.toString()
        onChanged?.invoke(payload)
    }

    fun snapshot(): String = payload
    fun observe(listener: ((String) -> Unit)?) { onChanged = listener }

    fun action(action: String): Boolean {
        val active = controller ?: return false
        return try {
            when (action) {
                "previous" -> active.transportControls.skipToPrevious()
                "next" -> active.transportControls.skipToNext()
                "play-pause" -> if (active.playbackState?.state == PlaybackState.STATE_PLAYING) active.transportControls.pause() else active.transportControls.play()
                else -> return false
            }
            true
        } catch (_: SecurityException) {
            false
        }
    }

    fun clear() = update(null, false, false, "", "", "", 0L, 0L)
}
