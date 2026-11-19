package dev.openbracket

import android.widget.Button
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class TournamentTest {
    @Test fun parsesPublicTournamentResponses() {
        val rows = TournamentParser.parse("""{"data":[{"name":"Winter Open","game":"Chess","format":"SWISS"}]}""")
        assertEquals("Winter Open", rows.single().name)
        assertTrue(TournamentParser.parse("""{"data":[]}""").isEmpty())
    }
    @Test fun rejectsMalformedResponses() {
        assertThrows(Exception::class.java) { TournamentParser.parse("{}") }
    }
    @Test fun exposesNativeScreenAndRefreshControl() {
        val controller = Robolectric.buildActivity(MainActivity::class.java).create()
        val activity = controller.get()
        val root = activity.window.decorView
        val matches = ArrayList<android.view.View>()
        root.findViewsWithText(matches, activity.getString(R.string.refresh), android.view.View.FIND_VIEWS_WITH_TEXT)
        assertTrue(matches.any { it is Button })
        controller.destroy()
    }
}
