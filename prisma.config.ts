import "dotenv/config";
import { defineConfig } from "prisma/config";
import { configureDatabaseUrl } from "./src/shared/config/database-url.js";

const databaseUrl = configureDatabaseUrl();
process.env.DATABASE_URL = databaseUrl;

export default defineConfig({
  schema: "schema.prisma",
  datasource: {
    url: databaseUrl,
  },
});
