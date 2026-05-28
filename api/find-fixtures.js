const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";

export default async function handler(req, res) {
  try {
    const secret = req.query.secret;
    const date = req.query.date || null;
    const league = req.query.league || "1";
    const season = req.query.season || "2026";

    if (!process.env.SYNC_RESULTS_SECRET || secret !== process.env.SYNC_RESULTS_SECRET) {
      return res.status(401).json({
        ok: false,
        error: "Acesso negado."
      });
    }

    if (!process.env.APIFOOTBALL_KEY) {
      return res.status(500).json({
        ok: false,
        error: "APIFOOTBALL_KEY não configurada."
      });
    }

    const params = new URLSearchParams({
      league,
      season
    });

    if (date) {
      params.set("date", date);
    }

    const url = `${API_FOOTBALL_BASE_URL}/fixtures?${params.toString()}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-apisports-key": process.env.APIFOOTBALL_KEY
      }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: data
      });
    }

    const fixtures = (data.response || []).map((item) => ({
      fixture_id: item.fixture?.id,
      date: item.fixture?.date,
      status: item.fixture?.status?.short,
      league_id: item.league?.id,
      league: item.league?.name,
      season: item.league?.season,
      round: item.league?.round,
      home: item.teams?.home?.name,
      away: item.teams?.away?.name,
      home_goals: item.goals?.home,
      away_goals: item.goals?.away
    }));

    return res.status(200).json({
      ok: true,
      league,
      season,
      date,
      count: fixtures.length,
      fixtures
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}