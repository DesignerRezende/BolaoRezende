const fs = require("fs");

const file = "js/app.js";
let source = fs.readFileSync(file, "utf8");

const functionName = "renderLiveBox";
const functionStart = source.indexOf(`function ${functionName}()`);

if (functionStart === -1) {
  throw new Error("Não encontrei function renderLiveBox() em js/app.js.");
}

const openBrace = source.indexOf("{", functionStart);

let depth = 0;
let functionEnd = -1;

for (let i = openBrace; i < source.length; i += 1) {
  const char = source[i];

  if (char === "{") depth += 1;
  if (char === "}") depth -= 1;

  if (depth === 0) {
    functionEnd = i + 1;
    break;
  }
}

if (functionEnd === -1) {
  throw new Error("Não consegui encontrar o final da função renderLiveBox().");
}

const newFunction = `function renderLiveBox() {
  if (!liveBox) return;

  if (!state.matches.length) {
    liveBox.innerHTML = '<p class="empty">Nenhum jogo cadastrado.</p>';
    liveBox.removeAttribute("role");
    liveBox.removeAttribute("tabindex");
    liveBox.classList.remove("live-box-clickable");
    liveBox.onclick = null;
    liveBox.onkeydown = null;
    return;
  }

  const now = new Date();
  const orderedMatches = [...state.matches].sort((a, b) => new Date(a.match_date) - new Date(b.match_date));

  const liveMatches = orderedMatches.filter((match) => {
    return String(match.status || "").toLowerCase() === "ao vivo";
  });

  let highlightMatches = liveMatches;
  let highlightTitle = liveMatches.length > 1 ? "Jogos ao vivo agora" : "Jogo ao vivo agora";

  if (!highlightMatches.length) {
    const futureMatches = orderedMatches.filter((match) => {
      const status = String(match.status || "aberto").toLowerCase();
      return status !== "encerrado" && new Date(match.match_date) >= now;
    });

    if (futureMatches.length) {
      const nextTime = new Date(futureMatches[0].match_date).getTime();
      highlightMatches = futureMatches.filter((match) => new Date(match.match_date).getTime() === nextTime);
      highlightTitle = highlightMatches.length > 1 ? "Próximos jogos" : "Próximo jogo";
    }
  }

  if (!highlightMatches.length && orderedMatches.length) {
    highlightMatches = [orderedMatches[orderedMatches.length - 1]];
    highlightTitle = "Último jogo";
  }

  if (!highlightMatches.length) {
    liveBox.innerHTML = '<p class="empty">Nenhum jogo disponível.</p>';
    liveBox.removeAttribute("role");
    liveBox.removeAttribute("tabindex");
    liveBox.classList.remove("live-box-clickable");
    liveBox.onclick = null;
    liveBox.onkeydown = null;
    return;
  }

  liveBox.classList.add("live-box-clickable");
  liveBox.setAttribute("role", "region");
  liveBox.setAttribute("aria-label", highlightTitle);
  liveBox.removeAttribute("tabindex");
  liveBox.onclick = null;
  liveBox.onkeydown = null;

  liveBox.innerHTML = \`
    <div class="live-box-heading">
      <strong>\${escapeHtml(highlightTitle)}</strong>
      \${highlightMatches.length > 1 ? \`<span>\${highlightMatches.length} jogos</span>\` : ""}
    </div>

    <div class="live-box-matches">
      \${highlightMatches.map((match) => {
        const closed = isGuessClosed(match);
        const countdown = getCountdownText(match);
        const closeTime = getGuessCloseDate(match);
        const homeTeam = findWorldCupTeamByName(match.home_team);
        const awayTeam = findWorldCupTeamByName(match.away_team);
        const deadlineConfig = getDeadlineConfigForMatch(match);
        const status = String(match.status || "aberto").toLowerCase();
        const isLive = status === "ao vivo";
        const isClosed = status === "encerrado";

        const subtitle = isLive
          ? "Ao vivo agora"
          : isClosed
            ? "Jogo encerrado"
            : formatDate(match.match_date);

        return \`
          <div
            class="live-box-match-item"
            data-live-match-id="\${escapeHtml(match.id)}"
            role="button"
            tabindex="0"
            aria-label="Ir para o palpite de \${escapeHtml(match.home_team)} contra \${escapeHtml(match.away_team)}"
          >
            <div class="next-match-card">
              <div class="next-match-team">
                <span class="next-match-flag">\${renderMatchFlag(homeTeam, match.home_team)}</span>
                <strong>\${escapeHtml(getMatchTeamCode(homeTeam, match.home_team))}</strong>
                <small>\${escapeHtml(match.home_team)}</small>
              </div>

              <div class="next-match-center">
                <small>\${escapeHtml(subtitle)}</small>
                <span class="next-match-score">\${formatScore(match)}</span>
                <span class="next-match-vs">VS</span>
              </div>

              <div class="next-match-team">
                <span class="next-match-flag">\${renderMatchFlag(awayTeam, match.away_team)}</span>
                <strong>\${escapeHtml(getMatchTeamCode(awayTeam, match.away_team))}</strong>
                <small>\${escapeHtml(match.away_team)}</small>
              </div>
            </div>

            <div class="countdown-box">
              <span class="countdown-label">\${closed ? "Palpites encerrados" : "Tempo restante"}</span>
              <strong class="countdown-time">\${countdown}</strong>
              <span class="countdown-sub">
                \${closed ? "Os palpites deste jogo já foram fechados." : \`Palpites abertos até \${formatDateSentence(closeTime)}\`}
              </span>
              <span class="countdown-sub">\${escapeHtml(getGuessDeadlineRuleText(deadlineConfig))}</span>
              <span class="countdown-jump-hint">Clique aqui para ir direto ao palpite deste jogo.</span>
            </div>

            <span class="status \${statusClass(match.status)}">\${escapeHtml(match.status || "aberto")}</span>
            <p>\${formatDate(match.match_date)} · \${escapeHtml(match.phase || "Fase não informada")}</p>
            <p><strong>\${state.guessCounts[match.id] || 0}</strong> palpites registrados</p>
          </div>
        \`;
      }).join("")}
    </div>
  \`;

  liveBox.querySelectorAll("[data-live-match-id]").forEach((card) => {
    const matchId = card.dataset.liveMatchId;

    card.addEventListener("click", () => {
      focusMatchFromLiveBox(matchId);
    });

    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        focusMatchFromLiveBox(matchId);
      }
    });
  });
}`;

source = source.slice(0, functionStart) + newFunction + source.slice(functionEnd);

fs.writeFileSync(file, source, "utf8");

console.log("renderLiveBox atualizado para múltiplos jogos ao vivo/próximos.");
