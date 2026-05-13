import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const mysql = require("../../../api_gateway/node_modules/mysql2/promise");

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..", "..", "..");
const outDir = path.resolve(scriptDir, "..");
const rawDir = path.join(outDir, "raw");
const envText = await fs.readFile(path.join(root, ".env"), "utf8");
const env = {};

for (const line of envText.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const index = trimmed.indexOf("=");
  if (index < 1) continue;
  const key = trimmed.slice(0, index).trim();
  let value = trimmed.slice(index + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  env[key] = value;
}

if (!env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing in root .env");
}

const original = new URL(env.DATABASE_URL);
const dbName = `longseason_test_${Date.now().toString(36)}_${crypto.randomBytes(2).toString("hex")}`;
const serverUrl = new URL(original.toString());
serverUrl.pathname = "/";

const connection = await mysql.createConnection({
  host: original.hostname,
  port: Number(original.port || 3306),
  user: decodeURIComponent(original.username),
  password: decodeURIComponent(original.password),
  multipleStatements: false,
});

await connection.query(`CREATE DATABASE \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
await connection.end();

const testUrl = new URL(original.toString());
testUrl.pathname = `/${dbName}`;

await fs.mkdir(rawDir, { recursive: true });
await fs.writeFile(
  path.join(rawDir, "test-database.json"),
  JSON.stringify(
    {
      databaseName: dbName,
      host: original.hostname,
      port: original.port || "3306",
      createdAt: new Date().toISOString(),
      note: "Full DATABASE_URL intentionally not stored in this report directory.",
    },
    null,
    2,
  ),
  "utf8",
);

process.stdout.write(testUrl.toString());
