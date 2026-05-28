const ADMIN_PASSWORD = "rezende2026";
const ADMIN_STORAGE_KEY = "bolao_rezende_admin";

const adminState = {
  matches: [],
  ranking: [],
  guesses: [],
  predictions: [],
  participants: []
};

const adminLogin = document.querySelector("#admin-login");
const adminApp = document.querySelector("#admin-app");
const adminLoginForm = document.querySelector("#admin-login-form");
const adminPassword = document.querySelector("#admin-password");
const adminLoginMessage = document.querySelector("#admin-login-message");
const adminLogoutButton = document.querySelector("#admin-logout-button");
const adminToast = document.querySelector("#admin-toast");

console.log("admin.js carregado");

document.addEventListener("DOMContentLoaded", initAdmin);

function initAdmin() {
  bindAdminEvents();

  if (localStorage.getItem(ADMIN_STORAGE_KEY) === "true") {
    showAdminPanel();
  } else {
    showAdminLogin();
  }
}

function bindAdminEvents() {
  adminLoginForm?.addEventListener("submit", handleAdminLogin);
  adminLoginForm?.querySelector('button[type="submit"]')?.addEventListener("click", () => {
    console.log("Clique no login admin");
  });
  adminLogoutButton?.addEventListener("click", handleAdminLogout);

  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => activateAdminTab(button.dataset.adminTab));
  });

  document.querySelector("#admin-refresh-matches")?.addEventListener("click", loadAdminMatches);
  document.querySelector("#admin-create-match-form")?.addEventListener("submit", handleCreateMatch);
  document.querySelector("#admin-refresh-ranking")?.addEventListener("click", loadAdminRanking);
  document.querySelector("#admin-export-guesses")?.addEventListener("click", exportGuessesCsv);
  document.querySelector("#admin-participant-search-form")?.addEventListener("submit", handleParticipantSearch);

  ["#guess-filter-match", "#guess-filter-participant", "#guess-filter-store"].forEach((selector) => {
    document.querySelector(selector)?.addEventListener("input", renderAdminGuesses);
    document.querySelector(selector)?.addEventListener("change", renderAdminGuesses);
  });

  ["#prediction-filter-champion", "#prediction-filter-scorer"].forEach((selector) => {
    document.querySelector(selector)?.addEventListener("input", renderAdminPredictions);
  });
}

function handleAdminLogin(event) {
  event.preventDefault();

  const password = adminPassword ? adminPassword.value.trim() : "";

  console.log("Clique no login admin");
  console.log("Senha digitada:", password);
  console.log("Senha confere:", password === ADMIN_PASSWORD);

  if (password === ADMIN_PASSWORD) {
    localStorage.setItem(ADMIN_STORAGE_KEY, "true");
    if (adminLoginMessage) adminLoginMessage.hidden = true;
    showAdminPanel();
    return;
  }

  showAdminError("Senha incorreta.");
}

function handleAdminLogout() {
  localStorage.removeItem(ADMIN_STORAGE_KEY);
  location.reload();
}

function showAdminLogin() {
  if (adminLogin) {
    adminLogin.hidden = false;
    adminLogin.style.display = "flex";
  }

  if (adminApp) {
    adminApp.hidden = true;
    adminApp.style.display = "none";
  }
}

async function showAdminPanel() {
  if (adminLogin) {
    adminLogin.hidden = true;
    adminLogin.style.display = "none";
  }

  if (adminApp) {
    adminApp.hidden = false;
    adminApp.style.display = "";
  }

  try {
    await Promise.all([
      loadAdminMatches(),
      loadAdminRanking(),
      loadAdminGuesses(),
      loadAdminPredictions()
    ]);
  } catch (error) {
    console.error(error);
    showAdminError("Erro ao acessar painel admin.");
  }
}

function showAdminError(message) {
  if (adminLoginMessage) {
    adminLoginMessage.textContent = message;
    adminLoginMessage.hidden = false;
  }

  showAdminToast(message);
}

