let db = null;

const DEFAULT_GUESS_DEADLINE_CONFIG = {
  mode: "previous_day",
  amount: 1,
  unit: "day",
  previousDayTime: "23:59"
};

function getSupabaseClient() {
  const isConfigured =
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    !SUPABASE_URL.includes("COLE_AQUI") &&
    !SUPABASE_ANON_KEY.includes("COLE_AQUI");

  if (!isConfigured) {
    throw new Error("Configure SUPABASE_URL e SUPABASE_ANON_KEY em js/config.js.");
  }

  if (!window.supabase) {
    throw new Error("Biblioteca Supabase não carregada.");
  }

  if (!db) {
    db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  return db;
}

async function createParticipant(participant) {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("participants")
    .insert({
      name: participant.name,
      store_sector: participant.store_sector,
      phone: participant.phone || null
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function listMatches() {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("matches")
    .select("*")
    .order("match_date", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function listParticipantGuesses(participantId) {
  if (!participantId) return [];

  const client = getSupabaseClient();

  const { data, error } = await client
    .from("guesses")
    .select("*")
    .eq("participant_id", participantId);

  if (error) throw error;
  return data || [];
}

async function listWorldCupTeams() {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("world_cup_teams")
    .select("id, name, code, flag_url, flag_emoji, group_name")
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function listBrazilSquadPlayers() {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("brazil_squad_players")
    .select("id, name, position")
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function getParticipantPrediction(participantId) {
  if (!participantId) return null;

  const client = getSupabaseClient();

  const { data, error } = await client
    .from("participant_predictions")
    .select(`
      *,
      champion_team:world_cup_teams (
        id,
        name,
        code,
        flag_url,
        flag_emoji,
        group_name
      ),
      top_scorer_player:brazil_squad_players (
        id,
        name,
        position
      )
    `)
    .eq("participant_id", participantId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function listParticipantPredictions() {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("participant_predictions")
    .select("*");

  if (error) throw error;
  return data || [];
}

async function getCupFinalResults() {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("bolao_special_results")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (!error) return data || null;

  const { data: legacyData, error: legacyError } = await client
    .from("cup_final_results")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (legacyError) throw error;
  return legacyData || null;
}

async function saveCupFinalResults(payload) {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("bolao_special_results")
    .upsert({
      id: true,
      ...payload,
      updated_at: new Date().toISOString()
    }, { onConflict: "id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function saveParticipantPrediction(payload) {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("participant_predictions")
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error("Erro ao salvar participant_predictions:", error);
    throw error;
  }

  return data;
}

async function registerGuess(guess) {
  const client = getSupabaseClient();

  const participantId = guess.participant_id;
  const matchId = guess.match_id;
  const homeScore = Number(guess.home_score_guess);
  const awayScore = Number(guess.away_score_guess);

  if (!participantId) {
    throw new Error("Participante não identificado.");
  }

  if (!matchId) {
    throw new Error("Jogo não identificado.");
  }

  if (!Number.isFinite(homeScore) || homeScore < 0) {
    throw new Error("Placar A inválido.");
  }

  if (!Number.isFinite(awayScore) || awayScore < 0) {
    throw new Error("Placar B inválido.");
  }

  const now = new Date().toISOString();

  const { data: existingGuess, error: findError } = await client
    .from("guesses")
    .select("*")
    .eq("participant_id", participantId)
    .eq("match_id", matchId)
    .maybeSingle();

  if (findError) {
    console.error("Erro ao procurar palpite existente:", findError);
    throw findError;
  }

  if (existingGuess && existingGuess.id) {
    const { data, error } = await client
      .from("guesses")
      .update({
        home_score_guess: homeScore,
        away_score_guess: awayScore,
        updated_at: now
      })
      .eq("id", existingGuess.id)
      .select()
      .single();

    if (error) {
      console.error("Erro ao atualizar palpite:", error);
      throw error;
    }

    return data;
  }

  const { data, error } = await client
    .from("guesses")
    .insert({
      participant_id: participantId,
      match_id: matchId,
      home_score_guess: homeScore,
      away_score_guess: awayScore,
      created_at: now,
      updated_at: now
    })
    .select()
    .single();

  if (error) {
    console.error("Erro ao criar palpite:", error);
    throw error;
  }

  return data;
}

/* =========================================================
   CONFIGURAÇÃO GLOBAL E POR JOGO DO PRAZO DOS PALPITES
========================================================= */

function normalizeGuessDeadlineConfig(config) {
  const raw = config && typeof config === "object" ? config : {};

  const mode = ["previous_day", "relative"].includes(raw.mode)
    ? raw.mode
    : DEFAULT_GUESS_DEADLINE_CONFIG.mode;

  const unit = ["minutes", "hours", "day"].includes(raw.unit)
    ? raw.unit
    : DEFAULT_GUESS_DEADLINE_CONFIG.unit;

  const amountNumber = Number(raw.amount);
  const amount = Number.isFinite(amountNumber) && amountNumber > 0
    ? Math.floor(amountNumber)
    : DEFAULT_GUESS_DEADLINE_CONFIG.amount;

  const previousDayTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(raw.previousDayTime || ""))
    ? String(raw.previousDayTime)
    : DEFAULT_GUESS_DEADLINE_CONFIG.previousDayTime;

  if (mode === "previous_day") {
    return {
      mode: "previous_day",
      amount: 1,
      unit: "day",
      previousDayTime
    };
  }

  return {
    mode: "relative",
    amount,
    unit: unit === "hours" ? "hours" : "minutes",
    previousDayTime
  };
}

async function getGuessDeadlineConfig() {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("app_settings")
    .select("value")
    .eq("key", "guess_deadline_config")
    .maybeSingle();

  if (error) throw error;

  return normalizeGuessDeadlineConfig(data?.value || DEFAULT_GUESS_DEADLINE_CONFIG);
}

async function saveGuessDeadlineConfig(config) {
  const client = getSupabaseClient();
  const normalizedConfig = normalizeGuessDeadlineConfig(config);

  const { data, error } = await client
    .from("app_settings")
    .upsert({
      key: "guess_deadline_config",
      value: normalizedConfig,
      updated_at: new Date().toISOString()
    }, { onConflict: "key" })
    .select()
    .single();

  if (error) throw error;

  return normalizeGuessDeadlineConfig(data?.value || normalizedConfig);
}

async function listMatchDeadlineSettings() {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("match_deadline_settings")
    .select("*");

  if (error) throw error;

  return (data || []).map((row) => ({
    ...row,
    value: normalizeGuessDeadlineConfig(row.value)
  }));
}

async function getMatchDeadlineSettingsMap() {
  const rows = await listMatchDeadlineSettings();
  const map = {};

  rows.forEach((row) => {
    if (row.match_id) {
      map[row.match_id] = normalizeGuessDeadlineConfig(row.value);
    }
  });

  return map;
}

async function saveMatchDeadlineConfig(matchId, config) {
  if (!matchId) {
    throw new Error("Selecione um jogo para salvar a regra específica.");
  }

  const client = getSupabaseClient();
  const normalizedConfig = normalizeGuessDeadlineConfig(config);

  const { data, error } = await client
    .from("match_deadline_settings")
    .upsert({
      match_id: matchId,
      value: normalizedConfig,
      updated_at: new Date().toISOString()
    }, { onConflict: "match_id" })
    .select()
    .single();

  if (error) throw error;

  return {
    ...data,
    value: normalizeGuessDeadlineConfig(data?.value || normalizedConfig)
  };
}

async function deleteMatchDeadlineConfig(matchId) {
  if (!matchId) {
    throw new Error("Selecione um jogo para remover a regra específica.");
  }

  const client = getSupabaseClient();

  const { error } = await client
    .from("match_deadline_settings")
    .delete()
    .eq("match_id", matchId);

  if (error) throw error;

  return true;
}

function getGuessDeadlineConfigForMatch(matchId, globalConfig, matchDeadlineSettings = {}) {
  if (matchId && matchDeadlineSettings && matchDeadlineSettings[matchId]) {
    return normalizeGuessDeadlineConfig(matchDeadlineSettings[matchId]);
  }

  return normalizeGuessDeadlineConfig(globalConfig || DEFAULT_GUESS_DEADLINE_CONFIG);
}

function calculateGuessCloseDate(match, config) {
  const deadlineConfig = normalizeGuessDeadlineConfig(config);
  const matchDate = new Date(match?.match_date);

  if (Number.isNaN(matchDate.getTime())) {
    return new Date(NaN);
  }

  if (deadlineConfig.mode === "previous_day") {
    const closeDate = new Date(matchDate);
    closeDate.setDate(closeDate.getDate() - 1);

    const [hour, minute] = String(deadlineConfig.previousDayTime || "23:59")
      .split(":")
      .map((value) => Number(value));

    closeDate.setHours(hour || 23, minute || 59, 0, 0);
    return closeDate;
  }

  const multiplier = deadlineConfig.unit === "hours" ? 60 * 60 * 1000 : 60 * 1000;
  return new Date(matchDate.getTime() - deadlineConfig.amount * multiplier);
}

function getGuessDeadlineRuleText(config) {
  const deadlineConfig = normalizeGuessDeadlineConfig(config);

  if (deadlineConfig.mode === "previous_day") {
    return `Palpites encerram às ${deadlineConfig.previousDayTime} do dia anterior ao jogo.`;
  }

  if (deadlineConfig.unit === "hours") {
    return `Palpites encerram ${deadlineConfig.amount} ${deadlineConfig.amount === 1 ? "hora" : "horas"} antes de cada jogo.`;
  }

  return `Palpites encerram ${deadlineConfig.amount} ${deadlineConfig.amount === 1 ? "minuto" : "minutos"} antes de cada jogo.`;
}

function getGuessDeadlineShortText(config) {
  const deadlineConfig = normalizeGuessDeadlineConfig(config);

  if (deadlineConfig.mode === "previous_day") {
    return `até ${deadlineConfig.previousDayTime} do dia anterior`;
  }

  if (deadlineConfig.unit === "hours") {
    return `${deadlineConfig.amount}h antes`;
  }

  return `${deadlineConfig.amount}min antes`;
}

function calculatePoints(guess, match) {
  if (match.status !== "encerrado") return 0;
  if (match.home_score === null || match.away_score === null) return 0;

  const exactScore =
    Number(guess.home_score_guess) === Number(match.home_score) &&
    Number(guess.away_score_guess) === Number(match.away_score);

  if (exactScore) return 5;

  const realResult = Math.sign(Number(match.home_score) - Number(match.away_score));
  const guessResult = Math.sign(Number(guess.home_score_guess) - Number(guess.away_score_guess));

  return realResult === guessResult ? 3 : 0;
}

async function listAllGuesses() {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("guesses")
    .select("*");

  if (error) throw error;
  return data || [];
}

async function listParticipants() {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("participants")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function getGuessCounts() {
  const guesses = await listAllGuesses();

  return guesses.reduce((acc, guess) => {
    acc[guess.match_id] = (acc[guess.match_id] || 0) + 1;
    return acc;
  }, {});
}

async function listRanking() {
  const client = getSupabaseClient();

  const { data, error } = await client.rpc("get_rezende_leaderboard");

  if (error) throw error;
  return data || [];
}
