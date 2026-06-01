const fs = require("fs");

const file = "api/sync-results.js";
let source = fs.readFileSync(file, "utf8");

const oldBlock = `if (String(localMatch.status || "").toLowerCase() !== "encerrado") {
    payload.status = "aberto";
  }

  return payload;`;

const newBlock = `const manualStatus = String(localMatch.status || "").toLowerCase();

  if (!["ao vivo", "encerrado"].includes(manualStatus)) {
    payload.status = "aberto";
  }

  return payload;`;

if (!source.includes(oldBlock)) {
  console.log("Bloco antigo não encontrado. Tentando variação com match.status...");

  const oldBlock2 = `if (String(match.status || "").toLowerCase() !== "encerrado") {
    payload.status = "aberto";
  }

  return payload;`;

  const newBlock2 = `const manualStatus = String(match.status || "").toLowerCase();

  if (!["ao vivo", "encerrado"].includes(manualStatus)) {
    payload.status = "aberto";
  }

  return payload;`;

  if (!source.includes(oldBlock2)) {
    throw new Error("Não encontrei o bloco de status aberto em api/sync-results.js.");
  }

  source = source.replace(oldBlock2, newBlock2);
} else {
  source = source.replace(oldBlock, newBlock);
}

fs.writeFileSync(file, source, "utf8");

console.log("api/sync-results.js ajustado com segurança.");
