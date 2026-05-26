async function renderRanking() {
  const rankingBody = document.querySelector("#ranking-body");
  rankingBody.innerHTML = '<tr><td colspan="5">Carregando ranking...</td></tr>';

  try {
    const ranking = await listRanking();

    if (!ranking.length) {
      rankingBody.innerHTML = '<tr><td colspan="5">Nenhum participante cadastrado ainda.</td></tr>';
      return;
    }

    rankingBody.innerHTML = ranking.map((row) => `
      <tr>
        <td><strong>${row.position}</strong></td>
        <td>${escapeHtml(row.name)}</td>
        <td>${escapeHtml(row.store_sector)}</td>
        <td><strong>${row.points}</strong></td>
        <td>${row.guesses}</td>
      </tr>
    `).join("");
  } catch (error) {
    rankingBody.innerHTML = '<tr><td colspan="5">Configure o Supabase para carregar o ranking.</td></tr>';
    console.error(error);
  }
}
