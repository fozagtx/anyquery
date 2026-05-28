import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const coralBin = process.env.CORAL_BIN ?? "coral";

async function main() {
  const version = await run(["--version"]);
  const sql = await run(["sql", "--format", "json", "SELECT 1 AS ok"]);
  const sources = await run(["source", "list"]);

  const rows = JSON.parse(sql.stdout);
  if (!Array.isArray(rows) || rows[0]?.ok !== 1) {
    throw new Error("Coral SQL smoke query did not return the expected result.");
  }

  console.log(`Coral: ${version.stdout.trim()}`);
  console.log("SQL: SELECT 1 AS ok -> ok");
  console.log(`Sources: ${sources.stdout.trim() || "none configured"}`);
}

async function run(args) {
  try {
    return await execFileAsync(coralBin, args, {
      timeout: 15000,
      maxBuffer: 1024 * 1024
    });
  } catch (error) {
    const message = error.stderr || error.message || String(error);
    throw new Error(`coral ${args.join(" ")} failed:\n${message}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
