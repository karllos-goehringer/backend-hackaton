export function configureDatabaseUrl(): string {
  const configuredUrl = process.env.DATABASE_URL;
  if (configuredUrl) return configuredUrl;

  const atlasUrl = process.env.DB_URL;
  const username = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;

  if (!atlasUrl || !username || !password) {
    throw new Error("Configure DB_URL, DB_USER e DB_PASSWORD no arquivo .env.");
  }

  const match = atlasUrl.match(
    /^(mongodb(?:\+srv)?:\/\/)(?:[^@/]*@)?([^/?]+)(?:\/([^?]*))?(\?.*)?$/,
  );
  if (!match) {
    throw new Error("DB_URL precisa ser uma URI mongodb:// ou mongodb+srv:// válida.");
  }

  const [, protocol, host, configuredDatabase, query = ""] = match;
  const database = configuredDatabase || process.env.DB_NAME || "hackaton";
  return `${protocol}${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}/${database}${query}`;
}
