const state = {
  participant: null,
  matches: [],
  guesses: [],
  guessCounts: {}
};

const participantForm = document.querySelector("#participant-form");
const participantCurrent = document.querySelector("#participant-current");
const matchesList = document.querySelector("#matches-list");
const liveBox = document.querySelector("#live-box");
const refreshButton = document.querySelector("#refresh-button");
const toast = document.querySelector("#toast");

const GUESS_CLOSE_MINUTES_BEFORE_MATCH = 20;

if (participantForm) {
  participantForm.addEventListener("submit", handleParticipantSubmit);
}

if (refreshButton) {
  refreshButton.addEventListener("click", loadDashboard);
}

async function initApp() {
  await createOrUpdateParticipantFromEmployee();

  if (!state.participant) {
    showToast("Erro ao carregar dados do participante.");
    return;
  }

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

  participantCurrent.innerHTML = `
    <div class="participant-name-only">
      ${escapeHtml(state.participant.name)}
    </div>
  `;
}

async function loadDashboard() {
  try {
    state.matches = await listMatches();
    state.guessCounts = await getGuessCounts();
    state.guesses = await listParticipantGuesses(state.participant?.id);

    renderLiveBox();
    renderMatches();
    await renderRanking();
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
  const countdown = getCountdownText(match.match_date);
  const closeTime = getGuessCloseDate(match);

  liveBox.innerHTML = `
    <div class="live-score">
      <span>${escapeHtml(match.home_team)} x ${escapeHtml(match.away_team)}</span>
      <strong>${formatScore(match)}</strong>
    </div>

    <div class="countdown-box">
      <span class="countdown-label">${closed ? "Palpites encerrados" : "Tempo restante"}</span>
      <strong class="countdown-time">${countdown}</strong>
      <span class="countdown-sub">
        ${closed ? "Os palpites deste jogo já foram fechados." : `Palpites até ${formatTime(closeTime)}`}
      </span>
    </div>

    <span class="status ${statusClass(match.status)}">${escapeHtml(match.status || "aberto")}</span>
    <p>${formatDate(match.match_date)} • ${escapeHtml(match.phase || "Fase não informada")}</p>
    <p><strong>${state.guessCounts[match.id] || 0}</strong> palpites registrados</p>
  `;
}

function renderMatches() {
  if (!matchesList) return;

  if (!state.matches.length) {
    matchesList.innerHTML = '<p class="empty">Nenhum jogo cadastrado ainda.</p>';
    return;
  }

  matchesList.innerHTML = state.matches.map((match) => {
    const locked = isGuessClosed(match);
    const savedGuess = state.guesses.find((guess) => guess.match_id === match.id);
    const disabled = !state.participant || locked ? "disabled" : "";
    const buttonText = savedGuess ? "Atualizar palpite" : "Salvar palpite";
    const closeTime = getGuessCloseDate(match);

    return `
      <article class="match-card">
        <div class="match-header">
          <div>
            <div class="match-title">${escapeHtml(match.home_team)} x ${escapeHtml(match.away_team)}</div>
            <div class="match-meta">${formatDate(match.match_date)} • ${escapeHtml(match.phase || "Fase não informada")}</div>
            <div class="match-countdown">
              ${locked ? "Palpites encerrados" : `Palpites até ${formatTime(closeTime)}`}
            </div>
          </div>

          <span class="status ${statusClass(match.status)}">${escapeHtml(match.status || "aberto")}</span>
        </div>

        <form class="guess-form" data-match-id="${match.id}">
          <div>
            <strong>Placar real:</strong> ${formatScore(match)}<br>
            <span>${state.guessCounts[match.id] || 0} palpites</span>
          </div>

          <label class="guess-score">
            Brasil
            <input type="number" min="0" name="home_score_guess" value="${savedGuess?.home_score_guess ?? ""}" ${disabled} required>
          </label>

          <label class="guess-score">
            Rival
            <input type="number" min="0" name="away_score_guess" value="${savedGuess?.away_score_guess ?? ""}" ${disabled} required>
          </label>

          <button type="submit" ${disabled}>${locked ? "Fechado" : buttonText}</button>
        </form>
      </article>
    `;
  }).join("");

  document.querySelectorAll(".guess-form").forEach((form) => {
    form.addEventListener("submit", handleGuessSubmit);
  });
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
    showToast("Palpites encerrados. O prazo fecha 20 minutos antes do jogo.");
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
    if (button) button.disabled = false;
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

function getCountdownText(value) {
  if (!value) return "Data não informada";

  const matchDate = new Date(value);
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
    return `${days}d ${hours}h ${minutes}m`;
  }

  return `${hours}h ${minutes}m ${seconds}s`;
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

function formatScore(match) {
  const home = match.home_score ?? "-";
  const away = match.away_score ?? "-";
  return `${home} x ${away}`;
}

function statusClass(status) {
  const normalized = (status || "aberto").toLowerCase().replace(/\s/g, "-");
  return `status-${normalized}`;
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