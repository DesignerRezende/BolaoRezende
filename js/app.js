const state = {
  participant: null,
  matches: [],
  guesses: [],
  guessCounts: {},
  worldCupTeams: [],
  brazilPlayers: [],
  cupPick: null,
  participantPrediction: null,
  predictionStep: 1,
  selectedChampion: null,
  selectedTopScorer: null,
  selectedChampionTeamId: null,
  selectedTopScorerPlayerId: null,
  matchFilter: "todos",
  openPhase: "Grupo A"
};

const PHASE_SECTIONS = [
  "Grupo A",
  "Grupo B",
  "Grupo C",
  "Grupo D",
  "Grupo E",
  "Grupo F",
  "Grupo G",
  "Grupo H",
  "Grupo I",
  "Grupo J",
  "Grupo K",
  "Grupo L",
  "Fase de 32",
  "Oitavas de final",
  "Quartas de final",
  "Semifinal",
  "Disputa de 3º lugar",
  "Final"
];

const KNOCKOUT_PHASES = [
  "Fase de 32",
  "Oitavas de final",
  "Quartas de final",
  "Semifinal",
  "Disputa de 3º lugar",
  "Final"
];

const participantForm = document.querySelector("#participant-form");
const participantCurrent = document.querySelector("#participant-current");
const matchesList = document.querySelector("#matches-list");
const liveBox = document.querySelector("#live-box");
const refreshButton = document.querySelector("#refresh-button");
const toast = document.querySelector("#toast");
const predictionModal = document.querySelector("#prediction-modal");
const predictionStepLabel = document.querySelector("#prediction-step-label");
const predictionTitle = document.querySelector("#prediction-title");
const predictionSubtitle = document.querySelector("#prediction-subtitle");
const predictionGrid = document.querySelector("#prediction-grid");
const predictionBackButton = document.querySelector("#prediction-back-button");
const predictionNextButton = document.querySelector("#prediction-next-button");

const rankingPanel = document.querySelector("#ranking-panel");
const todayGamesPanel = document.querySelector("#today-games-panel");
const todayGamesList = document.querySelector("#today-games-list");
const bottomNavToday = document.querySelector("#bottom-nav-today");
const bottomNavRanking = document.querySelector("#bottom-nav-ranking");
const bottomNav = document.querySelector(".bottom-nav");

const GUESS_CLOSE_MINUTES_BEFORE_MATCH = 20;
let countdownTimer = null;

if (participantForm) {
  participantForm.addEventListener("submit", handleParticipantSubmit);
}

if (refreshButton) {
  refreshButton.addEventListener("click", loadDashboard);
}

document.querySelectorAll("[data-match-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    state.matchFilter = button.dataset.matchFilter || "todos";

    document.querySelectorAll("[data-match-filter]").forEach((item) => {
      item.classList.toggle("is-active", item === button);
    });

    renderMatches();
  });
});

if (predictionBackButton) {
  predictionBackButton.addEventListener("click", handlePredictionBack);
}

if (predictionNextButton) {
  predictionNextButton.addEventListener("click", (event) => {
    event.preventDefault();
    handlePredictionNext();
  });
}

if (bottomNavToday) {
  bottomNavToday.addEventListener("click", () => {
    renderTodayGames();
    openFloatingPanel(todayGamesPanel);
  });
}

if (bottomNavRanking) {
  bottomNavRanking.addEventListener("click", async () => {
    await renderRanking();
    openFloatingPanel(rankingPanel);
  });
}

document.querySelectorAll("[data-close-floating-panel]").forEach((button) => {
  button.addEventListener("click", closeFloatingPanels);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeFloatingPanels();
  }
});

function hidePublicBottomNav() {
  if (bottomNav) {
    bottomNav.style.display = "none";
  }

  document.body.classList.add("public-bottom-nav-hidden");
}

function showPublicBottomNav() {
  const predictionIsOpen = predictionModal && !predictionModal.hidden;
  const floatingPanelIsOpen = document.body.classList.contains("floating-panel-open");

  if (predictionIsOpen || floatingPanelIsOpen) {
    return;
  }

  if (bottomNav) {
    bottomNav.style.display = "";
  }

  document.body.classList.remove("public-bottom-nav-hidden");
}

async function initApp() {
  console.log("initApp iniciou");

  await createOrUpdateParticipantFromEmployee();

  if (!state.participant) {
    showToast("Erro ao carregar dados do participante.");
    return;
  }

  console.log("Participant atual:", state.participant);

  await loadCupPredictionData();
  showCurrentParticipant();

  console.log("Verificando prediction para:", state.participant?.id);
  console.log("Prediction encontrada:", state.participantPrediction);

  maybeOpenPredictionModal();

  await loadDashboard();
}

