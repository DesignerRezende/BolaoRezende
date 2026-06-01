const PUBLIC_RANKING_LIMIT = 30;

async function renderRanking() {
  const rankingBody = document.querySelector("#ranking-body");
  const rankingCurrent = document.querySelector("#ranking-current");

  if (!rankingBody) {
    return;
  }

  rankingBody.innerHTML = `
    <tr>
      <td colspan="5">Carregando ranking...</td>
    </tr>
  `;

  try {
    const ranking = await listRanking();
    const currentParticipantId = state?.participant?.id || null;
    const topRanking = ranking.slice(0, PUBLIC_RANKING_LIMIT);

    renderCurrentParticipantRanking(ranking, currentParticipantId, rankingCurrent);

    if (!topRanking.length) {
      rankingBody.innerHTML = `
        <tr>
          <td colspan="5">Nenhum participante no ranking.</td>
        </tr>
      `;
      return;
    }

    rankingBody.innerHTML = topRanking.map((row) => {
      const isCurrentParticipant =
        currentParticipantId &&
        String(row.participant_id) === String(currentParticipantId);

      return `
        <tr class="${isCurrentParticipant ? "is-current-participant" : ""}">
          <td><strong>${rankingEscapeHtml(row.position)}</strong></td>
          <td>${rankingEscapeHtml(row.name)}</td>
          <td>${rankingEscapeHtml(row.store_sector || "-")}</td>
          <td><strong>${rankingEscapeHtml(row.points || 0)}</strong></td>
          <td>${rankingEscapeHtml(row.guesses || 0)}</td>
        </tr>
      `;
    }).join("");
  } catch (error) {
    console.error("Erro ao renderizar ranking:", error);

    rankingBody.innerHTML = `
      <tr>
        <td colspan="5">Não foi possível carregar o ranking.</td>
      </tr>
    `;

    if (rankingCurrent) {
      rankingCurrent.hidden = true;
      rankingCurrent.innerHTML = "";
    }
  }
}

function renderCurrentParticipantRanking(ranking, currentParticipantId, rankingCurrent) {
  if (!rankingCurrent) {
    return;
  }

  if (!currentParticipantId) {
    rankingCurrent.hidden = true;
    rankingCurrent.innerHTML = "";
    return;
  }

  const currentRow = ranking.find((row) => {
    return String(row.participant_id) === String(currentParticipantId);
  });

  if (!currentRow) {
    rankingCurrent.hidden = true;
    rankingCurrent.innerHTML = "";
    return;
  }

  const isTopRanking = Number(currentRow.position) <= PUBLIC_RANKING_LIMIT;

  rankingCurrent.hidden = false;
  rankingCurrent.innerHTML = `
    <div class="ranking-current__label">Sua posição</div>

    <div class="ranking-current__position">
      #${rankingEscapeHtml(currentRow.position)}
    </div>

    <div class="ranking-current__info">
      <strong>${rankingEscapeHtml(currentRow.name)}</strong>
      <span>${rankingEscapeHtml(currentRow.store_sector || "-")}</span>
    </div>

    <div class="ranking-current__score">
      <strong>${rankingEscapeHtml(currentRow.points || 0)}</strong>
      <span>Pontos</span>
    </div>

    <div class="ranking-current__tag">
      ${isTopRanking ? "TOP 30" : "Fora do TOP 30"}
    </div>
  `;
}

function rankingEscapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}