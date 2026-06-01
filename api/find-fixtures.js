const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";

function cleanEnv(value) {
  return String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

function getQueryValue(value) {
  if (Array.isArray(value)) {
    return String(value[0] || "").trim();
  }

  return String(value || "").trim();
}

function isLocalRequest(req) {
  const host = String(req.headers?.host || "").toLowerCase();

  return (
    host.includes("localhost") ||
    host.includes("127.0.0.1") ||
    host.includes("[::1]")
  );
}

function getAllowedSecrets(req) {
  const secrets = [
    cleanEnv(process.env.SYNC_RESULTS_SECRET),
    cleanEnv(process.env.CRON_SECRET)
  ].filter(Boolean);

  if (isLocalRequest(req)) {
    secrets.push("teste123");
  }

  return [...new Set(secrets)];
}

function validateSecret(req, res) {
  const receivedSecret = getQueryValue(req.query?.secret);
  const allowedSecrets = getAllowedSecrets(req);

  if (allowedSecrets.some((secret) => secret === receivedSecret)) {
    return true;
  }

  res.status(401).json({
    ok: false,
    error: "Acesso negado."
  });

  return false;
}

function getApiKey() {
  const apiKey = cleanEnv(
    process.env.APIFOOTBALL_KEY ||
    process.env.API_FOOTBALL_KEY ||
    process.env.API_SPORTS_KEY
  );

  if (!apiKey) {
    throw new Error("APIFOOTBALL_KEY não configurada.");
  }

  return apiKey;
}

function normalizeFixture(fixture) {
  return {
    fixture_id: fixture?.fixture?.id || null,
    date: fixture?.fixture?.date || null,
    timestamp: fixture?.fixture?.timestamp || null,
    status_short: fixture?.fixture?.status?.short || null,
    status_long: fixture?.fixture?.status?.long || null,
    league_id: fixture?.league?.id || null,
    league_name: fixture?.league?.name || null,
    season: fixture?.league?.season || null,
    round: fixture?.league?.round || null,
    home: fixture?.teams?.home?.name || null,
    away: fixture?.teams?.away?.name || null,
    home_goals: fixture?.goals?.home ?? null,
    away_goals: fixture?.goals?.away ?? null,
    venue: fixture?.fixture?.venue?.name || null,
    city: fixture?.fixture?.venue?.city || null,
    raw: fixture
  };
}

async function fetchFixtures({ league, season, date, fixtureId }) {
  const apiKey = getApiKey();

  const url = new URL(`${API_FOOTBALL_BASE_URL}/fixtures`);

  if (fixtureId) {
    url.searchParams.set("id", String(fixtureId));
  } else {
    url.searchParams.set("league", String(league || "1"));
    url.searchParams.set("season", String(season || "2026"));

    if (date) {
      url.searchParams.set("date", String(date));
    }
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "x-apisports-key": apiKey
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(JSON.stringify(data));
  }

  if (data?.errors && Object.keys(data.errors).length > 0) {
    throw new Error(JSON.stringify(data.errors));
  }

  return data?.response || [];
}

export default async function handler(req, res) {
  try {
    const authorized = validateSecret(req, res);

    if (!authorized) {
      return;
    }

    const league = getQueryValue(req.query.league) || "1";
    const season = getQueryValue(req.query.season) || "2026";
    const date = getQueryValue(req.query.date) || "";
    const fixtureId = getQueryValue(req.query.id) || "";

    const fixtures = await fetchFixtures({
      league,
      season,
      date,
      fixtureId
    });

    const normalizedFixtures = fixtures.map(normalizeFixture);

    return res.status(200).json({
      ok: true,
      count: normalizedFixtures.length,
      league,
      season,
      date: date || null,
      fixture_id: fixtureId || null,
      fixtures: normalizedFixtures
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}