async function createOrUpdateParticipantFromEmployee() {
  const employee = getCurrentEmployee();

  if (!employee) {
    showToast("Funcionário não identificado. Faça login novamente.");
    return;
  }

  try {
    const client = getSupabaseClient();

    const { data: existingParticipants, error: searchError } = await client
      .from("participants")
      .select("*")
      .eq("name", employee.name)
      .eq("store_sector", employee.store_sector)
      .limit(1);

    if (searchError) {
      throw searchError;
    }

    if (existingParticipants && existingParticipants.length > 0) {
      state.participant = existingParticipants[0];
    } else {
      const { data: newParticipant, error: createError } = await client
        .from("participants")
        .insert({
          name: employee.name,
          store_sector: employee.store_sector || "",
          phone: null
        })
        .select()
        .single();

      if (createError) {
        throw createError;
      }

      state.participant = newParticipant;
    }

    hideParticipantForm();
    showCurrentParticipant();
  } catch (error) {
    console.error("Erro ao criar/carregar participante:", error);
    showToast("Erro ao carregar dados do participante.");
  }
}

function hideParticipantForm() {
  if (participantForm) {
    participantForm.hidden = true;
    participantForm.style.display = "none";
  }
}

function loadSavedParticipant() {
  // Não usado. O participante vem do login por CPF.
}

async function handleParticipantSubmit(event) {
  event.preventDefault();
  showToast("O cadastro agora é feito automaticamente pelo CPF.");
}

function showCurrentParticipant() {
  if (!participantCurrent || !state.participant) return;

  hideParticipantForm();

  participantCurrent.hidden = false;
  participantCurrent.style.display = "block";

  const champion = getSelectedTeam();
  const scorer = getSelectedPlayer();
  const hasPrediction = Boolean(state.participantPrediction);

  participantCurrent.innerHTML = `
    <div class="participant-name-only">
      ${escapeHtml(state.participant.name)}
    </div>

    ${hasPrediction ? `
      <div class="participant-picks">
        <div>
          <span>Meu campeão:</span>
          <strong>${renderFlag(champion)} ${escapeHtml(getTeamCode(champion))} · ${escapeHtml(getTeamName(champion))}</strong>
        </div>

        <div>
          <span>Meu artilheiro:</span>
          <strong>${escapeHtml(getPlayerName(scorer))} · ${escapeHtml(getPlayerPosition(scorer))}</strong>
        </div>

        <div>
          <span>Escolhido em:</span>
          <strong>${formatDateSentence(getPredictionDate(state.participantPrediction))}</strong>
        </div>
      </div>
    ` : `
      <div class="participant-picks">
        <div>
          <span>Primeiro acesso</span>
          <strong>Complete o popup de campeão e artilheiro para continuar.</strong>
        </div>
      </div>
    `}
  `;
}

async function loadCupPredictionData() {
  try {
    console.log("Carregando dados de palpites especiais para participante:", state.participant?.id);

    const [teams, players, pick] = await Promise.all([
      listWorldCupTeams(),
      listBrazilSquadPlayers(),
      getParticipantPrediction(state.participant?.id)
    ]);

    state.worldCupTeams = teams.sort(sortTeamsForPrediction);
    state.brazilPlayers = players.sort((a, b) => getPlayerName(a).localeCompare(getPlayerName(b), "pt-BR"));
    state.participantPrediction = pick;

    console.log("Dados carregados - Teams:", state.worldCupTeams.length, "Players:", state.brazilPlayers.length, "Prediction:", pick);
  } catch (error) {
    console.error("Erro ao carregar palpites especiais:", error);
    state.worldCupTeams = [];
    state.brazilPlayers = [];
    state.participantPrediction = null;
  }
}

async function loadDashboard() {
  try {
    state.matches = await listMatches();
    state.guessCounts = await getGuessCounts();
    state.guesses = await listParticipantGuesses(state.participant?.id);

    await loadCupPredictionData();

    showCurrentParticipant();
    renderLiveBox();
    renderMatches();
    renderTodayGames();
    startCountdowns();
    await renderRanking();
    maybeOpenPredictionModal();
  } catch (error) {
    console.error("Erro ao carregar dashboard:", error);

    if (matchesList) {
      matchesList.innerHTML = '<p class="empty">Não foi possível carregar os jogos. Confira o Supabase.</p>';
    }

    if (liveBox) {
      liveBox.textContent = "Erro ao carregar jogos.";
    }
  }
}

