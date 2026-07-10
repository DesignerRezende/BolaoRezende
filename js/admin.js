const ADMIN_PASSWORD = "rezende@2026!";
const ADMIN_STORAGE_KEY = "bolao_rezende_admin";
const ADMIN_SYNC_SECRET_STORAGE_KEY = "bolao_rezende_sync_secret";

const adminState = {
  matches: [],
  ranking: [],
  guesses: [],
  predictions: [],
  participants: [],
  employees: [],
  worldCupTeams: [],
  finalResults: null,
  guessDeadlineConfig: DEFAULT_GUESS_DEADLINE_CONFIG,
  matchDeadlineSettings: {}
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

  document.querySelector("#admin-refresh-matches")?.addEventListener("click", async () => {
    await loadAdminMatches();
    await loadAdminGuessDeadlineConfig();
  });
  document.querySelector("#admin-sync-football-api")?.addEventListener("click", handleAdminSyncFootballApi);

  document.querySelector("#admin-create-match-form")?.addEventListener("submit", handleCreateMatch);
  document.querySelector("#admin-refresh-ranking")?.addEventListener("click", loadAdminRanking);
  document.querySelector("#admin-export-guesses")?.addEventListener("click", exportGuessesCsv);
  document.querySelector("#admin-participant-search-form")?.addEventListener("submit", handleParticipantSearch);
  document.querySelector("#admin-final-results-form")?.addEventListener("submit", handleSaveFinalResults);
  document.querySelector("#admin-clear-champion-result")?.addEventListener("click", handleClearChampionResult);

  document.querySelector("#admin-refresh-employees")?.addEventListener("click", loadAdminEmployees);
  document.querySelector("#admin-create-employee-form")?.addEventListener("submit", handleCreateEmployee);
  document.querySelector("#admin-employees-search-form")?.addEventListener("submit", handleEmployeesSearch);
  document.querySelector("#admin-clear-employees-search")?.addEventListener("click", handleClearEmployeesSearch);

  document.querySelector("#admin-guess-deadline-form")?.addEventListener("submit", handleSaveGuessDeadlineConfig);
  document.querySelector("#admin-deadline-mode")?.addEventListener("change", updateGuessDeadlineFormState);
  document.querySelector("#admin-deadline-scope")?.addEventListener("change", handleDeadlineScopeChange);
  document.querySelector("#admin-deadline-match-id")?.addEventListener("change", handleDeadlineMatchChange);
  document.querySelector("#admin-remove-match-deadline")?.addEventListener("click", handleRemoveMatchDeadlineConfig);

  document.querySelectorAll("[data-fill-phase]").forEach((button) => {
    button.addEventListener("click", () => {
      const phaseInput = document.querySelector('#admin-create-match-form [name="phase"]');
      if (phaseInput) phaseInput.value = button.dataset.fillPhase || "";
    });
  });

  document.querySelector('#admin-create-employee-form [name="cpf_digits"]')?.addEventListener("input", (event) => {
    event.target.value = formatCPF(event.target.value);
  });

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
      loadAdminPredictions(),
      loadAdminFinalResults()
    ]);

    await loadAdminGuessDeadlineConfig();
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

  if (tab === "matches") {
    loadAdminMatches().then(() => loadAdminGuessDeadlineConfig());
  }

  if (tab === "ranking") loadAdminRanking();
  if (tab === "guesses") loadAdminGuesses();
  if (tab === "predictions") {
    loadAdminFinalResults();
    loadAdminPredictions();
  }
  if (tab === "employees") loadAdminEmployees();
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

  const { error: deadlineError } = await client
    .from("match_deadline_settings")
    .delete()
    .eq("match_id", matchId);

  if (deadlineError) throw withRlsHint(deadlineError, "delete", "match_deadline_settings");

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

async function runAdminFootballApiSync() {
  let secret = localStorage.getItem(ADMIN_SYNC_SECRET_STORAGE_KEY) || "";

  if (!secret) {
    secret = window.prompt("Informe o segredo SYNC_RESULTS_SECRET para sincronizar a Football API:") || "";
    secret = secret.trim();

    if (!secret) {
      throw new Error("Sincronizacao cancelada: segredo nao informado.");
    }

    localStorage.setItem(ADMIN_SYNC_SECRET_STORAGE_KEY, secret);
  }

  const response = await fetch(`/api/sync-results?all=1&secret=${encodeURIComponent(secret)}`);
  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.ok) {
    if (response.status === 401) {
      localStorage.removeItem(ADMIN_SYNC_SECRET_STORAGE_KEY);
    }

    throw new Error(data?.error || "Nao foi possivel sincronizar a Football API.");
  }

  return data;
}