function activateAdminTab(tab) {
  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.adminTab === tab);
  });

  document.querySelectorAll(".admin-section").forEach((section) => {
    section.classList.toggle("is-active", section.id === `admin-tab-${tab}`);
  });

  if (tab === "matches") loadAdminMatches();
  if (tab === "ranking") loadAdminRanking();
  if (tab === "guesses") loadAdminGuesses();
  if (tab === "predictions") loadAdminPredictions();
}

async function adminListMatches() {
  return listMatches();
}

async function adminCreateMatch(payload) {
  const client = getSupabaseClient();

  const { error } = await client
    .from("matches")
    .insert(payload);

  if (error) throw withRlsHint(error, "insert", "matches");

  return true;
}

async function adminUpdateMatch(matchId, payload) {
  const client = getSupabaseClient();

  const { error } = await client
    .from("matches")
    .update(payload)
    .eq("id", matchId);

  if (error) throw withRlsHint(error, "update", "matches");

  return true;
}

async function adminDeleteMatch(matchId) {
  const client = getSupabaseClient();

  const { error: guessesError } = await client
    .from("guesses")
    .delete()
    .eq("match_id", matchId);

  if (guessesError) throw withRlsHint(guessesError, "delete", "guesses");

  const { error: matchError } = await client
    .from("matches")
    .delete()
    .eq("id", matchId);

  if (matchError) throw withRlsHint(matchError, "delete", "matches");
}

async function adminListRanking() {
  const [ranking, matches, guesses, predictions] = await Promise.all([
    listRanking(),
    listMatches(),
    listAllGuesses(),
    adminListParticipantPredictions()
  ]);

  const matchById = new Map(matches.map((match) => [match.id, match]));
  const predictionsByParticipant = new Map(predictions.map((prediction) => [prediction.participant_id, prediction]));

  return ranking.map((row) => {
    const participantGuesses = guesses.filter((guess) => guess.participant_id === row.participant_id);
    let exactScores = 0;
    let resultHits = 0;

    participantGuesses.forEach((guess) => {
      const match = matchById.get(guess.match_id);
      if (!match || match.status !== "encerrado") return;

      const exact =
        Number(guess.home_score_guess) === Number(match.home_score) &&
        Number(guess.away_score_guess) === Number(match.away_score);

      const result =
        Math.sign(Number(guess.home_score_guess) - Number(guess.away_score_guess)) ===
        Math.sign(Number(match.home_score) - Number(match.away_score));

      if (exact) exactScores += 1;
      if (!exact && result) resultHits += 1;
    });

    const prediction = predictionsByParticipant.get(row.participant_id);

    return {
      ...row,
      exactScores,
      resultHits,
      champion: getPredictionChampionName(prediction),
      topScorer: getPredictionScorerName(prediction),
      predictionDate: prediction?.selected_at || prediction?.created_at || ""
    };
  });
}

