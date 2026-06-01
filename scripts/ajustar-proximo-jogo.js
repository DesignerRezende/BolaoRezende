const fs = require("fs");

const file = "js/app.js";
let source = fs.readFileSync(file, "utf8");

const oldBlock = `const liveMatch = state.matches.find((match) => match.status === "ao vivo");
  const nextMatch = state.matches.find((match) => match.status !== "encerrado" && new Date(match.match_date) >= now);
  const match = liveMatch || nextMatch || state.matches[state.matches.length - 1];`;

const newBlock = `const orderedMatches = [...state.matches].sort((a, b) => new Date(a.match_date) - new Date(b.match_date));

  const liveMatches = orderedMatches.filter((match) => String(match.status || "").toLowerCase() === "ao vivo");

  let highlightMatches = liveMatches;

  if (!highlightMatches.length) {
    const futureMatches = orderedMatches.filter((match) => {
      const status = String(match.status || "aberto").toLowerCase();
      return status !== "encerrado" && new Date(match.match_date) >= now;
    });

    if (futureMatches.length) {
      const nextTime = new Date(futureMatches[0].match_date).getTime();
      highlightMatches = futureMatches.filter((match) => new Date(match.match_date).getTime() === nextTime);
    }
  }

  const match = highlightMatches[0] || orderedMatches[orderedMatches.length - 1];`;

if (!source.includes(oldBlock)) {
  throw new Error("Não encontrei o bloco antigo do próximo jogo em js/app.js.");
}

source = source.replace(oldBlock, newBlock);

fs.writeFileSync(file, source, "utf8");

console.log("js/app.js ajustado para priorizar jogos ao vivo e próximo horário.");
