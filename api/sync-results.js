const API_FOOTBALL_BASE_URL = "https://v3.football.api-sports.io";

const DEFAULT_COMPETITIONS = [
  {
    league: "1",
    season: "2026",
    label: "World Cup"
  },
  {
    league: "2",
    season: "2025",
    label: "UEFA Champions League"
  }
];

function normalizeStatus(apiStatus) {
  const short = String(apiStatus || "").toUpperCase();

  if (["FT", "AET", "PEN"].includes(short)) {
    return "encerrado";
  }

  if (["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT"].includes(short)) {
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

function hasLiveScore(fixture) {
  const statusShort = String(fixture?.fixture?.status?.short || "").toUpperCase();
  const homeGoals = fixture?.goals?.home;
  const awayGoals = fixture?.goals?.away;

  return (
    ["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "INT"].includes(statusShort) &&
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

async function supabaseRpc(functionName, body = {}) {
  return supabaseRequest(`rpc/${functionName}`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

function getIsoWithoutMilliseconds(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function getMatchesToSync(syncAll) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  start.setDate(start.getDate() - 2);
  end.setDate(end.getDate() + 7);

  const startIso = getIsoWithoutMilliseconds(start);
  const endIso = getIsoWithoutMilliseconds(end);

  const query = [
    "select=id,home_team,away_team,match_date,status,home_score,away_score,api_football_fixture_id,api_football_status,api_last_sync_at",
    "order=match_date.asc"
  ];

  if (!syncAll) {
    query.push("status=neq.encerrado");
  }

  return supabaseRequest(`matches?${query.join("&")}`, {
    method: "GET"
  });
}

function parseCompetitionsFromQuery(reqQuery) {
  const directLeague = reqQuery.league;
  const directSeason = reqQuery.season;

  if (directLeague && directSeason) {
    return [
      {
        league: String(directLeague),
        season: String(directSeason),
        label: `league ${directLeague}`
      }
    ];
  }

  const competitionsRaw = String(reqQuery.competitions || "").trim();

  if (competitionsRaw) {
    return competitionsRaw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const [league, season] = item.split(":").map((part) => String(part || "").trim());

        return {
          league,
          season,
          label: `league ${league}`
        };
      })
      .filter((item) => item.league && item.season);
  }

  return DEFAULT_COMPETITIONS;
}

function getApiKey() {
  const apiKey = process.env.APIFOOTBALL_KEY;

  if (!apiKey) {
    throw new Error("APIFOOTBALL_KEY não configurada.");
  }

  return apiKey;
}

async function getFixtureFromApi(fixtureId) {
  const apiKey = getApiKey();

  const response = await fetchWithTimeout(`${API_FOOTBALL_BASE_URL}/fixtures?id=${encodeURIComponent(fixtureId)}`, {
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

async function getFixturesByCompetitionAndDate({ league, season, date }) {
  const apiKey = getApiKey();

  const params = new URLSearchParams({
    league: String(league),
    season: String(season),
    date: String(date)
  });

  const response = await fetchWithTimeout(`${API_FOOTBALL_BASE_URL}/fixtures?${params.toString()}`, {
    method: "GET",
    headers: {
      "x-apisports-key": apiKey
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(JSON.stringify(data));
  }

  return data?.response || [];
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-_.]/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function removeCommonClubWords(value) {
  return normalizeText(value)
    .replace(/\bfc\b/g, "")
    .replace(/\bsc\b/g, "")
    .replace(/\bac\b/g, "")
    .replace(/\bcf\b/g, "")
    .replace(/\bclub\b/g, "")
    .replace(/\bfutebol\b/g, "")
    .replace(/\bfootball\b/g, "")
    .replace(/\bsaint\b/g, "st")
    .replace(/\bgermain\b/g, "germain")
    .replace(/\s+/g, " ")
    .trim();
}

function splitWords(value) {
  return removeCommonClubWords(value)
    .split(" ")
    .map((word) => word.trim())
    .filter((word) => word.length >= 3);
}

function teamSimilarity(a, b) {
  const normalizedA = removeCommonClubWords(a);
  const normalizedB = removeCommonClubWords(b);

  if (!normalizedA || !normalizedB) return 0;

  if (normalizedA === normalizedB) return 100;
  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) return 90;

  const wordsA = splitWords(normalizedA);
  const wordsB = splitWords(normalizedB);

  if (!wordsA.length || !wordsB.length) return 0;

  let hits = 0;

  for (const wordA of wordsA) {
    if (wordsB.some((wordB) => wordA === wordB || wordA.includes(wordB) || wordB.includes(wordA))) {
      hits += 1;
    }
  }

  const denominator = Math.max(wordsA.length, wordsB.length);

  return Math.round((hits / denominator) * 100);
}

function getFixtureTeams(fixture) {
  return {
    home: fixture?.teams?.home?.name || "",
    away: fixture?.teams?.away?.name || ""
  };
}

function getMatchScoreForFixture(match, fixture) {
  const apiTeams = getFixtureTeams(fixture);

  const directHomeScore =
    teamSimilarity(match.home_team, apiTeams.home) +
    teamSimilarity(match.away_team, apiTeams.away);

  const invertedHomeScore =
    teamSimilarity(match.home_team, apiTeams.away) +
    teamSimilarity(match.away_team, apiTeams.home);

  return {
    score: Math.max(directHomeScore, invertedHomeScore),
    inverted: invertedHomeScore > directHomeScore,
    directHomeScore,
    invertedHomeScore
  };
}

function dateToYmd(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function getSearchDates(matchDateValue, forcedDate) {
  if (forcedDate) {
    return [String(forcedDate)];
  }

  const matchDate = new Date(matchDateValue);

  if (Number.isNaN(matchDate.getTime())) {
    return [];
  }

  const previous = new Date(matchDate);
  const next = new Date(matchDate);

  previous.setDate(previous.getDate() - 1);
  next.setDate(next.getDate() + 1);

  return [...new Set([
    dateToYmd(previous),
    dateToYmd(matchDate),
    dateToYmd(next)
  ].filter(Boolean))];
}

async function findFixtureAutomatically(match, competitions, forcedDate) {
  const searchDates = getSearchDates(match.match_date, forcedDate);

  let best = null;

  for (const competition of competitions) {
    for (const date of searchDates) {
      const fixtures = await getFixturesByCompetitionAndDate({
        league: competition.league,
        season: competition.season,
        date
      });

      for (const fixture of fixtures) {
        const matchScore = getMatchScoreForFixture(match, fixture);

        if (!best || matchScore.score > best.score) {
          best = {
            fixture,
            score: matchScore.score,
            inverted: matchScore.inverted,
            competition,
            searchDate: date,
            directHomeScore: matchScore.directHomeScore,
            invertedHomeScore: matchScore.invertedHomeScore
          };
        }
      }
    }
  }

  if (!best || best.score < 120) {
    return null;
  }

  return best;
}

function buildPayloadFromFixture(match, fixture, options = {}) {
  const fixtureStatus = fixture?.fixture?.status?.short || null;
  const systemStatus = normalizeStatus(fixtureStatus);

  const payload = {
    api_football_status: fixtureStatus,
    api_last_sync_at: new Date().toISOString()
  };

  if (fixture?.fixture?.id) {
    payload.api_football_fixture_id = fixture.fixture.id;
  }

  const homeGoals = fixture?.goals?.home;
  const awayGoals = fixture?.goals?.away;

  const shouldInvert = Boolean(options.inverted);

  if (hasFinalScore(fixture)) {
    payload.home_score = Number(shouldInvert ? awayGoals : homeGoals);
    payload.away_score = Number(shouldInvert ? homeGoals : awayGoals);
    payload.status = "encerrado";
    return payload;
  }

  if (hasLiveScore(fixture)) {
    payload.home_score = Number(shouldInvert ? awayGoals : homeGoals);
    payload.away_score = Number(shouldInvert ? homeGoals : awayGoals);
  }

  if (systemStatus === "ao vivo") {
    payload.status = "ao vivo";
  }

  if (systemStatus === "aberto" && String(match.status || "").toLowerCase() !== "encerrado") {
    payload.status = "aberto";
  }

  return payload;
}

async function updateMatchFromFixture(match, fixture, options = {}) {
  const payload = buildPayloadFromFixture(match, fixture, options);

  return supabaseRequest(`matches?id=eq.${encodeURIComponent(match.id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

async function syncMatch(match, competitions, forcedDate) {
  if (match.api_football_fixture_id) {
    const fixture = await getFixtureFromApi(match.api_football_fixture_id);

    if (!fixture) {
      return {
        updated: false,
        skipped: true,
        reason: "Fixture ID não encontrado na API.",
        match_id: match.id,
        fixture_id: match.api_football_fixture_id
      };
    }

    await updateMatchFromFixture(match, fixture, {
      inverted: false
    });

    return {
      updated: true,
      skipped: false,
      matched_by: "fixture_id",
      match_id: match.id,
      fixture_id: fixture.fixture?.id,
      api_status: fixture.fixture?.status?.short || null,
      home: fixture.teams?.home?.name || null,
      away: fixture.teams?.away?.name || null,
      goals: fixture.goals || null
    };
  }

  const found = await findFixtureAutomatically(match, competitions, forcedDate);

  if (!found) {
    return {
      updated: false,
      skipped: true,
      reason: "Nenhum fixture compatível encontrado por nome/data.",
      match_id: match.id,
      fixture_id: null,
      local_match: `${match.home_team} x ${match.away_team}`,
      local_date: match.match_date
    };
  }

  await updateMatchFromFixture(match, found.fixture, {
    inverted: found.inverted
  });

  return {
    updated: true,
    skipped: false,
    matched_by: "team_name_and_date",
    match_id: match.id,
    fixture_id: found.fixture.fixture?.id,
    api_status: found.fixture.fixture?.status?.short || null,
    score: found.score,
    inverted: found.inverted,
    competition: found.competition,
    search_date: found.searchDate,
    local_match: `${match.home_team} x ${match.away_team}`,
    api_match: `${found.fixture.teams?.home?.name || ""} x ${found.fixture.teams?.away?.name || ""}`,
    goals: found.fixture.goals || null
  };
}

export default async function handler(req, res) {
  try {
    const secret = req.query.secret;
    const syncAll = req.query.all === "1";
    const dryRun = req.query.dryRun === "1";
    const forcedDate = req.query.date || null;
    const competitions = parseCompetitionsFromQuery(req.query || {});

    if (!process.env.SYNC_RESULTS_SECRET || secret !== process.env.SYNC_RESULTS_SECRET) {
      return res.status(401).json({
        ok: false,
        error: "Acesso negado."
      });
    }

    const matches = await getMatchesToSync(syncAll);

    const result = {
      ok: true,
      dryRun,
      syncAll,
      forcedDate,
      competitions,
      checked: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      details: [],
      recalculated: false
    };

    for (const match of matches || []) {
      result.checked += 1;

      try {
        if (dryRun) {
          const found = match.api_football_fixture_id
            ? {
                fixture: await getFixtureFromApi(match.api_football_fixture_id),
                score: 200,
                inverted: false,
                matched_by: "fixture_id"
              }
            : await findFixtureAutomatically(match, competitions, forcedDate);

          if (!found || !found.fixture) {
            result.skipped += 1;
            result.details.push({
              updated: false,
              skipped: true,
              dryRun: true,
              reason: "Nenhum fixture compatível encontrado.",
              match_id: match.id,
              local_match: `${match.home_team} x ${match.away_team}`,
              local_date: match.match_date
            });
            continue;
          }

          result.skipped += 1;
          result.details.push({
            updated: false,
            skipped: true,
            dryRun: true,
            would_update: true,
            matched_by: match.api_football_fixture_id ? "fixture_id" : "team_name_and_date",
            match_id: match.id,
            fixture_id: found.fixture.fixture?.id,
            api_status: found.fixture.fixture?.status?.short || null,
            score: found.score,
            inverted: found.inverted,
            local_match: `${match.home_team} x ${match.away_team}`,
            api_match: `${found.fixture.teams?.home?.name || ""} x ${found.fixture.teams?.away?.name || ""}`,
            goals: found.fixture.goals || null
          });
          continue;
        }

        const syncResult = await syncMatch(match, competitions, forcedDate);

        result.details.push(syncResult);

        if (syncResult.updated) {
          result.updated += 1;
        } else {
          result.skipped += 1;
        }
      } catch (error) {
        result.errors.push({
          match_id: match.id,
          fixture_id: match.api_football_fixture_id,
          local_match: `${match.home_team} x ${match.away_team}`,
          error: error.message
        });
      }
    }

    if (!dryRun) {
      try {
        await supabaseRpc("recalculate_bolao_points");
        result.recalculated = true;
      } catch (error) {
        result.errors.push({
          stage: "recalculate_bolao_points",
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
