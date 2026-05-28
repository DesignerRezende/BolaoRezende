let db = null;

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

  const { data, error } = await client
    .from("guesses")
    .upsert({
      participant_id: guess.participant_id,
      match_id: guess.match_id,
      home_score_guess: Number(guess.home_score_guess),
      away_score_guess: Number(guess.away_score_guess),
      updated_at: new Date().toISOString()
    }, { onConflict: "participant_id,match_id" })
    .select()
    .single();

  if (error) throw error;
  return data;
}

function calculatePoints(guess, match) {
  if (match.status !== "encerrado") return 0;
  if (match.home_score === null || match.away_score === null) return 0;

  const exactScore =
    guess.home_score_guess === match.home_score &&
    guess.away_score_guess === match.away_score;

  if (exactScore) return 5;

  const realResult = Math.sign(match.home_score - match.away_score);
  const guessResult = Math.sign(guess.home_score_guess - guess.away_score_guess);

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

async function updateGuessPoints(guessId, points) {
  const client = getSupabaseClient();

  const { error } = await client
    .from("guesses")
    .update({ points })
    .eq("id", guessId);

  if (error) throw error;
}

async function getGuessCounts() {
  const guesses = await listAllGuesses();

  return guesses.reduce((acc, guess) => {
    acc[guess.match_id] = (acc[guess.match_id] || 0) + 1;
    return acc;
  }, {});
}

async function listRanking() {
  const [participants, matches, guesses] = await Promise.all([
    listParticipants(),
    listMatches(),
    listAllGuesses()
  ]);

  const matchById = new Map(matches.map((match) => [match.id, match]));
  const participantById = new Map(participants.map((participant) => [participant.id, participant]));
  const rankingMap = new Map();

  participants.forEach((participant) => {
    rankingMap.set(participant.id, {
      participant,
      points: 0,
      guesses: 0,
      exactScores: 0,
      resultHits: 0
    });
  });

  for (const guess of guesses) {
    const participant = participantById.get(guess.participant_id);
    const match = matchById.get(guess.match_id);

    if (!participant || !match) continue;

    const points = calculatePoints(guess, match);

    if (guess.points !== points) {
      updateGuessPoints(guess.id, points).catch(console.error);
    }

    const row = rankingMap.get(participant.id);
    row.points += points;
    row.guesses += 1;

    if (match.status === "encerrado" && match.home_score !== null && match.away_score !== null) {
      const exactScore =
        guess.home_score_guess === match.home_score &&
        guess.away_score_guess === match.away_score;

      const realResult = Math.sign(match.home_score - match.away_score);
      const guessResult = Math.sign(guess.home_score_guess - guess.away_score_guess);

      if (exactScore) {
        row.exactScores += 1;
      } else if (realResult === guessResult) {
        row.resultHits += 1;
      }
    }
  }

  return [...rankingMap.values()]
    .sort((a, b) =>
      b.points - a.points ||
      b.exactScores - a.exactScores ||
      b.resultHits - a.resultHits ||
      b.guesses - a.guesses ||
      a.participant.name.localeCompare(b.participant.name)
    )
    .map((row, index) => ({
      participant_id: row.participant.id,
      position: index + 1,
      name: row.participant.name,
      store_sector: row.participant.store_sector,
      points: row.points,
      guesses: row.guesses,
      exactScores: row.exactScores,
      resultHits: row.resultHits
    }));
}