function renderLiveBox() {
  if (!liveBox) return;

  if (!state.matches.length) {
    liveBox.innerHTML = '<p class="empty">Nenhum jogo cadastrado.</p>';
    return;
  }

  const now = new Date();
  const liveMatch = state.matches.find((match) => match.status === "ao vivo");
  const nextMatch = state.matches.find((match) => match.status !== "encerrado" && new Date(match.match_date) >= now);
  const match = liveMatch || nextMatch || state.matches[state.matches.length - 1];

  const closed = isGuessClosed(match);
  const countdown = getCountdownText(match);
  const closeTime = getGuessCloseDate(match);
  const homeTeam = findWorldCupTeamByName(match.home_team);
  const awayTeam = findWorldCupTeamByName(match.away_team);

  liveBox.innerHTML = `
    <div class="next-match-card">
      <div class="next-match-team">
        <span class="next-match-flag">${renderMatchFlag(homeTeam, match.home_team)}</span>
        <strong>${escapeHtml(getMatchTeamCode(homeTeam, match.home_team))}</strong>
        <small>${escapeHtml(match.home_team)}</small>
      </div>

      <div class="next-match-center">
        <span class="next-match-score">${formatScore(match)}</span>
        <span class="next-match-vs">VS</span>
      </div>

      <div class="next-match-team">
        <span class="next-match-flag">${renderMatchFlag(awayTeam, match.away_team)}</span>
        <strong>${escapeHtml(getMatchTeamCode(awayTeam, match.away_team))}</strong>
        <small>${escapeHtml(match.away_team)}</small>
      </div>
    </div>

    <div class="countdown-box">
      <span class="countdown-label">${closed ? "Palpites encerrados" : "Tempo restante"}</span>
      <strong class="countdown-time">${countdown}</strong>
      <span class="countdown-sub">
        ${closed ? "Os palpites deste jogo já foram fechados." : `Palpites abertos até ${formatTime(closeTime)}`}
      </span>
    </div>

    <span class="status ${statusClass(match.status)}">${escapeHtml(match.status || "aberto")}</span>
    <p>${formatDate(match.match_date)} · ${escapeHtml(match.phase || "Fase não informada")}</p>
    <p><strong>${state.guessCounts[match.id] || 0}</strong> palpites registrados</p>
  `;
}

function renderMatches() {
  if (!matchesList) return;

  if (!state.matches.length) {
    matchesList.innerHTML = '<p class="empty">Nenhum jogo cadastrado ainda.</p>';
    return;
  }

  const filteredMatches = getFilteredMatches();
  const matchesByPhase = groupMatchesByPhase(filteredMatches);

  matchesList.innerHTML = PHASE_SECTIONS.map((phaseName) => {
    const phaseMatches = matchesByPhase[phaseName] || [];
    const isOpen = state.openPhase === phaseName;
    const isKnockout = KNOCKOUT_PHASES.includes(phaseName);
    const isLocked = isKnockout && phaseMatches.length === 0;

    return `
      <section class="phase-accordion ${isOpen ? "is-open" : ""} ${isLocked ? "is-locked" : ""}">
        <button
          type="button"
          class="phase-accordion__header"
          data-phase-toggle="${escapeHtml(phaseName)}"
          aria-expanded="${isOpen ? "true" : "false"}"
        >
          <span class="phase-accordion__title">
            ${isLocked ? "🔒" : "⚽"} ${escapeHtml(phaseName)}
          </span>

          <span class="phase-accordion__meta">
            ${isLocked ? "Em breve" : `${phaseMatches.length} jogo${phaseMatches.length === 1 ? "" : "s"}`}
          </span>

          <span class="phase-accordion__icon">${isOpen ? "−" : "+"}</span>
        </button>

        <div class="phase-accordion__body" ${isOpen ? "" : "hidden"}>
          ${
            isLocked
              ? `
                <div class="phase-locked-card">
                  <strong>Fase bloqueada</strong>
                  <span>Os confrontos serão liberados quando forem definidos.</span>
                </div>
              `
              : phaseMatches.length
                ? `<div class="phase-matches-grid">${phaseMatches.map(renderMatchCard).join("")}</div>`
                : `
                  <div class="phase-locked-card">
                    <strong>Nenhum jogo nesta seção</strong>
                    <span>Os jogos aparecerão aqui quando forem cadastrados no Supabase.</span>
                  </div>
                `
          }
        </div>
      </section>
    `;
  }).join("");

  document.querySelectorAll("[data-phase-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const phaseName = button.dataset.phaseToggle;
      state.openPhase = state.openPhase === phaseName ? "" : phaseName;
      renderMatches();
    });
  });

  document.querySelectorAll(".guess-form").forEach((form) => {
    form.addEventListener("submit", handleGuessSubmit);
  });
}

