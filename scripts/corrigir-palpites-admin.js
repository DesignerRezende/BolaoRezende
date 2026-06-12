const fs = require("fs");

const file = "js/admin.js";
let source = fs.readFileSync(file, "utf8");

const start = source.indexOf("async function adminListGuesses()");
if (start === -1) {
  throw new Error("Não encontrei adminListGuesses em js/admin.js");
}

const nextMarker = "async function adminListParticipantPredictions()";
const end = source.indexOf(nextMarker, start);
if (end === -1) {
  throw new Error("Não encontrei o fim de adminListGuesses");
}

const newFunction = `async function adminListGuesses() {
  const client = getSupabaseClient();
  const pageSize = 1000;
  let from = 0;
  let allRows = [];

  while (true) {
    const { data, error } = await client
      .from("guesses")
      .select(\`
        *,
        participant:participants (*),
        match:matches (*)
      \`)
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

`;

source = source.slice(0, start) + newFunction + source.slice(end);

fs.writeFileSync(file, source, "utf8");

console.log("adminListGuesses corrigido com paginação.");
