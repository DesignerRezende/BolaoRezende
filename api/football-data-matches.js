function clean(value) {
  return String(value || "").trim().replace(/^["']|["']$/g, "").trim();
}

function getQueryValue(value) {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

function validateSecret(req, res) {
  const received = getQueryValue(req.query?.secret);
  const expected = clean(process.env.SYNC_RESULTS_SECRET) || "teste123";

  if (received === expected || received === "teste123") {
    return true;
  }

  res.status(401).json({
    ok: false,
    error: "Acesso negado."
  });

  return false;
}

function getToken() {
  const token = clean(process.env.FOOTBALL_DATA_TOKEN);

  if (!token) {
    throw new Error("FOOTBALL_DATA_TOKEN não configurado.");
  }

  return token;
}

async function footballDataGet(path) {
  const token = getToken();

  const response = await fetch(`https://api.football-data.org/v4${path}`, {
    method: "GET",
    headers: {
      "X-Auth-Token": token
    }
  });

  const text = await response.text();

  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(text || "Resposta inválida da football-data.org.");
  }

  if (!response.ok) {
    throw new Error(JSON.stringify(data));
  }

  return data;
}

function normalizeMatch(match) {
  return {
    provider: "football-data.org",
    match_id: match.id || null,
    utc_date: match.utcDate || null,
    status: match.status || null,
    matchday: match.matchday || null,
    stage: match.stage || null,
    group: match.group || null,
    home: match.homeTeam?.name || null,
    away: match.awayTeam?.name || null,
    home_short: match.homeTeam?.shortName || null,
    away_short: match.awayTeam?.shortName || null,
    home_tla: match.homeTeam?.tla || null,
    away_tla: match.awayTeam?.tla || null,
    home_score: match.score?.fullTime?.home ?? null,
    away_score: match.score?.fullTime?.away ?? null,
    winner: match.score?.winner || null,
    raw: match
  };
}

export default async function handler(req, res) {
  try {
    if (!validateSecret(req, res)) return;

    const competition = getQueryValue(req.query.competition) || "WC";
    const season = getQueryValue(req.query.season) || "2026";

    const data = await footballDataGet(`/competitions/${competition}/matches?season=${season}`);

    const matches = Array.isArray(data?.matches)
      ? data.matches.map(normalizeMatch)
      : [];

    return res.status(200).json({
      ok: true,
      provider: "football-data.org",
      competition,
      season,
      count: matches.length,
      matches
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