function renderMatchCard(match) {
  const locked = isGuessClosed(match);
  const savedGuess = state.guesses.find((guess) => guess.match_id === match.id);
  const disabled = !state.participant || locked ? "disabled" : "";
  const buttonText = savedGuess ? "Atualizar palpite" : "Salvar palpite";
  const buttonClass = savedGuess ? "button-update-guess" : "button-save-guess";
  const closeTime = getGuessCloseDate(match);
  const guessTimestamp = savedGuess?.updated_at || savedGuess?.created_at;
  const guessAction = getGuessAction(savedGuess);
  const homeTeam = findWorldCupTeamByName(match.home_team);
  const awayTeam = findWorldCupTeamByName(match.away_team);

  return `
    <article class="match-card" data-locked="${locked}">
      <div class="match-header">
        <div>
          <div class="match-meta">${escapeHtml(match.phase || "Fase não informada")}</div>
          <div class="match-timer" data-countdown-match-id="${match.id}">${getCountdownText(match)}</div>
          <div class="match-countdown">
            ${locked ? "Palpites encerrados" : `Palpites abertos até ${formatTime(closeTime)}`}
          </div>
        </div>

        <span class="status ${statusClass(match.status)}">${escapeHtml(match.status || "aberto")}</span>
      </div>

      ${savedGuess ? `
        <div class="saved-guess">
          <strong>Seu palpite: ${escapeHtml(match.home_team)} ${savedGuess.home_score_guess} x ${savedGuess.away_score_guess} ${escapeHtml(match.away_team)}</strong>
          <span>${guessAction} em ${formatDateSentence(guessTimestamp)}</span>
        </div>
      ` : ""}

      <form class="guess-form" data-match-id="${match.id}">
        <div class="match-team">
          <span class="match-team__flag">${renderMatchFlag(homeTeam, match.home_team)}</span>
          <strong>${escapeHtml(getMatchTeamCode(homeTeam, match.home_team))}</strong>
          <span>${escapeHtml(match.home_team)}</span>
        </div>

        <label class="guess-score" aria-label="${escapeHtml(match.home_team)}">
          <input type="number" min="0" name="home_score_guess" value="${savedGuess?.home_score_guess ?? ""}" ${disabled} required>
        </label>

        <span class="match-versus">:</span>

        <label class="guess-score" aria-label="${escapeHtml(match.away_team)}">
          <input type="number" min="0" name="away_score_guess" value="${savedGuess?.away_score_guess ?? ""}" ${disabled} required>
        </label>

        <div class="match-team">
          <span class="match-team__flag">${renderMatchFlag(awayTeam, match.away_team)}</span>
          <strong>${escapeHtml(getMatchTeamCode(awayTeam, match.away_team))}</strong>
          <span>${escapeHtml(match.away_team)}</span>
        </div>

        <div class="match-card__footer">
          <span>${formatDate(match.match_date)} &middot; ${state.guessCounts[match.id] || 0} palpites</span>
          <button class="${buttonClass}" type="submit" ${disabled}>${locked ? "Fechado" : buttonText}</button>
        </div>
      </form>
    </article>
  `;
}

function groupMatchesByPhase(matches) {
  return matches.reduce((acc, match) => {
    const phaseName = normalizePhaseName(match.phase);

    if (!acc[phaseName]) {
      acc[phaseName] = [];
    }

    acc[phaseName].push(match);
    return acc;
  }, {});
}

function normalizePhaseName(phase) {
  const value = String(phase || "").trim();

  if (!value) return "Grupo A";

  const normalized = normalizeText(value);

  const direct = PHASE_SECTIONS.find((item) => normalizeText(item) === normalized);
  if (direct) return direct;

  const groupMatch = normalized.match(/grupo\s*([a-l])/i);
  if (groupMatch) {
    return `Grupo ${groupMatch[1].toUpperCase()}`;
  }

  if (normalized.includes("32")) return "Fase de 32";
  if (normalized.includes("oitavas")) return "Oitavas de final";
  if (normalized.includes("quartas")) return "Quartas de final";
  if (normalized.includes("semi")) return "Semifinal";
  if (normalized.includes("3") || normalized.includes("terceiro")) return "Disputa de 3º lugar";
  if (normalized.includes("final")) return "Final";

  return value;
}

function getFilteredMatches() {
  const now = new Date();

  return state.matches.filter((match) => {
    const status = String(match.status || "aberto").toLowerCase();
    const matchDate = new Date(match.match_date);

    if (state.matchFilter === "ao vivo") return status === "ao vivo";
    if (state.matchFilter === "encerrado") return status === "encerrado";
    if (state.matchFilter === "proximos") return status !== "encerrado" && matchDate >= now;

    return true;
  });
}

function maybeOpenPredictionModal() {
  if (!state.participant || state.participantPrediction) {
    return;
  }

  console.log("Abrindo popup de primeiro acesso");
  openPredictionModal();
}

function openPredictionModal() {
  if (!predictionModal) return;

  if (state.participantPrediction) {
    closePredictionModal();
    showToast("Suas escolhas já foram confirmadas.");
    return;
  }

  closeFloatingPanels();
  hidePublicBottomNav();

  state.predictionStep = 1;
  state.selectedChampion = null;
  state.selectedTopScorer = null;
  state.selectedChampionTeamId = null;
  state.selectedTopScorerPlayerId = null;

  predictionModal.hidden = false;
  predictionModal.style.display = "";
  document.body.classList.add("modal-open");
  document.body.classList.add("prediction-modal-open");

  renderPredictionStep();
}

