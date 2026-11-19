package dev.openbracket

import android.app.Activity
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class MainActivity : Activity() {
    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var status: TextView
    private lateinit var refresh: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val density = resources.displayMetrics.density
        val padding = (24 * density).toInt()
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(padding, padding, padding, padding)
            fitsSystemWindows = true
        }
        layout.addView(TextView(this).apply {
            text = getString(R.string.tournaments)
            textSize = 28f
            isAccessibilityHeading = true
        })
        layout.addView(TextView(this).apply { text = getString(R.string.demo_notice); textSize = 16f })
        status = TextView(this).apply {
            text = getString(R.string.loading)
            textSize = 18f
            accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
        }
        layout.addView(status)
        refresh = Button(this).apply {
            text = getString(R.string.refresh)
            minHeight = (48 * density).toInt()
            setOnClickListener { loadTournaments() }
        }
        layout.addView(refresh)
        setContentView(ScrollView(this).apply { addView(layout) })
        loadTournaments()
    }

    private fun loadTournaments() {
        status.text = getString(R.string.loading)
        refresh.isEnabled = false
        executor.execute {
            val result = runCatching {
                val connection = URL("${BuildConfig.API_BASE_URL}/api/v1/tournaments").openConnection() as HttpURLConnection
                try {
                    connection.connectTimeout = 5000
                    connection.readTimeout = 5000
                    connection.inputStream.bufferedReader().use { TournamentParser.parse(it.readText()) }
                } finally { connection.disconnect() }
            }
            runOnUiThread {
                if (!isDestroyed) {
                    status.text = result.fold(
                        onSuccess = { rows -> if (rows.isEmpty()) getString(R.string.empty) else rows.joinToString("\n\n") { "${it.name}\n${it.game} · ${it.format.lowercase().replace('_', ' ')}" } },
                        onFailure = { getString(R.string.unavailable) }
                    )
                    refresh.isEnabled = true
                }
            }
        }
    }

    override fun onDestroy() { executor.shutdownNow(); super.onDestroy() }
}
