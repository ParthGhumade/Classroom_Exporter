import { defineConfig } from "drizzle-kit";
import path from "path";

const connectionString =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "Set DATABASE_URL_UNPOOLED or DATABASE_URL before running drizzle-kit",
  );
}

// Suppress the pg-connection-string v3 deprecation warning during migrations
const parsedUrl = new URL(connectionString);
const mode = parsedUrl.searchParams.get("sslmode");
if (mode && ["require", "prefer", "verify-ca"].includes(mode)) {
  parsedUrl.searchParams.set("sslmode", "verify-full");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: parsedUrl.toString(),
  },
});