function closePredictionModal() {
  if (!predictionModal) return;

  predictionModal.hidden = true;
  predictionModal.style.display = "none";
  document.body.classList.remove("modal-open");
  document.body.classList.remove("prediction-modal-open");

  showPublicBottomNav();
}

function renderPredictionStep() {
  if (!predictionGrid || !predictionTitle || !predictionStepLabel || !predictionNextButton) return;

  const isTeamStep = state.predictionStep === 1;

  predictionStepLabel.textContent = isTeamStep ? "1 de 2" : "2 de 2";
  predictionTitle.textContent = isTeamStep ? "Quem vai ganhar a Copa?" : "Quem será o artilheiro do Brasil?";
  predictionSubtitle.textContent = isTeamStep
    ? "Essa escolha será usada como critério de desempate e não poderá ser alterada."
    : "Essa escolha também será usada como critério de desempate e não poderá ser alterada.";

  predictionBackButton.hidden = isTeamStep;
  predictionNextButton.textContent = isTeamStep ? "Continuar" : "Confirmar escolhas";
  predictionNextButton.disabled = isTeamStep ? !state.selectedChampion : !state.selectedTopScorer;

  predictionGrid.className = `prediction-grid ${isTeamStep ? "prediction-grid--teams" : "prediction-grid--players"}`;
  predictionGrid.innerHTML = isTeamStep ? renderTeamCards() : renderPlayerCards();

  predictionGrid.querySelectorAll("[data-prediction-id]").forEach((card) => {
    card.addEventListener("click", () => {
      if (isTeamStep) {
        state.selectedChampion = state.worldCupTeams.find((team) => String(team.id) === String(card.dataset.predictionId)) || null;
        state.selectedChampionTeamId = state.selectedChampion?.id || null;
      } else {
        state.selectedTopScorer = state.brazilPlayers.find((player) => String(player.id) === String(card.dataset.predictionId)) || null;
        state.selectedTopScorerPlayerId = state.selectedTopScorer?.id || null;
      }

      renderPredictionStep();
    });
  });
}

function renderTeamCards() {
  if (!state.worldCupTeams.length) {
    return '<p class="empty">Cadastre as seleções em world_cup_teams para liberar esta escolha.</p>';
  }

  return state.worldCupTeams.map((team) => {
    const selected = String(team.id) === String(state.selectedChampion?.id);
    const highlighted = isBrazilTeam(team);
    const code = getTeamCode(team);
    const group = getTeamGroup(team);

    return `
      <button class="prediction-card prediction-card--team ${highlighted ? "is-highlighted" : ""} ${selected ? "is-selected" : ""}" type="button" data-prediction-id="${escapeHtml(team.id)}">
        <span class="prediction-flag">${renderFlag(team)}</span>
        <span class="prediction-code">${escapeHtml(code)}</span>
        <strong>${escapeHtml(getTeamName(team))}</strong>
        ${group ? `<span class="prediction-meta">${escapeHtml(group)}</span>` : ""}
      </button>
    `;
  }).join("");
}

function renderPlayerCards() {
  if (!state.brazilPlayers.length) {
    return '<p class="empty">Cadastre os jogadores em brazil_squad_players para liberar esta escolha.</p>';
  }

  return state.brazilPlayers.map((player) => {
    const selected = String(player.id) === String(state.selectedTopScorer?.id);

    return `
      <button class="prediction-card prediction-card--player ${selected ? "is-selected" : ""}" type="button" data-prediction-id="${escapeHtml(player.id)}">
        <span class="prediction-player-photo">${renderPlayerPhoto(player)}</span>
        <strong>${escapeHtml(getPlayerName(player))}</strong>
        <span class="prediction-meta">${escapeHtml(getPlayerPosition(player))}</span>
        <span class="prediction-tag">Seleção Brasileira</span>
      </button>
    `;
  }).join("");
}

function handlePredictionBack() {
  state.predictionStep = 1;
  renderPredictionStep();
}