async function adminListGuesses() {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("guesses")
    .select(`
      *,
      participant:participants (*),
      match:matches (*)
    `)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function adminListParticipantPredictions() {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("participant_predictions")
    .select(`
      *,
      participant:participants (*),
      champion_team:world_cup_teams (*),
      top_scorer_player:brazil_squad_players (*)
    `)
    .order("selected_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function adminSearchParticipants(searchTerm) {
  const term = String(searchTerm || "").trim();
  if (!term) return [];

  const client = getSupabaseClient();
  let employeeMatch = null;
  const cpfDigits = term.replace(/\D/g, "");

  if (cpfDigits.length >= 6) {
    const { data } = await client.rpc("check_employee_cpf", { cpf_input: cpfDigits });
    employeeMatch = data?.[0] || null;
  }

  const { data, error } = await client
    .from("participants")
    .select("*")
    .or(`name.ilike.%${escapeSupabaseLike(term)}%,store_sector.ilike.%${escapeSupabaseLike(term)}%`)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const results = data || [];

  if (!employeeMatch) return results;

  const byEmployee = await client
    .from("participants")
    .select("*")
    .eq("name", employeeMatch.name)
    .eq("store_sector", employeeMatch.store_sector);

  if (byEmployee.error) return results;

  const merged = new Map(results.map((participant) => [participant.id, participant]));
  (byEmployee.data || []).forEach((participant) => merged.set(participant.id, participant));
  return [...merged.values()];
}

async function adminDeleteParticipantPredictions(participantId) {
  const client = getSupabaseClient();

  const { error } = await client
    .from("participant_predictions")
    .delete()
    .eq("participant_id", participantId);

  if (error) throw withRlsHint(error, "delete", "participant_predictions");
}

async function adminDeleteParticipantGuesses(participantId) {
  const client = getSupabaseClient();

  const { error } = await client
    .from("guesses")
    .delete()
    .eq("participant_id", participantId);

  if (error) throw withRlsHint(error, "delete", "guesses");
}

async function adminDeleteParticipant(participantId) {
  const client = getSupabaseClient();

  const { error } = await client
    .from("participants")
    .delete()
    .eq("id", participantId);

  if (error) throw withRlsHint(error, "delete", "participants");
}

async function loadAdminMatches() {
  const list = document.querySelector("#admin-matches-list");
  if (list) list.innerHTML = '<p class="empty">Carregando jogos...</p>';

  try {
    adminState.matches = await adminListMatches();
    renderAdminMatches();
    fillGuessMatchFilter();
  } catch (error) {
    if (list) list.innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`;
  }
}

function renderAdminMatches() {
  const list = document.querySelector("#admin-matches-list");
  if (!list) return;

  if (!adminState.matches.length) {
    list.innerHTML = '<p class="empty">Nenhum jogo cadastrado.</p>';
    return;
  }

  list.innerHTML = adminState.matches.map((match) => `
    <form class="admin-match-card" data-match-id="${escapeHtml(match.id)}">
      <div class="admin-match-card__header">
        <strong>${escapeHtml(match.home_team)} x ${escapeHtml(match.away_team)}</strong>
        <span class="status ${statusClass(match.status)}">${escapeHtml(match.status || "aberto")}</span>
      </div>

      <div class="admin-match-card__meta">
        <span>${formatAdminDate(match.match_date)}</span>
        <span>${escapeHtml(match.phase || "Fase nao informada")}</span>
        <span>${formatAdminScore(match)}</span>
      </div>

      <div class="admin-form-grid">
        <label>
          Selecao A
          <input name="home_team" value="${escapeHtml(match.home_team)}" required>
        </label>

        <label>
          Selecao B
          <input name="away_team" value="${escapeHtml(match.away_team)}" required>
        </label>

        <label>
          Data e hora
          <input name="match_date" type="datetime-local" value="${formatDateTimeLocal(match.match_date)}" required>
        </label>

        <label>
          Fase
          <input name="phase" value="${escapeHtml(match.phase || "")}">
        </label>

        <label>
          Status
          <select name="status">
            ${renderStatusOptions(match.status)}
          </select>
        </label>

        <label>
          Placar A
          <input name="home_score" type="number" min="0" value="${match.home_score ?? ""}">
        </label>

        <label>
          Placar B
          <input name="away_score" type="number" min="0" value="${match.away_score ?? ""}">
        </label>
      </div>

      <div class="admin-match-card__actions">
        <button type="submit">Salvar alterações</button>
        <button class="admin-mini-danger" type="button" data-delete-match="${escapeHtml(match.id)}">Excluir jogo</button>
      </div>
    </form>
  `).join("");

  list.querySelectorAll(".admin-match-card").forEach((form) => {
    form.addEventListener("submit", handleUpdateMatch);
  });

  list.querySelectorAll("[data-delete-match]").forEach((button) => {
    button.addEventListener("click", handleDeleteMatch);
  });
}

async function handleCreateMatch(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const formData = new FormData(form);

  try {
    await adminCreateMatch({
      home_team: String(formData.get("home_team") || "").trim(),
      away_team: String(formData.get("away_team") || "").trim(),
      match_date: toDatabaseDateTime(formData.get("match_date")),
      phase: String(formData.get("phase") || "").trim() || null,
      status: String(formData.get("status") || "aberto"),
      home_score: null,
      away_score: null
    });

    form.reset();
    form.elements.status.value = "aberto";
    showAdminToast("Jogo cadastrado.");
    await loadAdminMatches();
  } catch (error) {
    showAdminToast(error.message);
  }
}

async function handleUpdateMatch(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const formData = new FormData(form);
  const matchId = form.dataset.matchId;

  try {
    const payload = buildMatchPayloadFromForm(formData);

    await adminUpdateMatch(matchId, payload);

    showAdminToast("Resultado atualizado.");
    await Promise.all([loadAdminMatches(), loadAdminRanking(), loadAdminGuesses()]);
  } catch (error) {
    showAdminToast(error.message);
  }
}

async function handleDeleteMatch(event) {
  const button = event.currentTarget;
  const matchId = button.dataset.deleteMatch;
  const form = button.closest(".admin-match-card");
  const title = form?.querySelector(".admin-match-card__header strong")?.textContent || "este jogo";

  const confirmed = window.confirm(
    `Tem certeza que deseja excluir ${title}?\n\nIsso também remove os palpites desse jogo e não pode ser desfeito.`
  );

  if (!confirmed) return;

  try {
    button.disabled = true;
    button.textContent = "Excluindo...";

    await adminDeleteMatch(matchId);

    showAdminToast("Jogo excluído.");
    await Promise.all([loadAdminMatches(), loadAdminRanking(), loadAdminGuesses()]);
  } catch (error) {
    button.disabled = false;
    button.textContent = "Excluir jogo";
    showAdminToast(error.message);
  }
}

function buildMatchPayloadFromForm(formData) {
  const homeScore = normalizeNullableNumber(formData.get("home_score"));
  const awayScore = normalizeNullableNumber(formData.get("away_score"));
  let status = String(formData.get("status") || "aberto");

  const hasHomeScore = homeScore !== null;
  const hasAwayScore = awayScore !== null;

  if (hasHomeScore !== hasAwayScore) {
    throw new Error("Preencha os dois placares ou deixe os dois em branco.");
  }

  if (hasHomeScore && hasAwayScore) {
    status = "encerrado";
  }

  if (!hasHomeScore && !hasAwayScore && status === "encerrado") {
    status = "aberto";
  }

  return {
    home_team: String(formData.get("home_team") || "").trim(),
    away_team: String(formData.get("away_team") || "").trim(),
    match_date: toDatabaseDateTime(formData.get("match_date")),
    phase: String(formData.get("phase") || "").trim() || null,
    status,
    home_score: homeScore,
    away_score: awayScore
  };
}

async function loadAdminRanking() {
  const body = document.querySelector("#admin-ranking-body");
  if (body) body.innerHTML = '<tr><td colspan="10">Carregando ranking...</td></tr>';

  try {
    adminState.ranking = await adminListRanking();
    renderAdminRanking();
  } catch (error) {
    if (body) body.innerHTML = `<tr><td colspan="10">${escapeHtml(error.message)}</td></tr>`;
  }
}

function renderAdminRanking() {
  const body = document.querySelector("#admin-ranking-body");
  if (!body) return;

  if (!adminState.ranking.length) {
    body.innerHTML = '<tr><td colspan="10">Nenhum participante no ranking.</td></tr>';
    return;
  }

  body.innerHTML = adminState.ranking.map((row) => `
    <tr>
      <td><strong>${row.position}</strong></td>
      <td>${escapeHtml(row.name)}</td>
      <td>${escapeHtml(row.store_sector || "-")}</td>
      <td><strong>${row.points}</strong></td>
      <td>${row.guesses}</td>
      <td>${row.exactScores}</td>
      <td>${row.resultHits}</td>
      <td>${escapeHtml(row.champion || "-")}</td>
      <td>${escapeHtml(row.topScorer || "-")}</td>
      <td>${formatAdminDate(row.predictionDate)}</td>
    </tr>
  `).join("");
}

async function loadAdminGuesses() {
  const body = document.querySelector("#admin-guesses-body");
  if (body) body.innerHTML = '<tr><td colspan="6">Carregando palpites...</td></tr>';

  try {
    adminState.guesses = await adminListGuesses();
    renderAdminGuesses();
  } catch (error) {
    if (body) body.innerHTML = `<tr><td colspan="6">${escapeHtml(error.message)}</td></tr>`;
  }
}

function renderAdminGuesses() {
  const body = document.querySelector("#admin-guesses-body");
  if (!body) return;

  const matchFilter = document.querySelector("#guess-filter-match")?.value || "";
  const participantFilter = normalizeText(document.querySelector("#guess-filter-participant")?.value || "");
  const storeFilter = normalizeText(document.querySelector("#guess-filter-store")?.value || "");

  const guesses = adminState.guesses.filter((guess) => {
    const participant = guess.participant || {};
    if (matchFilter && guess.match_id !== matchFilter) return false;
    if (participantFilter && !normalizeText(participant.name).includes(participantFilter)) return false;
    if (storeFilter && !normalizeText(participant.store_sector).includes(storeFilter)) return false;
    return true;
  });

  if (!guesses.length) {
    body.innerHTML = '<tr><td colspan="6">Nenhum palpite encontrado.</td></tr>';
    return;
  }

  body.innerHTML = guesses.map((guess) => {
    const match = guess.match || {};
    const points = match.status === "encerrado" ? calculatePoints(guess, match) : "-";

    return `
      <tr>
        <td>${escapeHtml(guess.participant?.name || "-")}</td>
        <td>${escapeHtml(guess.participant?.store_sector || "-")}</td>
        <td>${escapeHtml(match.home_team || "-")} x ${escapeHtml(match.away_team || "-")}</td>
        <td><strong>${guess.home_score_guess} x ${guess.away_score_guess}</strong></td>
        <td>${formatAdminDate(guess.updated_at || guess.created_at)}</td>
        <td>${points}</td>
      </tr>
    `;
  }).join("");
}

async function loadAdminPredictions() {
  const body = document.querySelector("#admin-predictions-body");
  if (body) body.innerHTML = '<tr><td colspan="6">Carregando escolhas...</td></tr>';

  try {
    adminState.predictions = await adminListParticipantPredictions();
    renderAdminPredictions();
  } catch (error) {
    if (body) body.innerHTML = `<tr><td colspan="6">${escapeHtml(error.message)}</td></tr>`;
  }
}

function renderAdminPredictions() {
  const body = document.querySelector("#admin-predictions-body");
  if (!body) return;

  const championFilter = normalizeText(document.querySelector("#prediction-filter-champion")?.value || "");
  const scorerFilter = normalizeText(document.querySelector("#prediction-filter-scorer")?.value || "");

  const predictions = adminState.predictions.filter((prediction) => {
    const champion = normalizeText(getPredictionChampionName(prediction));
    const scorer = normalizeText(getPredictionScorerName(prediction));
    if (championFilter && !champion.includes(championFilter)) return false;
    if (scorerFilter && !scorer.includes(scorerFilter)) return false;
    return true;
  });

  if (!predictions.length) {
    body.innerHTML = '<tr><td colspan="6">Nenhuma escolha encontrada.</td></tr>';
    return;
  }

  body.innerHTML = predictions.map((prediction) => `
    <tr>
      <td>${escapeHtml(prediction.participant?.name || "-")}</td>
      <td>${escapeHtml(prediction.participant?.store_sector || "-")}</td>
      <td>${escapeHtml(getPredictionChampionName(prediction) || "-")}</td>
      <td>${escapeHtml(getPredictionScorerName(prediction) || "-")}</td>
      <td>${formatAdminDate(prediction.selected_at || prediction.created_at)}</td>
      <td>
        <button class="admin-mini-danger" type="button" data-delete-prediction="${escapeHtml(prediction.participant_id)}">Excluir escolha</button>
      </td>
    </tr>
  `).join("");

  body.querySelectorAll("[data-delete-prediction]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirmDanger()) return;

      try {
        await adminDeleteParticipantPredictions(button.dataset.deletePrediction);
        showAdminToast("Escolha removida.");
        await Promise.all([loadAdminPredictions(), loadAdminRanking()]);
      } catch (error) {
        showAdminToast(error.message);
      }
    });
  });
}

async function handleParticipantSearch(event) {
  event.preventDefault();

  const results = document.querySelector("#admin-participant-results");
  const search = document.querySelector("#admin-participant-search")?.value || "";

  if (results) results.innerHTML = '<p class="empty">Buscando...</p>';

  try {
    const participants = await adminSearchParticipants(search);
    renderParticipantResults(participants);
  } catch (error) {
    if (results) results.innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`;
  }
}

function renderParticipantResults(participants) {
  const results = document.querySelector("#admin-participant-results");
  if (!results) return;

  if (!participants.length) {
    results.innerHTML = '<p class="empty">Nenhum participante encontrado.</p>';
    return;
  }

  results.innerHTML = participants.map((participant) => `
    <article class="admin-participant-card">
      <div>
        <strong>${escapeHtml(participant.name)}</strong>
        <span>${escapeHtml(participant.store_sector || "-")}</span>
      </div>

      <div class="admin-danger-grid">
        <button type="button" data-clean-guesses="${escapeHtml(participant.id)}">Limpar palpites deste participante</button>
        <button type="button" data-clean-predictions="${escapeHtml(participant.id)}">Limpar campeao/artilheiro deste participante</button>
        <button type="button" data-delete-participant="${escapeHtml(participant.id)}">Remover participante do ranking</button>
        <button type="button" data-clean-all="${escapeHtml(participant.id)}">Limpar tudo deste participante</button>
      </div>
    </article>
  `).join("");

  results.querySelectorAll("[data-clean-guesses]").forEach((button) => {
    button.addEventListener("click", () => runDangerAction(async () => {
      await adminDeleteParticipantGuesses(button.dataset.cleanGuesses);
      showAdminToast("Palpites removidos.");
      await refreshAdminData();
    }));
  });

  results.querySelectorAll("[data-clean-predictions]").forEach((button) => {
    button.addEventListener("click", () => runDangerAction(async () => {
      await adminDeleteParticipantPredictions(button.dataset.cleanPredictions);
      showAdminToast("Campeao/artilheiro removidos.");
      await refreshAdminData();
    }));
  });

  results.querySelectorAll("[data-delete-participant]").forEach((button) => {
    button.addEventListener("click", () => runDangerAction(async () => {
      await adminDeleteParticipant(button.dataset.deleteParticipant);
      showAdminToast("Participante removido do ranking.");
      document.querySelector("#admin-participant-search-form")?.requestSubmit();
      await refreshAdminData();
    }));
  });

  results.querySelectorAll("[data-clean-all]").forEach((button) => {
    button.addEventListener("click", () => runDangerAction(async () => {
      const participantId = button.dataset.cleanAll;
      await adminDeleteParticipantGuesses(participantId);
      await adminDeleteParticipantPredictions(participantId);
      await adminDeleteParticipant(participantId);
      showAdminToast("Tudo deste participante foi removido.");
      document.querySelector("#admin-participant-search-form")?.requestSubmit();
      await refreshAdminData();
    }));
  });
}

async function refreshAdminData() {
  await Promise.all([loadAdminRanking(), loadAdminGuesses(), loadAdminPredictions()]);
}

function exportGuessesCsv() {
  const rows = adminState.guesses.map((guess) => {
    const match = guess.match || {};
    const participant = guess.participant || {};
    const points = match.status === "encerrado" ? calculatePoints(guess, match) : "";

    return {
      participante: participant.name || "",
      loja: participant.store_sector || "",
      jogo: `${match.home_team || ""} x ${match.away_team || ""}`,
      palpite: `${guess.home_score_guess} x ${guess.away_score_guess}`,
      data: formatAdminDate(guess.updated_at || guess.created_at),
      pontos: points
    };
  });

  if (!rows.length) {
    showAdminToast("Nenhum palpite para exportar.");
    return;
  }

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(";"),
    ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(";"))
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `palpites-bolao-rezende-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();

  URL.revokeObjectURL(url);
}

function fillGuessMatchFilter() {
  const select = document.querySelector("#guess-filter-match");
  if (!select) return;

  const currentValue = select.value;

  select.innerHTML = '<option value="">Todos</option>' + adminState.matches.map((match) => `
    <option value="${escapeHtml(match.id)}">${escapeHtml(match.home_team)} x ${escapeHtml(match.away_team)} - ${formatAdminDate(match.match_date)}</option>
  `).join("");

  select.value = currentValue;
}

function runDangerAction(action) {
  if (!confirmDanger()) return;
  action().catch((error) => showAdminToast(error.message));
}

function confirmDanger() {
  return window.confirm("Tem certeza? Essa acao nao pode ser desfeita.");
}

function renderStatusOptions(value) {
  return ["aberto", "ao vivo", "encerrado"].map((status) => (
    `<option value="${status}" ${status === value ? "selected" : ""}>${status}</option>`
  )).join("");
}

function normalizeNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;

  const number = Number(value);

  if (Number.isNaN(number)) {
    return null;
  }

  return number;
}

function toDatabaseDateTime(value) {
  if (!value) return null;

  const normalized = String(value).trim();

  if (!normalized) return null;

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) {
    return normalized.replace("T", " ") + ":00";
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(normalized)) {
    return normalized.replace("T", " ");
  }

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(normalized)) {
    return normalized.length === 16 ? normalized + ":00" : normalized;
  }

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());
  const second = pad2(date.getSeconds());

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function formatDateTimeLocal(value) {
  if (!value) return "";

  const raw = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(raw)) {
    return raw.replace(" ", "T").slice(0, 16);
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) {
    return raw.slice(0, 16);
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function formatAdminDate(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatAdminScore(match) {
  const home = match.home_score ?? "-";
  const away = match.away_score ?? "-";
  return `${home} x ${away}`;
}

function getPredictionChampionName(prediction) {
  return prediction?.champion_team?.name || prediction?.champion_name || "";
}

function getPredictionScorerName(prediction) {
  return prediction?.top_scorer_player?.name || prediction?.top_scorer_name || "";
}

function escapeSupabaseLike(value) {
  return String(value || "").replace(/[%_]/g, "");
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function statusClass(status) {
  const normalized = String(status || "aberto").toLowerCase().replace(/\s/g, "-");
  return `status-${normalized}`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function withRlsHint(error, action, table) {
  const message = String(error?.message || "");
  const isRls = message.toLowerCase().includes("row-level security") || error?.code === "42501";

  if (!isRls) return error;

  return new Error(`${message} Crie uma policy de ${action} para a tabela ${table}. Veja supabase/update_admin_policies.sql.`);
}

function showAdminToast(message) {
  if (!adminToast) {
    alert(message);
    return;
  }

  adminToast.textContent = message;
  adminToast.hidden = false;

  setTimeout(() => {
    adminToast.hidden = true;
  }, 4200);
}