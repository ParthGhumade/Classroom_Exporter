import app from "./app";
import { logger } from "./lib/logger";

const requiredEnvVars = ["PORT", "DATABASE_URL", "SESSION_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`${envVar} environment variable is required.`);
  }
}

const port = Number(process.env.PORT);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env.PORT}"`);
}

const server = app.listen(port, () => {
  logger.info({ port }, "Server listening");
});

const shutdown = () => {
  logger.info("SIGTERM/SIGINT received, shutting down gracefully");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
  setTimeout(() => {
    logger.error("Could not close connections in time, forcefully shutting down");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

process.on("unhandledRejection", (reason, promise) => {
  logger.fatal({ err: reason, promise }, "Unhandled Rejection");
  shutdown();
});

process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught Exception");
  shutdown();
});