async function handlePredictionNext() {
  if (predictionNextButton?.dataset.loading === "true") return;

  if (state.predictionStep === 1) {
    if (!state.selectedChampion) {
      showPredictionError("Escolha uma seleção campeã para continuar.");
      showToast("Escolha uma seleção campeã para continuar.");
      return;
    }

    state.predictionStep = 2;
    renderPredictionStep();
    return;
  }

  if (!state.selectedChampion) {
    showPredictionError("Escolha uma seleção campeã para continuar.");
    showToast("Escolha uma seleção campeã para continuar.");
    return;
  }

  if (!state.selectedTopScorer) {
    showPredictionError("Escolha um artilheiro.");
    showToast("Escolha um artilheiro.");
    return;
  }

  if (!state.participant) return;

  const selectedChampion = state.selectedChampion;
  const selectedTopScorer = state.selectedTopScorer;

  const payload = {
    participant_id: state.participant.id,
    champion_team_id: selectedChampion.id,
    champion_name: getTeamName(selectedChampion),
    champion_code: getTeamCode(selectedChampion),
    champion_flag_emoji: getFirstField(selectedChampion, ["flag_emoji"]),
    champion_flag_url: getFirstField(selectedChampion, ["flag_url"]),
    top_scorer_player_id: selectedTopScorer.id,
    top_scorer_name: getPlayerName(selectedTopScorer),
    selected_at: new Date().toISOString()
  };

  console.log("selectedChampion:", selectedChampion);
  console.log("selectedTopScorer:", selectedTopScorer);
  console.log("Payload final:", payload);

  const missingFields = [
    ["participant_id", payload.participant_id],
    ["champion_team_id", payload.champion_team_id],
    ["champion_name", payload.champion_name],
    ["top_scorer_player_id", payload.top_scorer_player_id],
    ["top_scorer_name", payload.top_scorer_name]
  ].filter(([, value]) => !value);

  if (missingFields.length) {
    const message = `Dados incompletos: ${missingFields.map(([field]) => field).join(", ")}.`;
    showPredictionError(message);
    showToast(message);
    return;
  }

  try {
    predictionNextButton.dataset.loading = "true";
    predictionNextButton.disabled = true;
    predictionNextButton.textContent = "Salvando...";

    const result = await saveParticipantPrediction(payload);

    state.participantPrediction = result;

    closePredictionModal();
    showCurrentParticipant();
    goToGuessesSection();
    showToast("Escolhas salvas com sucesso.");
  } catch (error) {
    console.error("Erro ao confirmar escolhas:", error);

    const alreadyConfirmed =
      error?.code === "23505" ||
      String(error?.message || "").toLowerCase().includes("duplicate") ||
      String(error?.message || "").toLowerCase().includes("unique");

    const message = alreadyConfirmed
      ? "Você já confirmou suas escolhas. Elas não podem ser alteradas."
      : (error.message || "Não foi possível confirmar as escolhas.");

    showToast(message);
    showPredictionError(message);
  } finally {
    if (predictionNextButton) {
      predictionNextButton.dataset.loading = "false";
      predictionNextButton.disabled = false;
      predictionNextButton.textContent = "Confirmar escolhas";
    }
  }
}

function goToGuessesSection() {
  const target = document.querySelector("#guesses-section") || matchesList?.closest(".panel") || matchesList;
  if (!target) return;

  window.location.hash = "guesses-section";

  window.setTimeout(() => {
    target.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }, 120);
}

function showPredictionError(message) {
  if (!predictionGrid) return;

  const existingError = predictionGrid.querySelector(".prediction-error");
  if (existingError) existingError.remove();

  const visibleError = document.createElement("div");
  visibleError.className = "prediction-error";
  visibleError.textContent = message;
  predictionGrid.prepend(visibleError);
}

async function handleGuessSubmit(event) {
  event.preventDefault();

  if (!state.participant) {
    showToast("Faça login antes de palpitar.");
    return;
  }

  const form = event.currentTarget;
  const match = state.matches.find((item) => item.id === form.dataset.matchId);

  if (!match) {
    showToast("Jogo não encontrado.");
    return;
  }

  if (isGuessClosed(match)) {
    showToast("O prazo para este palpite encerrou 20 minutos antes do jogo.");
    await loadDashboard();
    return;
  }

  const formData = new FormData(form);
  const button = form.querySelector("button");

  try {
    if (button) button.disabled = true;

    await registerGuess({
      participant_id: state.participant.id,
      match_id: match.id,
      home_score_guess: formData.get("home_score_guess"),
      away_score_guess: formData.get("away_score_guess")
    });

    showToast("Palpite salvo.");
    await loadDashboard();
  } catch (error) {
    console.error("Erro ao salvar palpite:", error);
    showToast("Não foi possível salvar o palpite.");
  } finally {
    if (button && !isGuessClosed(match)) button.disabled = false;
  }
}

function isGuessClosed(match) {
  if (!match) return true;

  const status = String(match.status || "aberto").toLowerCase();

  if (status === "ao vivo" || status === "encerrado") {
    return true;
  }

  const matchDate = new Date(match.match_date);

  if (Number.isNaN(matchDate.getTime())) {
    return true;
  }

  const closeDate = getGuessCloseDate(match);
  const now = new Date();

  return now >= closeDate;
}

function getGuessCloseDate(match) {
  const matchDate = new Date(match.match_date);
  return new Date(matchDate.getTime() - GUESS_CLOSE_MINUTES_BEFORE_MATCH * 60 * 1000);
}

function startCountdowns() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
  }

  updateCountdowns();
  countdownTimer = setInterval(updateCountdowns, 1000);
}

