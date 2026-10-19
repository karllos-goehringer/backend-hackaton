import "dotenv/config";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { configureDatabaseUrl } from "./shared/config/database-url.js";

process.env.DATABASE_URL = configureDatabaseUrl();

const prismaCli = resolve(process.cwd(), "node_modules/prisma/build/index.js");
const result = spawnSync(process.execPath, [prismaCli, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error("Não foi possível executar o Prisma:", result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
