const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";

export default async function handler(req, res) {
  try {
    const secret = req.query.secret;
    const date = req.query.date;
    const league = req.query.league || "1";
    const season = req.query.season || "2026";

    if (!process.env.SYNC_RESULTS_SECRET || secret !== process.env.SYNC_RESULTS_SECRET) {
      return res.status(401).json({
        ok: false,
        error: "Acesso negado."
      });
    }

    if (!date) {
      return res.status(400).json({
        ok: false,
        error: "Informe a data. Exemplo: /api/find-fixtures?secret=teste123&date=2026-06-14"
      });
    }

    if (!process.env.APIFOOTBALL_KEY) {
      return res.status(500).json({
        ok: false,
        error: "APIFOOTBALL_KEY não configurada."
      });
    }

    const url = `${API_FOOTBALL_BASE_URL}/fixtures?league=${encodeURIComponent(league)}&season=${encodeURIComponent(season)}&date=${encodeURIComponent(date)}`;

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
      league: item.league?.name,
      season: item.league?.season,
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