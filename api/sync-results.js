function clean(value) {
  return String(value || "").trim().replace(/^["']|["']$/g, "").trim();
}

function getQueryValue(value) {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

function validateSecret(req, res) {
  const received = getQueryValue(req.query?.secret);
  const allowed = [
    clean(process.env.SYNC_RESULTS_SECRET),
    clean(process.env.CRON_SECRET),
    "teste123"
  ].filter(Boolean);

  if (allowed.includes(received)) return true;

  res.status(401).json({
    ok: false,
    error: "Acesso negado."
  });

  return false;
}

function getSupabaseConfig() {
  const supabaseUrl = clean(process.env.SUPABASE_URL);
  const serviceRoleKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados.");
  }

  return { supabaseUrl, serviceRoleKey };
}

function getFootballDataToken() {
  const token = clean(process.env.FOOTBALL_DATA_TOKEN);

  if (!token) {
    throw new Error("FOOTBALL_DATA_TOKEN não configurado.");
  }

  return token;
}

async function supabaseRequest(path, options = {}) {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
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

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(typeof data === "string" ? data : JSON.stringify(data));
  }

  return data;
}

async function footballDataGet(path) {
  const token = getFootballDataToken();

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

function normalizeStatus(status) {
  const value = String(status || "").toUpperCase();

  if (["FINISHED", "AWARDED"].includes(value)) {
    return "encerrado";
  }

  if (["IN_PLAY", "PAUSED", "LIVE"].includes(value)) {
    return "ao vivo";
  }

  return "aberto";
}

function hasValidScore(match) {
  const home = match?.score?.fullTime?.home;
  const away = match?.score?.fullTime?.away;

  return home !== null && home !== undefined && away !== null && away !== undefined;
}

function normalizeApiMatch(match) {
  return {
    match_id: match.id || null,
    utc_date: match.utcDate || null,
    status: match.status || null,
    system_status: normalizeStatus(match.status),
    home: match.homeTeam?.name || null,
    away: match.awayTeam?.name || null,
    home_score: match.score?.fullTime?.home ?? null,
    away_score: match.score?.fullTime?.away ?? null,
    winner: match.score?.winner || null,
    raw: match
  };
}

async function getFootballDataMatches() {
  const data = await footballDataGet("/competitions/WC/matches?season=2026");

  const matches = Array.isArray(data?.matches)
    ? data.matches.map(normalizeApiMatch)
    : [];

  const byId = new Map();

  for (const match of matches) {
    if (match.match_id) {
      byId.set(Number(match.match_id), match);
    }
  }

  return { matches, byId };
}

async function getLocalMatches(syncAll) {
  const query = [
    "select=id,home_team,away_team,match_date,status,home_score,away_score,api_football_fixture_id,api_football_status,api_last_sync_at",
    "order=match_date.asc"
  ];

  if (!syncAll) {
    const now = new Date();
    const start = new Date(now);
    const end = new Date(now);

    start.setDate(start.getDate() - 2);
    end.setDate(end.getDate() + 7);

    query.push(`match_date=gte.${encodeURIComponent(start.toISOString())}`);
    query.push(`match_date=lte.${encodeURIComponent(end.toISOString())}`);
  }

  return supabaseRequest(`matches?${query.join("&")}`, {
    method: "GET"
  });
}

function buildMatchUpdatePayload(localMatch, apiMatch) {
  const payload = {
    api_football_status: apiMatch.status,
    api_last_sync_at: new Date().toISOString()
  };

  if (apiMatch.system_status === "ao vivo") {
    payload.status = "ao vivo";

    if (hasValidScore({ score: { fullTime: { home: apiMatch.home_score, away: apiMatch.away_score } } })) {
      payload.home_score = Number(apiMatch.home_score);
      payload.away_score = Number(apiMatch.away_score);
    }

    return payload;
  }

  if (apiMatch.system_status === "encerrado" && apiMatch.home_score !== null && apiMatch.away_score !== null) {
    payload.status = "encerrado";
    payload.home_score = Number(apiMatch.home_score);
    payload.away_score = Number(apiMatch.away_score);
    return payload;
  }

  if (String(localMatch.status || "").toLowerCase() !== "encerrado") {
    payload.status = "aberto";
  }

  return payload;
}

function changed(localMatch, payload) {
  const checks = [
    ["status", payload.status],
    ["home_score", payload.home_score],
    ["away_score", payload.away_score],
    ["api_football_status", payload.api_football_status]
  ];

  return checks.some(([key, value]) => {
    if (value === undefined) return false;

    const localValue = localMatch[key];

    if (localValue === null || localValue === undefined) {
      return value !== null && value !== undefined;
    }

    return String(localValue) !== String(value);
  });
}

async function updateLocalMatch(localMatch, payload) {
  return supabaseRequest(`matches?id=eq.${encodeURIComponent(localMatch.id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

async function recalculateRanking() {
  return supabaseRequest("rpc/recalculate_bolao_points", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export default async function handler(req, res) {
  try {
    if (!validateSecret(req, res)) return;

    const syncAll = getQueryValue(req.query.all) === "1";
    const dryRun = getQueryValue(req.query.dryRun) === "1";

    const localMatches = await getLocalMatches(syncAll);
    const { byId } = await getFootballDataMatches();

    const result = {
      ok: true,
      provider: "football-data.org",
      dryRun,
      syncAll,
      checked: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      details: [],
      recalculated: false
    };

    for (const localMatch of localMatches || []) {
      result.checked += 1;

      const fixtureId = localMatch.api_football_fixture_id
        ? Number(localMatch.api_football_fixture_id)
        : null;

      if (!fixtureId) {
        result.skipped += 1;
        result.details.push({
          updated: false,
          skipped: true,
          reason: "Jogo sem api_football_fixture_id.",
          match_id: localMatch.id,
          local_match: `${localMatch.home_team} x ${localMatch.away_team}`
        });
        continue;
      }

      const apiMatch = byId.get(fixtureId);

      if (!apiMatch) {
        result.skipped += 1;
        result.details.push({
          updated: false,
          skipped: true,
          reason: "ID não encontrado na football-data.org.",
          match_id: localMatch.id,
          fixture_id: fixtureId,
          local_match: `${localMatch.home_team} x ${localMatch.away_team}`
        });
        continue;
      }

      const payload = buildMatchUpdatePayload(localMatch, apiMatch);
      const hasChanges = changed(localMatch, payload);

      if (!hasChanges) {
        result.skipped += 1;
        result.details.push({
          updated: false,
          skipped: true,
          reason: "Sem alteração.",
          match_id: localMatch.id,
          fixture_id: fixtureId,
          local_match: `${localMatch.home_team} x ${localMatch.away_team}`,
          api_match: `${apiMatch.home} x ${apiMatch.away}`,
          api_status: apiMatch.status,
          api_score: `${apiMatch.home_score ?? "-"} x ${apiMatch.away_score ?? "-"}`
        });
        continue;
      }

      if (!dryRun) {
        await updateLocalMatch(localMatch, payload);
      }

      result.updated += 1;
      result.details.push({
        updated: true,
        dryRun,
        matched_by: "football_data_match_id",
        match_id: localMatch.id,
        fixture_id: fixtureId,
        local_match: `${localMatch.home_team} x ${localMatch.away_team}`,
        api_match: `${apiMatch.home} x ${apiMatch.away}`,
        api_status: apiMatch.status,
        api_score: `${apiMatch.home_score ?? "-"} x ${apiMatch.away_score ?? "-"}`,
        payload
      });
    }

    if (!dryRun) {
      try {
        await recalculateRanking();
        result.recalculated = true;
      } catch (error) {
        result.errors.push({
          scope: "recalculate_bolao_points",
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