function updateCountdowns() {
  if (!state.matches.length) return;

  renderLiveBox();

  document.querySelectorAll("[data-countdown-match-id]").forEach((element) => {
    const match = state.matches.find((item) => item.id === element.dataset.countdownMatchId);
    if (!match) return;

    element.textContent = getCountdownText(match);

    const card = element.closest(".match-card");
    const locked = isGuessClosed(match);
    if (!card || card.dataset.locked === String(locked)) return;

    const form = card.querySelector(".guess-form");
    const countdown = card.querySelector(".match-countdown");
    const button = form?.querySelector("button");

    card.dataset.locked = String(locked);

    if (countdown) {
      countdown.textContent = locked ? "Palpites encerrados" : `Palpites abertos até ${formatTime(getGuessCloseDate(match))}`;
    }

    form?.querySelectorAll("input").forEach((input) => {
      input.disabled = locked;
    });

    if (button) {
      button.disabled = locked;
      if (locked) button.textContent = "Fechado";
    }
  });
}

function getCountdownText(match) {
  if (!match?.match_date) return "Data não informada";

  const status = String(match.status || "aberto").toLowerCase();

  if (status === "encerrado") {
    return "Jogo encerrado";
  }

  const matchDate = new Date(match.match_date);
  const now = new Date();
  const diff = matchDate.getTime() - now.getTime();

  if (Number.isNaN(matchDate.getTime())) {
    return "Data inválida";
  }

  if (diff <= 0) {
    return "Jogo iniciado";
  }

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `Faltam ${days}d ${pad2(hours)}h ${pad2(minutes)}m`;
  }

  return `Faltam ${pad2(hours)}h ${pad2(minutes)}m ${pad2(seconds)}s`;
}

function openFloatingPanel(panel) {
  if (!panel) return;

  closeFloatingPanels();

  panel.hidden = false;
  panel.classList.add("is-open");
  document.body.classList.add("floating-panel-open");

  hidePublicBottomNav();
}

function closeFloatingPanels() {
  document.querySelectorAll(".floating-info-panel").forEach((panel) => {
    panel.hidden = true;
    panel.classList.remove("is-open");
  });

  document.body.classList.remove("floating-panel-open");

  showPublicBottomNav();
}

function renderTodayGames() {
  if (!todayGamesList) return;

  if (!state.matches.length) {
    todayGamesList.innerHTML = '<p class="empty">Nenhum jogo cadastrado.</p>';
    return;
  }

  const todayKey = getLocalDateKey(new Date());

  const todayMatches = state.matches.filter((match) => {
    return getLocalDateKey(new Date(match.match_date)) === todayKey;
  });

  if (!todayMatches.length) {
    todayGamesList.innerHTML = `
      <div class="today-empty">
        <strong>Nenhum jogo hoje</strong>
        <span>Quando houver partidas no dia, elas aparecerão aqui.</span>
      </div>
    `;
    return;
  }

  todayGamesList.innerHTML = todayMatches.map((match) => {
    const homeTeam = findWorldCupTeamByName(match.home_team);
    const awayTeam = findWorldCupTeamByName(match.away_team);
    const locked = isGuessClosed(match);
    const closeTime = getGuessCloseDate(match);

    return `
      <article class="today-match-card" data-locked="${locked}">
        <div class="today-match-card__header">
          <div>
            <div class="match-meta">${escapeHtml(match.phase || "Fase não informada")}</div>
            <div class="match-timer">${getCountdownText(match)}</div>
            <div class="match-countdown">
              ${locked ? "Palpites encerrados" : `Palpites abertos até ${formatTime(closeTime)}`}
            </div>
          </div>

          <span class="status ${statusClass(match.status)}">${escapeHtml(match.status || "aberto")}</span>
        </div>

        <div class="today-match-card__game">
          <div class="match-team">
            <span class="match-team__flag">${renderMatchFlag(homeTeam, match.home_team)}</span>
            <strong>${escapeHtml(getMatchTeamCode(homeTeam, match.home_team))}</strong>
            <span>${escapeHtml(match.home_team)}</span>
          </div>

          <div class="today-match-card__center">
            <span class="today-match-card__score">${formatScore(match)}</span>
            <span class="match-versus">VS</span>
          </div>

          <div class="match-team">
            <span class="match-team__flag">${renderMatchFlag(awayTeam, match.away_team)}</span>
            <strong>${escapeHtml(getMatchTeamCode(awayTeam, match.away_team))}</strong>
            <span>${escapeHtml(match.away_team)}</span>
          </div>
        </div>

        <div class="today-match-card__footer">
          <span>${formatDate(match.match_date)}</span>
          <span>${state.guessCounts[match.id] || 0} palpites</span>
        </div>
      </article>
    `;
  }).join("");
}

function getLocalDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  if (!value) return "Data não informada";

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatTime(value) {
  if (!value) return "horário não informado";

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDateSentence(value) {
  if (!value) return "data não informada";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value)).replace(",", " às");
}

function getGuessAction(guess) {
  if (!guess?.updated_at || !guess?.created_at) {
    return "Registrado";
  }

  const createdAt = new Date(guess.created_at).getTime();
  const updatedAt = new Date(guess.updated_at).getTime();

  if (Number.isNaN(createdAt) || Number.isNaN(updatedAt)) {
    return "Registrado";
  }

  return Math.abs(updatedAt - createdAt) > 2000 ? "Atualizado" : "Registrado";
}

function getSelectedTeam() {
  if (state.selectedChampion) return state.selectedChampion;

  const prediction = state.participantPrediction;
  if (!prediction) return null;

  if (prediction.champion_team) return prediction.champion_team;

  if (prediction.champion_name) {
    return {
      id: prediction.champion_team_id,
      name: prediction.champion_name,
      code: prediction.champion_code,
      flag_emoji: prediction.champion_flag_emoji,
      flag_url: prediction.champion_flag_url
    };
  }

  return state.worldCupTeams.find((team) => String(team.id) === String(prediction.champion_team_id));
}

function getPredictionDate(pick) {
  return pick?.selected_at || pick?.created_at || pick?.updated_at;
}

function getSelectedPlayer() {
  if (state.selectedTopScorer) return state.selectedTopScorer;

  const prediction = state.participantPrediction;
  if (!prediction) return null;

  if (prediction.top_scorer_player) return prediction.top_scorer_player;

  if (prediction.top_scorer_name) {
    return {
      id: prediction.top_scorer_player_id,
      name: prediction.top_scorer_name,
      position: prediction.top_scorer_position
    };
  }

  return state.brazilPlayers.find((player) => String(player.id) === String(prediction.top_scorer_player_id));
}

function findWorldCupTeamByName(name) {
  const normalized = normalizeText(name);
  return state.worldCupTeams.find((team) => normalizeText(getTeamName(team)) === normalized);
}

function getTeamName(team) {
  return getFirstField(team, ["name", "team_name", "country", "selection_name"]) || "Seleção";
}

function sortTeamsForPrediction(a, b) {
  const aIsBrazil = isBrazilTeam(a);
  const bIsBrazil = isBrazilTeam(b);

  if (aIsBrazil && !bIsBrazil) return -1;
  if (!aIsBrazil && bIsBrazil) return 1;

  return getTeamName(a).localeCompare(getTeamName(b), "pt-BR");
}

function isBrazilTeam(team) {
  const name = getTeamName(team).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const code = getTeamCode(team).toUpperCase();

  return name === "brasil" || name === "brazil" || code === "BRA";
}

function getTeamCode(team) {
  return String(getFirstField(team, ["fifa_code", "code", "abbreviation", "slug"]) || "").toUpperCase();
}

function getMatchTeamCode(team, fallback) {
  return getTeamCode(team) || String(fallback || "").slice(0, 3).toUpperCase();
}

function getTeamGroup(team) {
  const group = getFirstField(team, ["group_name", "group", "cup_group"]);
  if (!group) return "";

  return String(group).toLowerCase().includes("grupo") ? String(group) : `Grupo ${group}`;
}

function getPlayerName(player) {
  return getFirstField(player, ["name", "player_name", "display_name", "nickname"]) || "Jogador";
}

function getPlayerPosition(player) {
  return getFirstField(player, ["position", "role"]) || "Seleção Brasileira";
}

function renderPlayerPhoto(player) {
  return `<span>${escapeHtml(getInitials(getPlayerName(player)))}</span>`;
}

function getInitials(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}

function renderFlag(team) {
  const flagUrl = getFirstField(team, ["flag_url"]);
  const flagValue = getFirstField(team, ["flag_emoji"]);

  if (flagUrl) {
    return `<img src="${escapeHtml(flagUrl)}" alt="">`;
  }

  return escapeHtml(flagValue || "🏆");
}

function renderMatchFlag(team, fallbackName) {
  if (team) return renderFlag(team);

  return `<span>${escapeHtml(getInitials(fallbackName))}</span>`;
}

function getFirstField(source, fields) {
  if (!source) return "";

  for (const field of fields) {
    if (source[field] !== undefined && source[field] !== null && source[field] !== "") {
      return source[field];
    }
  }

  return "";
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function formatScore(match) {
  const home = match.home_score ?? "-";
  const away = match.away_score ?? "-";
  return `${home} x ${away}`;
}

function statusClass(status) {
  const normalized = (status || "aberto").toLowerCase().replace(/\s/g, "-");
  return `status-${normalized}`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function showToast(message) {
  if (!toast) {
    alert(message);
    return;
  }

  toast.textContent = message;
  toast.hidden = false;

  setTimeout(() => {
    toast.hidden = true;
  }, 3600);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}