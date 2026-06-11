import express, { type Express } from "express";

import session from "express-session";
import pinoHttp from "pino-http";
import path from "node:path";
import { existsSync } from "node:fs";
import router from "./routes";
import { logger } from "./lib/logger";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";

const app: Express = express();
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  throw new Error("SESSION_SECRET environment variable is required.");
}

const PgStore = connectPgSimple(session);

app.use(
  session({
    store: new PgStore({ pool, createTableIfMissing: true }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
    },
  }),
);

app.use("/api", router);

const frontendDistCandidates = [
  path.resolve(process.cwd(), "artifacts/classroom-exporter/dist/public"),
  path.resolve(process.cwd(), "../classroom-exporter/dist/public"),
  path.resolve(process.cwd(), "dist/public"),
];

const frontendDist = frontendDistCandidates.find((candidate) => existsSync(candidate));
if (frontendDist) {
  app.use(express.static(frontendDist));

  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

export default app;