async function handleAdminSyncFootballApi(event) {
  const button = event.currentTarget;
  const originalText = button?.textContent || "Sincronizar Football API";

  try {
    if (button) {
      button.disabled = true;
      button.textContent = "Sincronizando...";
    }

    const result = await runAdminFootballApiSync();
    const errorCount = Array.isArray(result.errors) ? result.errors.length : 0;

    showAdminToast(
      `Sync concluido: ${result.checked || 0} verificados, ${result.updated || 0} com mudança, ${result.skipped || 0} sem alteração, ${errorCount} erros.`
    );

    await Promise.all([
      loadAdminMatches(),
      loadAdminRanking(),
      loadAdminGuesses()
    ]);
    await loadAdminGuessDeadlineConfig();
  } catch (error) {
    console.error(error);
    showAdminToast(error.message || "Nao foi possivel sincronizar a Football API.");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

/* =========================================================
   CONFIGURAÇÃO DO PRAZO DOS PALPITES
========================================================= */

async function loadAdminGuessDeadlineConfig() {
  try {
    const [globalConfig, matchSettings] = await Promise.all([
      getGuessDeadlineConfig(),
      getMatchDeadlineSettingsMap()
    ]);

    adminState.guessDeadlineConfig = globalConfig;
    adminState.matchDeadlineSettings = matchSettings;
  } catch (error) {
    console.error("Erro ao carregar configuração de prazo:", error);
    adminState.guessDeadlineConfig = DEFAULT_GUESS_DEADLINE_CONFIG;
    adminState.matchDeadlineSettings = {};
    showAdminToast("Não foi possível carregar a regra dos palpites. Usando padrão.");
  }

  fillDeadlineMatchSelect();
  renderGuessDeadlineConfigForm();
}

function fillDeadlineMatchSelect() {
  const select = document.querySelector("#admin-deadline-match-id");
  if (!select) return;

  const currentValue = select.value;

  select.innerHTML = '<option value="">Selecione um jogo</option>' + adminState.matches.map((match) => {
    const hasSpecific = Boolean(adminState.matchDeadlineSettings?.[match.id]);
    const label = `${match.home_team} x ${match.away_team} - ${match.phase || "Sem fase"} - ${formatAdminDate(match.match_date)}${hasSpecific ? " [regra específica]" : ""}`;

    return `<option value="${escapeHtml(match.id)}">${escapeHtml(label)}</option>`;
  }).join("");

  if (currentValue && adminState.matches.some((match) => match.id === currentValue)) {
    select.value = currentValue;
  }
}

function getDeadlinePayloadFromForm(form) {
  const formData = new FormData(form);

  const mode = String(formData.get("mode") || "previous_day");
  const amount = Number(formData.get("amount") || 1);
  const unit = String(formData.get("unit") || "minutes");
  const previousDayTime = String(formData.get("previousDayTime") || "23:59");

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
    unit,
    previousDayTime
  };
}

function getSelectedDeadlineScope() {
  return document.querySelector("#admin-deadline-scope")?.value || "global";
}

function getSelectedDeadlineMatchId() {
  return document.querySelector("#admin-deadline-match-id")?.value || "";
}

function getCurrentDisplayedDeadlineConfig() {
  const scope = getSelectedDeadlineScope();
  const matchId = getSelectedDeadlineMatchId();

  if (scope === "match" && matchId) {
    return getGuessDeadlineConfigForMatch(
      matchId,
      adminState.guessDeadlineConfig,
      adminState.matchDeadlineSettings
    );
  }

  return normalizeGuessDeadlineConfig(adminState.guessDeadlineConfig);
}

function renderGuessDeadlineConfigForm() {
  const scopeInput = document.querySelector("#admin-deadline-scope");
  const matchInput = document.querySelector("#admin-deadline-match-id");
  const modeInput = document.querySelector("#admin-deadline-mode");
  const amountInput = document.querySelector("#admin-deadline-amount");
  const unitInput = document.querySelector("#admin-deadline-unit");
  const previousDayTimeInput = document.querySelector("#admin-deadline-previous-day-time");
  const currentText = document.querySelector("#admin-deadline-current");

  const scope = scopeInput?.value || "global";
  const matchId = matchInput?.value || "";
  const config = getCurrentDisplayedDeadlineConfig();
  const selectedMatch = adminState.matches.find((match) => match.id === matchId);
  const hasSpecific = Boolean(matchId && adminState.matchDeadlineSettings?.[matchId]);

  if (modeInput) modeInput.value = config.mode;
  if (amountInput) amountInput.value = config.amount || 1;
  if (unitInput) unitInput.value = config.unit === "hours" ? "hours" : "minutes";
  if (previousDayTimeInput) previousDayTimeInput.value = config.previousDayTime || "23:59";

  if (currentText) {
    if (scope === "match") {
      const matchLabel = selectedMatch
        ? `${selectedMatch.home_team} x ${selectedMatch.away_team}`
        : "nenhum jogo selecionado";

      const prefix = hasSpecific
        ? `Regra específica de ${matchLabel}`
        : `Este jogo está usando a regra geral`;

      currentText.innerHTML = `${escapeHtml(prefix)}: <strong>${escapeHtml(getGuessDeadlineRuleText(config))}</strong>`;
    } else {
      currentText.innerHTML = `Regra geral atual: <strong>${escapeHtml(getGuessDeadlineRuleText(config))}</strong>`;
    }
  }

  updateGuessDeadlineFormState();
}

function updateGuessDeadlineFormState() {
  const scope = getSelectedDeadlineScope();
  const mode = document.querySelector("#admin-deadline-mode")?.value || "previous_day";

  const matchInput = document.querySelector("#admin-deadline-match-id");
  const amountInput = document.querySelector("#admin-deadline-amount");
  const unitInput = document.querySelector("#admin-deadline-unit");
  const previousDayTimeInput = document.querySelector("#admin-deadline-previous-day-time");
  const removeButton = document.querySelector("#admin-remove-match-deadline");

  const isPreviousDay = mode === "previous_day";
  const isMatchScope = scope === "match";
  const matchId = getSelectedDeadlineMatchId();
  const hasSpecific = Boolean(matchId && adminState.matchDeadlineSettings?.[matchId]);

  if (matchInput) {
    matchInput.disabled = !isMatchScope;
    matchInput.parentElement.style.opacity = isMatchScope ? "1" : "0.45";
  }

  if (amountInput) {
    amountInput.disabled = isPreviousDay;
    amountInput.parentElement.style.opacity = isPreviousDay ? "0.45" : "1";
  }

  if (unitInput) {
    unitInput.disabled = isPreviousDay;
    unitInput.parentElement.style.opacity = isPreviousDay ? "0.45" : "1";
  }

  if (previousDayTimeInput) {
    previousDayTimeInput.disabled = !isPreviousDay;
    previousDayTimeInput.parentElement.style.opacity = isPreviousDay ? "1" : "0.45";
  }

  if (removeButton) {
    removeButton.disabled = !isMatchScope || !matchId || !hasSpecific;
    removeButton.style.opacity = !isMatchScope || !matchId || !hasSpecific ? "0.45" : "1";
  }
}

function handleDeadlineScopeChange() {
  renderGuessDeadlineConfigForm();
}

function handleDeadlineMatchChange() {
  renderGuessDeadlineConfigForm();
}

async function handleSaveGuessDeadlineConfig(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const scope = getSelectedDeadlineScope();
  const matchId = getSelectedDeadlineMatchId();
  const payload = getDeadlinePayloadFromForm(form);

  try {
    const button = form.querySelector('button[type="submit"]');

    if (button) {
      button.disabled = true;
      button.textContent = "Salvando...";
    }

    if (scope === "match") {
      if (!matchId) {
        throw new Error("Selecione um jogo específico para aplicar esta regra.");
      }

      await saveMatchDeadlineConfig(matchId, payload);
      showAdminToast("Regra específica do jogo atualizada.");
    } else {
      await saveGuessDeadlineConfig(payload);
      showAdminToast("Regra geral dos palpites atualizada.");
    }

    await loadAdminGuessDeadlineConfig();
    await Promise.all([
      loadAdminMatches(),
      loadAdminGuesses()
    ]);
  } catch (error) {
    console.error(error);
    showAdminToast(error.message || "Não foi possível salvar a regra.");
  } finally {
    const button = form.querySelector('button[type="submit"]');

    if (button) {
      button.disabled = false;
      button.textContent = "Salvar regra";
    }
  }
}

async function handleRemoveMatchDeadlineConfig() {
  const matchId = getSelectedDeadlineMatchId();

  if (!matchId) {
    showAdminToast("Selecione um jogo para remover a regra específica.");
    return;
  }

  const match = adminState.matches.find((item) => item.id === matchId);
  const title = match ? `${match.home_team} x ${match.away_team}` : "este jogo";

  const confirmed = window.confirm(
    `Remover a regra específica de ${title}?\n\nDepois disso, o jogo voltará a usar a regra geral.`
  );

  if (!confirmed) return;

  try {
    await deleteMatchDeadlineConfig(matchId);

    showAdminToast("Regra específica removida.");
    await loadAdminGuessDeadlineConfig();
    await loadAdminMatches();
  } catch (error) {
    console.error(error);
    showAdminToast(error.message || "Não foi possível remover a regra específica.");
  }
}

/* =========================================================
   RANKING
========================================================= */

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
  const pageSize = 1000;
  let from = 0;
  let allRows = [];

  while (true) {
    const { data, error } = await client
      .from("guesses")
      .select(`
        *,
        participant:participants (*),
        match:matches (*)
      `)
      .order("updated_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const rows = data || [];
    allRows = allRows.concat(rows);

    if (rows.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return allRows;
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

async function adminListWorldCupTeams() {
  return listWorldCupTeams();
}

async function adminGetFinalResults() {
  return getCupFinalResults();
}

async function adminSaveChampionResult(teamId) {
  const team = adminState.worldCupTeams.find((item) => String(item.id) === String(teamId));

  if (!team) {
    throw new Error("Selecione a seleção campeã.");
  }

  return saveCupFinalResults({
    champion_team_id: team.id,
    champion_name: getTeamNameForAdmin(team),
    champion_defined: true
  });
}

async function adminClearChampionResult() {
  return saveCupFinalResults({
    champion_team_id: null,
    champion_name: null,
    champion_defined: false
  });
}

async function adminSearchParticipants(searchTerm) {
  const term = String(searchTerm || "").trim();
  if (!term) return [];

  const client = getSupabaseClient();
  let employeeMatch = null;
  const cpfDigits = cleanCpfDigits(term);

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

/* =========================================================
   COLABORADORES AUTORIZADOS
========================================================= */

function getEmployeeFilters() {
  return {
    search: String(document.querySelector("#employee-filter-search")?.value || "").trim(),
    status: String(document.querySelector("#employee-filter-status")?.value || "").trim(),
    store: String(document.querySelector("#employee-filter-store")?.value || "").trim()
  };
}

async function adminListEmployees(filters = {}) {
  const client = getSupabaseClient();

  let query = client
    .from("authorized_employees")
    .select("*")
    .order("name", { ascending: true });

  const search = String(filters.search || "").trim();
  const store = String(filters.store || "").trim();
  const status = String(filters.status || "").trim();

  if (search) {
    const safeSearch = escapeSupabaseLike(search);
    const cpfSearch = cleanCpfDigits(search);

    const searchParts = [
      `name.ilike.%${safeSearch}%`,
      `store_sector.ilike.%${safeSearch}%`,
      `password_text.ilike.%${safeSearch}%`
    ];

    if (cpfSearch) {
      searchParts.push(`cpf_digits.ilike.%${cpfSearch}%`);
    }

    query = query.or(searchParts.join(","));
  }

  if (store) {
    query = query.ilike("store_sector", `%${escapeSupabaseLike(store)}%`);
  }

  if (status === "active") {
    query = query.eq("active", true);
  }

  if (status === "inactive") {
    query = query.eq("active", false);
  }

  const { data, error } = await query;

  if (error) throw withRlsHint(error, "select", "authorized_employees");

  return data || [];
}

async function adminCreateEmployee(payload) {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("authorized_employees")
    .insert(payload)
    .select()
    .single();

  if (error) throw withRlsHint(error, "insert", "authorized_employees");

  return data;
}

async function adminUpdateEmployee(employeeId, payload) {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("authorized_employees")
    .update(payload)
    .eq("id", employeeId)
    .select()
    .single();

  if (error) throw withRlsHint(error, "update", "authorized_employees");

  return data;
}

async function adminDeleteEmployee(employeeId) {
  const client = getSupabaseClient();

  const { error } = await client
    .from("authorized_employees")
    .delete()
    .eq("id", employeeId);

  if (error) throw withRlsHint(error, "delete", "authorized_employees");

  return true;
}

async function adminResetEmployeePassword(employeeId) {
  return adminUpdateEmployee(employeeId, {
    password_text: "1234",
    must_change_password: true,
    password_changed_at: null
  });
}

function buildEmployeePayloadFromFormData(formData) {
  const cpfDigits = cleanCpfDigits(formData.get("cpf_digits"));

  if (cpfDigits.length !== 11) {
    throw new Error("CPF precisa ter 11 dígitos.");
  }

  const name = String(formData.get("name") || "").trim().replace(/\s+/g, " ");
  const storeSector = String(formData.get("store_sector") || "").trim().replace(/\s+/g, " ");
  const passwordText = String(formData.get("password_text") || "").trim();

  if (!name) throw new Error("Informe o nome.");
  if (!storeSector) throw new Error("Informe a loja.");
  if (!passwordText) throw new Error("Informe a senha.");

  return {
    name,
    cpf_digits: cpfDigits,
    store_sector: storeSector,
    password_text: passwordText,
    active: String(formData.get("active")) === "true",
    must_change_password: String(formData.get("must_change_password")) === "true"
  };
}

function buildEmployeePayloadFromRow(row) {
  const cpfDigits = cleanCpfDigits(row.querySelector('[data-employee-field="cpf_digits"]')?.value || "");

  if (cpfDigits.length !== 11) {
    throw new Error("CPF precisa ter 11 dígitos.");
  }

  const name = String(row.querySelector('[data-employee-field="name"]')?.value || "").trim().replace(/\s+/g, " ");
  const storeSector = String(row.querySelector('[data-employee-field="store_sector"]')?.value || "").trim().replace(/\s+/g, " ");
  const passwordText = String(row.querySelector('[data-employee-field="password_text"]')?.value || "").trim();
  const active = row.querySelector('[data-employee-field="active"]')?.value === "true";
  const mustChangePassword = row.querySelector('[data-employee-field="must_change_password"]')?.value === "true";

  if (!name) throw new Error("Informe o nome.");
  if (!storeSector) throw new Error("Informe a loja.");
  if (!passwordText) throw new Error("Informe a senha.");

  return {
    name,
    cpf_digits: cpfDigits,
    store_sector: storeSector,
    password_text: passwordText,
    active,
    must_change_password: mustChangePassword
  };
}

async function handleEmployeesSearch(event) {
  if (event) {
    event.preventDefault();
  }

  await loadAdminEmployees();
}

async function handleClearEmployeesSearch() {
  const searchInput = document.querySelector("#employee-filter-search");
  const statusInput = document.querySelector("#employee-filter-status");
  const storeInput = document.querySelector("#employee-filter-store");

  if (searchInput) searchInput.value = "";
  if (statusInput) statusInput.value = "";
  if (storeInput) storeInput.value = "";

  await loadAdminEmployees();
}

async function loadAdminEmployees() {
  const body = document.querySelector("#admin-employees-body");

  if (body) {
    body.innerHTML = '<tr><td colspan="7">Buscando colaboradores...</td></tr>';
  }

  try {
    const filters = getEmployeeFilters();

    adminState.employees = await adminListEmployees(filters);

    renderAdminEmployees();
  } catch (error) {
    if (body) {
      body.innerHTML = `<tr><td colspan="7">${escapeHtml(error.message)}</td></tr>`;
    }

    console.error(error);
    showAdminToast(error.message);
  }
}

function renderAdminEmployees() {
  const body = document.querySelector("#admin-employees-body");
  if (!body) return;

  const employees = adminState.employees || [];

  if (!employees.length) {
    body.innerHTML = '<tr><td colspan="7">Nenhum colaborador encontrado.</td></tr>';
    return;
  }

  body.innerHTML = employees.map((employee) => `
    <tr data-employee-row="${escapeHtml(employee.id)}">
      <td>
        <input
          class="admin-table-input"
          data-employee-field="name"
          value="${escapeHtml(employee.name || "")}"
          placeholder="Nome"
        >
      </td>

      <td>
        <input
          class="admin-table-input"
          data-employee-field="cpf_digits"
          value="${escapeHtml(formatCPF(employee.cpf_digits || ""))}"
          placeholder="CPF"
          maxlength="14"
        >
      </td>

      <td>
        <input
          class="admin-table-input"
          data-employee-field="store_sector"
          value="${escapeHtml(employee.store_sector || "")}"
          placeholder="Loja"
        >
      </td>

      <td>
        <input
          class="admin-table-input"
          data-employee-field="password_text"
          value="${escapeHtml(employee.password_text || "")}"
          placeholder="Senha"
        >
      </td>

      <td>
        <select class="admin-table-input" data-employee-field="active">
          <option value="true" ${employee.active ? "selected" : ""}>Ativo</option>
          <option value="false" ${!employee.active ? "selected" : ""}>Inativo</option>
        </select>
      </td>

      <td>
        <select class="admin-table-input" data-employee-field="must_change_password">
          <option value="true" ${employee.must_change_password ? "selected" : ""}>Sim</option>
          <option value="false" ${!employee.must_change_password ? "selected" : ""}>Não</option>
        </select>
      </td>

      <td>
        <div class="admin-row-actions">
          <button type="button" data-save-employee="${escapeHtml(employee.id)}">Salvar</button>
          <button type="button" data-reset-employee-password="${escapeHtml(employee.id)}">Resetar 1234</button>
          <button type="button" data-toggle-employee="${escapeHtml(employee.id)}">
            ${employee.active ? "Desativar" : "Ativar"}
          </button>
          <button class="admin-mini-danger" type="button" data-delete-employee="${escapeHtml(employee.id)}">Excluir</button>
        </div>
      </td>
    </tr>
  `).join("");

  body.querySelectorAll('[data-employee-field="cpf_digits"]').forEach((input) => {
    input.addEventListener("input", (event) => {
      event.target.value = formatCPF(event.target.value);
    });
  });

  body.querySelectorAll("[data-save-employee]").forEach((button) => {
    button.addEventListener("click", handleSaveEmployeeRow);
  });

  body.querySelectorAll("[data-reset-employee-password]").forEach((button) => {
    button.addEventListener("click", handleResetEmployeePassword);
  });

  body.querySelectorAll("[data-toggle-employee]").forEach((button) => {
    button.addEventListener("click", handleToggleEmployee);
  });

  body.querySelectorAll("[data-delete-employee]").forEach((button) => {
    button.addEventListener("click", handleDeleteEmployee);
  });
}

async function handleCreateEmployee(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const formData = new FormData(form);

  try {
    const payload = buildEmployeePayloadFromFormData(formData);

    await adminCreateEmployee(payload);

    form.reset();

    const passwordInput = form.querySelector('[name="password_text"]');
    const activeSelect = form.querySelector('[name="active"]');
    const mustChangeSelect = form.querySelector('[name="must_change_password"]');

    if (passwordInput) passwordInput.value = "1234";
    if (activeSelect) activeSelect.value = "true";
    if (mustChangeSelect) mustChangeSelect.value = "true";

    showAdminToast("Colaborador cadastrado.");
    await loadAdminEmployees();
  } catch (error) {
    console.error(error);
    showAdminToast(error.message);
  }
}

async function handleSaveEmployeeRow(event) {
  const button = event.currentTarget;
  const employeeId = button.dataset.saveEmployee;
  const row = button.closest("[data-employee-row]");

  if (!row || !employeeId) return;

  try {
    button.disabled = true;
    button.textContent = "Salvando...";

    const payload = buildEmployeePayloadFromRow(row);

    await adminUpdateEmployee(employeeId, payload);

    showAdminToast("Colaborador atualizado.");
    await loadAdminEmployees();
  } catch (error) {
    console.error(error);
    showAdminToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Salvar";
  }
}

async function handleResetEmployeePassword(event) {
  const button = event.currentTarget;
  const employeeId = button.dataset.resetEmployeePassword;
  const row = button.closest("[data-employee-row]");
  const name = row?.querySelector('[data-employee-field="name"]')?.value || "este colaborador";

  const confirmed = window.confirm(
    `Resetar a senha de ${name} para 1234?\n\nA pessoa deverá usar 1234 no próximo login.`
  );

  if (!confirmed) return;

  try {
    button.disabled = true;
    button.textContent = "Resetando...";

    await adminResetEmployeePassword(employeeId);

    showAdminToast("Senha resetada para 1234.");
    await loadAdminEmployees();
  } catch (error) {
    console.error(error);
    showAdminToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Resetar 1234";
  }
}

async function handleToggleEmployee(event) {
  const button = event.currentTarget;
  const employeeId = button.dataset.toggleEmployee;
  const row = button.closest("[data-employee-row]");

  const activeSelect = row?.querySelector('[data-employee-field="active"]');
  const currentActive = activeSelect?.value === "true";
  const newActive = !currentActive;

  const name = row?.querySelector('[data-employee-field="name"]')?.value || "este colaborador";

  const confirmed = window.confirm(
    `${newActive ? "Ativar" : "Desativar"} ${name}?\n\n${newActive ? "Ele poderá acessar o bolão." : "Ele não conseguirá acessar o bolão."}`
  );

  if (!confirmed) return;

  try {
    button.disabled = true;
    button.textContent = newActive ? "Ativando..." : "Desativando...";

    await adminUpdateEmployee(employeeId, {
      active: newActive
    });

    showAdminToast(newActive ? "Colaborador ativado." : "Colaborador desativado.");
    await loadAdminEmployees();
  } catch (error) {
    console.error(error);
    showAdminToast(error.message);
  } finally {
    button.disabled = false;
  }
}

async function handleDeleteEmployee(event) {
  const button = event.currentTarget;
  const employeeId = button.dataset.deleteEmployee;
  const row = button.closest("[data-employee-row]");
  const name = row?.querySelector('[data-employee-field="name"]')?.value || "este colaborador";

  const confirmed = window.confirm(
    `Excluir definitivamente ${name} dos colaboradores autorizados?\n\nIsso remove o acesso dele ao bolão, mas não apaga palpites já feitos no ranking.`
  );

  if (!confirmed) return;

  try {
    button.disabled = true;
    button.textContent = "Excluindo...";

    await adminDeleteEmployee(employeeId);

    showAdminToast("Colaborador excluído.");
    await loadAdminEmployees();
  } catch (error) {
    console.error(error);
    showAdminToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Excluir";
  }
}

/* =========================================================
   JOGOS
========================================================= */

async function loadAdminMatches() {
  const list = document.querySelector("#admin-matches-list");
  if (list) list.innerHTML = '<p class="empty">Carregando jogos...</p>';

  try {
    adminState.matches = await adminListMatches();
    renderAdminMatches();
    fillGuessMatchFilter();
    fillDeadlineMatchSelect();
  } catch (error) {
    if (list) list.innerHTML = `<p class="empty">${escapeHtml(error.message)}</p>`;
  }
}

function getDeadlineConfigForAdminMatch(match) {
  return getGuessDeadlineConfigForMatch(
    match?.id,
    adminState.guessDeadlineConfig,
    adminState.matchDeadlineSettings
  );
}

function hasSpecificDeadlineForAdminMatch(match) {
  return Boolean(match?.id && adminState.matchDeadlineSettings?.[match.id]);
}

function renderAdminMatches() {
  const list = document.querySelector("#admin-matches-list");
  if (!list) return;

  if (!adminState.matches.length) {
    list.innerHTML = '<p class="empty">Nenhum jogo cadastrado.</p>';
    return;
  }

  list.innerHTML = adminState.matches.map((match) => {
    const deadlineConfig = getDeadlineConfigForAdminMatch(match);
    const hasSpecific = hasSpecificDeadlineForAdminMatch(match);

    return `
      <form class="admin-match-card" data-match-id="${escapeHtml(match.id)}">
        <div class="admin-match-card__header">
          <strong>${escapeHtml(match.home_team)} x ${escapeHtml(match.away_team)}</strong>
          <span class="status ${statusClass(match.status)}">${escapeHtml(match.status || "aberto")}</span>
        </div>

        <div class="admin-match-card__meta">
          <span>${formatAdminDate(match.match_date)}</span>
          <span>${escapeHtml(match.phase || "Fase nao informada")}</span>
          <span>${formatAdminScore(match)}</span>
          <span>ID football-data: ${escapeHtml(match.api_football_fixture_id || "-")}</span>
          <span>${hasSpecific ? "Regra específica" : "Regra geral"}: ${escapeHtml(getGuessDeadlineShortText(deadlineConfig))}</span>
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
            <input name="phase" list="admin-phase-list" value="${escapeHtml(match.phase || "")}">
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

          <label>
            ID football-data.org
            <input name="api_football_fixture_id" type="number" min="0" step="1" value="${match.api_football_fixture_id ?? ""}">
          </label>
        </div>

        <div class="admin-match-card__actions">
          <button type="submit">Salvar alterações</button>
          <button class="button-secondary" type="button" data-select-deadline-match="${escapeHtml(match.id)}">Configurar prazo deste jogo</button>
          <button class="admin-mini-danger" type="button" data-delete-match="${escapeHtml(match.id)}">Excluir jogo</button>
        </div>
      </form>
    `;
  }).join("");

  list.querySelectorAll(".admin-match-card").forEach((form) => {
    form.addEventListener("submit", handleUpdateMatch);
  });

  list.querySelectorAll("[data-delete-match]").forEach((button) => {
    button.addEventListener("click", handleDeleteMatch);
  });

  list.querySelectorAll("[data-select-deadline-match]").forEach((button) => {
    button.addEventListener("click", () => {
      const scope = document.querySelector("#admin-deadline-scope");
      const matchSelect = document.querySelector("#admin-deadline-match-id");

      if (scope) scope.value = "match";
      if (matchSelect) matchSelect.value = button.dataset.selectDeadlineMatch || "";

      renderGuessDeadlineConfigForm();

      document.querySelector(".admin-deadline-panel")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
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
      away_score: null,
      api_football_fixture_id: normalizeNullableNumber(formData.get("api_football_fixture_id"))
    });

    form.reset();
    form.elements.status.value = "aberto";
    showAdminToast("Jogo cadastrado.");

    await loadAdminMatches();
    await loadAdminGuessDeadlineConfig();
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
    await loadAdminGuessDeadlineConfig();
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
    `Tem certeza que deseja excluir ${title}?\n\nIsso também remove os palpites e regras específicas desse jogo. Essa ação não pode ser desfeita.`
  );

  if (!confirmed) return;

  try {
    button.disabled = true;
    button.textContent = "Excluindo...";

    await adminDeleteMatch(matchId);

    showAdminToast("Jogo excluído.");
    await Promise.all([loadAdminMatches(), loadAdminRanking(), loadAdminGuesses()]);
    await loadAdminGuessDeadlineConfig();
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
    away_score: awayScore,
    api_football_fixture_id: normalizeNullableNumber(formData.get("api_football_fixture_id"))
  };
}

/* =========================================================
   RANKING
========================================================= */

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

/* =========================================================
   PALPITES
========================================================= */

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

/* =========================================================
   CAMPEAO E ARTILHEIRO
========================================================= */

async function loadAdminFinalResults() {
  const current = document.querySelector("#admin-final-results-current");
  const select = document.querySelector("#admin-champion-team-id");

  if (current) {
    current.innerHTML = 'Campeã oficial: <strong>carregando...</strong>';
  }

  try {
    const [teams, finalResults] = await Promise.all([
      adminListWorldCupTeams(),
      adminGetFinalResults()
    ]);

    adminState.worldCupTeams = teams;
    adminState.finalResults = finalResults;

    fillChampionResultSelect(select);
    renderAdminFinalResults();
  } catch (error) {
    if (current) {
      current.innerHTML = `Campeã oficial: <strong>${escapeHtml(error.message)}</strong>`;
    }
  }
}

function fillChampionResultSelect(select = document.querySelector("#admin-champion-team-id")) {
  if (!select) return;

  const selectedChampionId = adminState.finalResults?.champion_team_id || "";

  select.innerHTML = `
    <option value="">Selecione a campeã</option>
    ${adminState.worldCupTeams.map((team) => `
      <option value="${escapeHtml(team.id)}" ${String(team.id) === String(selectedChampionId) ? "selected" : ""}>
        ${escapeHtml(getTeamNameForAdmin(team))}
      </option>
    `).join("")}
  `;
}

function renderAdminFinalResults() {
  const current = document.querySelector("#admin-final-results-current");
  if (!current) return;

  const championName = getFinalChampionName(adminState.finalResults);
  const championDefined = Boolean(adminState.finalResults?.champion_defined);

  current.innerHTML = `
    Campeã oficial:
    <strong>${escapeHtml(championDefined ? championName || "não definida" : "não definida")}</strong>
  `;
}

async function handleSaveFinalResults(event) {
  event.preventDefault();

  const button = event.target.querySelector('button[type="submit"]');
  const championTeamId = document.querySelector("#admin-champion-team-id")?.value || "";

  if (button) {
    button.disabled = true;
    button.textContent = "Salvando...";
  }

  try {
    adminState.finalResults = await adminSaveChampionResult(championTeamId);
    renderAdminFinalResults();
    showAdminToast("Seleção campeã salva.");
    await loadAdminRanking();
  } catch (error) {
    showAdminToast(error.message);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Salvar seleção campeã";
    }
  }
}

async function handleClearChampionResult() {
  const button = document.querySelector("#admin-clear-champion-result");
  const select = document.querySelector("#admin-champion-team-id");

  if (button) {
    button.disabled = true;
    button.textContent = "Limpando...";
  }

  try {
    adminState.finalResults = await adminClearChampionResult();
    if (select) select.value = "";
    renderAdminFinalResults();
    showAdminToast("Campeã oficial limpa.");
    await loadAdminRanking();
  } catch (error) {
    showAdminToast(error.message);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Limpar campeã oficial";
    }
  }
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

/* =========================================================
   LIMPEZA
========================================================= */

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
  await Promise.all([
    loadAdminRanking(),
    loadAdminGuesses(),
    loadAdminPredictions()
  ]);
}

/* =========================================================
   EXPORTAÇÃO
========================================================= */

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

/* =========================================================
   HELPERS
========================================================= */

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

function getTeamNameForAdmin(team) {
  return team?.name || team?.country_name || team?.label || "";
}

function getFinalChampionName(finalResults) {
  if (!finalResults) return "";

  if (finalResults.champion_name) {
    return finalResults.champion_name;
  }

  const championTeam = adminState.worldCupTeams.find((team) => {
    return String(team.id) === String(finalResults.champion_team_id);
  });

  return getTeamNameForAdmin(championTeam);
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

function cleanCpfDigits(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 11);
}

function formatCPF(value) {
  const digits = cleanCpfDigits(value);

  if (digits.length <= 3) return digits;

  if (digits.length <= 6) {
    return digits.replace(/(\d{3})(\d+)/, "$1.$2");
  }

  if (digits.length <= 9) {
    return digits.replace(/(\d{3})(\d{3})(\d+)/, "$1.$2.$3");
  }

  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, "$1.$2.$3-$4");
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

  return new Error(`${message} Crie uma policy de ${action} para a tabela ${table}.`);
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
