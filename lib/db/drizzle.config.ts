import { defineConfig } from "drizzle-kit";
import path from "path";

const connectionString =
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "Set DATABASE_URL_UNPOOLED or DATABASE_URL before running drizzle-kit",
  );
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
