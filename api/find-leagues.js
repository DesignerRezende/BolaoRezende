const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";

export default async function handler(req, res) {
  try {
    const secret = req.query.secret;
    const search = req.query.search || "world cup";

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

    const url = `${API_FOOTBALL_BASE_URL}/leagues?search=${encodeURIComponent(search)}`;

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

    const leagues = (data.response || []).map((item) => ({
      league_id: item.league?.id,
      name: item.league?.name,
      type: item.league?.type,
      country: item.country?.name,
      seasons: (item.seasons || []).map((season) => ({
        year: season.year,
        start: season.start,
        end: season.end,
        current: season.current
      }))
    }));

    return res.status(200).json({
      ok: true,
      search,
      count: leagues.length,
      leagues
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}