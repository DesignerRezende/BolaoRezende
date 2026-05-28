const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";

function normalizeStatus(apiStatus) {
  const short = String(apiStatus || "").toUpperCase();

  if (["FT", "AET", "PEN"].includes(short)) {
    return "encerrado";
  }

  if (["1H", "2H", "HT", "ET", "BT", "P", "LIVE"].includes(short)) {
    return "ao vivo";
  }

  return "aberto";
}

function hasFinalScore(fixture) {
  const statusShort = fixture?.fixture?.status?.short;
  const homeGoals = fixture?.goals?.home;
  const awayGoals = fixture?.goals?.away;

  return (
    ["FT", "AET", "PEN"].includes(String(statusShort || "").toUpperCase()) &&
    homeGoals !== null &&
    homeGoals !== undefined &&
    awayGoals !== null &&
    awayGoals !== undefined
  );
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function supabaseRequest(path, options = {}) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados.");
  }

  const response = await fetchWithTimeout(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {})
    }
  });

  const text = await response.text();

  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    throw new Error(typeof data === "string" ? data : JSON.stringify(data));
  }

  return data;
}

async function getMatchesToSync(syncAll) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  start.setDate(start.getDate() - 1);
  end.setDate(end.getDate() + 2);

  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const query = [
    "select=id,home_team,away_team,match_date,status,api_football_fixture_id",
    "api_football_fixture_id=not.is.null",
    "order=match_date.asc"
  ];

  if (!syncAll) {
    query.push(`match_date=gte.${encodeURIComponent(startIso)}`);
    query.push(`match_date=lte.${encodeURIComponent(endIso)}`);
  }

  return supabaseRequest(`matches?${query.join("&")}`, {
    method: "GET"
  });
}

async function getFixtureFromApi(fixtureId) {
  const apiKey = process.env.APIFOOTBALL_KEY;

  if (!apiKey) {
    throw new Error("APIFOOTBALL_KEY não configurada.");
  }

  const response = await fetchWithTimeout(`${API_FOOTBALL_BASE_URL}/fixtures?id=${fixtureId}`, {
    method: "GET",
    headers: {
      "x-apisports-key": apiKey
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(JSON.stringify(data));
  }

  return data?.response?.[0] || null;
}

async function updateMatchFromFixture(match, fixture) {
  const fixtureStatus = fixture?.fixture?.status?.short || null;
  const systemStatus = normalizeStatus(fixtureStatus);

  const payload = {
    api_football_status: fixtureStatus,
    api_last_sync_at: new Date().toISOString()
  };

  if (hasFinalScore(fixture)) {
    payload.home_score = Number(fixture.goals.home);
    payload.away_score = Number(fixture.goals.away);
    payload.status = "encerrado";
  } else if (systemStatus === "ao vivo") {
    payload.status = "ao vivo";
  }

  return supabaseRequest(`matches?id=eq.${encodeURIComponent(match.id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export default async function handler(req, res) {
  try {
    const secret = req.query.secret;
    const syncAll = req.query.all === "1";

    if (!process.env.SYNC_RESULTS_SECRET || secret !== process.env.SYNC_RESULTS_SECRET) {
      return res.status(401).json({
        ok: false,
        error: "Acesso negado."
      });
    }

    const matches = await getMatchesToSync(syncAll);

    const result = {
      ok: true,
      checked: 0,
      updated: 0,
      skipped: 0,
      errors: []
    };

    for (const match of matches || []) {
      result.checked += 1;

      try {
        const fixture = await getFixtureFromApi(match.api_football_fixture_id);

        if (!fixture) {
          result.skipped += 1;
          continue;
        }

        await updateMatchFromFixture(match, fixture);
        result.updated += 1;
      } catch (error) {
        result.errors.push({
          match_id: match.id,
          fixture_id: match.api_football_fixture_id,
          error: error.message
        });
      }
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}