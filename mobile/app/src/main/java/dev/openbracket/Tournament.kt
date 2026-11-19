package dev.openbracket

import org.json.JSONObject

data class Tournament(val name: String, val game: String, val format: String)

object TournamentParser {
    fun parse(json: String): List<Tournament> {
        val data = JSONObject(json).getJSONArray("data")
        return (0 until data.length()).map { index ->
            val row = data.getJSONObject(index)
            Tournament(row.getString("name"), row.getString("game"), row.getString("format"))
        }
    }
}
