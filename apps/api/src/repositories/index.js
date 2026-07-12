import path from "node:path";

import { createFileRepository } from "./file.js";
import { createMemoryRepository } from "./memory.js";
import { createSqliteRepository } from "./sqlite.js";

const DEFAULT_DATA_PATH = path.resolve(process.cwd(), "infrastructure/staged-data/api-store.json");
const DEFAULT_SQLITE_PATH = path.resolve(process.cwd(), "infrastructure/staged-data/api-store.sqlite");

export function createRepositoryFromEnv(env = process.env) {
  const mode = env.XYGO_API_REPOSITORY_MODE ?? "sqlite";

  if (mode === "memory") {
    return createMemoryRepository();
  }

  if (mode === "file") {
    return createFileRepository({
      filePath: env.XYGO_API_DATA_PATH
        ? path.resolve(process.cwd(), env.XYGO_API_DATA_PATH)
        : DEFAULT_DATA_PATH
    });
  }

  if (mode === "sqlite") {
    return createSqliteRepository({
      filePath: env.XYGO_API_DB_PATH
        ? path.resolve(process.cwd(), env.XYGO_API_DB_PATH)
        : DEFAULT_SQLITE_PATH
    });
  }

  throw new Error(`Unknown repository mode: ${mode}`);
}
