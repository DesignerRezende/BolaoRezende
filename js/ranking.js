async function renderRanking() {
  const rankingBody = document.querySelector("#ranking-body");
  const rankingCurrent = document.querySelector("#ranking-current");
  rankingBody.innerHTML = '<tr><td colspan="5">Carregando ranking...</td></tr>';
  if (rankingCurrent) {
    rankingCurrent.innerHTML = "";
    rankingCurrent.hidden = true;
  }

  try {
    const ranking = await listRanking();

    if (!ranking.length) {
      rankingBody.innerHTML = '<tr><td colspan="5">Nenhum participante cadastrado ainda.</td></tr>';
      return;
    }

    const currentParticipantId = state.participant?.id;
    const currentRow = ranking.find((row) => String(row.participant_id) === String(currentParticipantId));
    const topTen = ranking.slice(0, 10);

    if (rankingCurrent && currentRow) {
      const isTopTen = currentRow.position <= 10;
      rankingCurrent.hidden = false;
      rankingCurrent.innerHTML = `
        <div class="ranking-current__label">Sua posição</div>
        <div class="ranking-current__position">#${currentRow.position}</div>
        <div class="ranking-current__info">
          <strong>${escapeHtml(currentRow.name)}</strong>
          <span>${escapeHtml(currentRow.store_sector || "Loja não informada")}</span>
        </div>
        <div class="ranking-current__score">
          <strong>${currentRow.points}</strong>
          <span>pontos</span>
        </div>
        ${isTopTen ? '<div class="ranking-current__tag">Top 10</div>' : ""}
      `;
    }

    rankingBody.innerHTML = topTen.map((row) => `
      <tr class="${String(row.participant_id) === String(currentParticipantId) ? "is-current-participant" : ""}">
        <td><strong>${row.position}</strong></td>
        <td>${escapeHtml(row.name)}</td>
        <td>${escapeHtml(row.store_sector || "Loja não informada")}</td>
        <td><strong>${row.points}</strong></td>
        <td>${row.guesses}</td>
      </tr>
    `).join("");
  } catch (error) {
    rankingBody.innerHTML = '<tr><td colspan="5">Configure o Supabase para carregar o ranking.</td></tr>';
    console.error(error);
  }
}
