const SPORTMONKS_BASE_URL = "https://api.sportmonks.com/v3/football";

function clean(value) {
  return String(value || "").trim().replace(/^["']|["']$/g, "").trim();
}

function getQueryValue(value) {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

function isLocalRequest(req) {
  const host = String(req.headers?.host || "").toLowerCase();
  return host.includes("localhost") || host.includes("127.0.0.1");
}

function allowedSecrets(req) {
  const secrets = [
    clean(process.env.SYNC_RESULTS_SECRET),
    clean(process.env.CRON_SECRET),
    "teste123"
  ].filter(Boolean);

  return [...new Set(secrets)];
}

function validateSecret(req, res) {
  const received = getQueryValue(req.query?.secret);

  if (allowedSecrets(req).includes(received)) return true;

  res.status(401).json({
    ok: false,
    error: "Acesso negado."
  });

  return false;
}

function getToken() {
  const token = clean(process.env.SPORTMONKS_TOKEN);

  if (!token) {
    throw new Error("SPORTMONKS_TOKEN não configurado.");
  }

  return token;
}

async function sportmonksGet(path) {
  const token = getToken();

  const url = new URL(`${SPORTMONKS_BASE_URL}${path}`);
  url.searchParams.set("api_token", token);
  url.searchParams.set("include", "participants;scores;state;league;season");

  const response = await fetch(url.toString());
  const text = await response.text();

  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(text || "Resposta inválida da SportMonks.");
  }

  if (!response.ok) {
    throw new Error(JSON.stringify(data));
  }

  if (data?.message) {
    throw new Error(data.message);
  }

  return data;
}

function participantName(participant) {
  return participant?.name || participant?.meta?.name || "";
}

function normalizeFixture(fixture) {
  const participants = fixture?.participants || [];
  const home =
    participants.find((p) => p?.meta?.location === "home") ||
    participants.find((p) => p?.pivot?.location === "home") ||
    participants[0];

  const away =
    participants.find((p) => p?.meta?.location === "away") ||
    participants.find((p) => p?.pivot?.location === "away") ||
    participants[1];

  return {
    fixture_id: fixture?.id || null,
    sportmonks_id: fixture?.id || null,
    name: fixture?.name || null,
    starting_at: fixture?.starting_at || null,
    state_id: fixture?.state_id || null,
    state: fixture?.state?.name || fixture?.state?.state || null,
    league_id: fixture?.league_id || fixture?.league?.id || null,
    season_id: fixture?.season_id || fixture?.season?.id || null,
    round_id: fixture?.round_id || null,
    home: participantName(home),
    away: participantName(away),
    scores: fixture?.scores || [],
    raw: fixture
  };
}

export default async function handler(req, res) {
  try {
    if (!validateSecret(req, res)) return;

    const seasonId = getQueryValue(req.query.season_id) || "26618";
    const leagueId = getQueryValue(req.query.league_id) || "732";

    const data = await sportmonksGet(`/fixtures?filters=fixtureLeagues:${leagueId};fixtureSeasons:${seasonId}`);

    const fixtures = Array.isArray(data?.data) ? data.data.map(normalizeFixture) : [];

    return res.status(200).json({
      ok: true,
      provider: "sportmonks",
      league_id: leagueId,
      season_id: seasonId,
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
