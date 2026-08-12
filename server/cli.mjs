import path from "node:path";
import process from "node:process";
import { createBssMapServer } from "./app.mjs";

const argumentValue = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const host = argumentValue("--host", process.env.BSSMAP_HOST || "127.0.0.1");
const port = Number(argumentValue("--port", process.env.BSSMAP_PORT || "8080"));
const dataDirectory = path.resolve(process.env.BSSMAP_DATA_DIR || "var");
const secureCookie = process.env.BSSMAP_SECURE_COOKIES === "true"
  || (process.env.NODE_ENV === "production" && process.env.BSSMAP_SECURE_COOKIES !== "false");

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error("Der Port muss zwischen 0 und 65535 liegen.");
  process.exit(2);
}

const application = await createBssMapServer({
  rootDirectory: path.resolve("."),
  dataDirectory,
  secureCookie
});

application.server.listen(port, host, () => {
  const address = application.server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  console.log(`BSSMap läuft auf http://${host}:${actualPort}/`);
  console.log(`Persistente Daten: ${dataDirectory}`);
  if (application.database.prepare("SELECT COUNT(*) AS count FROM users WHERE enabled = 1").get().count === 0) {
    console.warn("Noch kein Benutzer eingerichtet. Führe in einem zweiten Terminal `npm run setup` aus.");
  }
});

const shutdown = async (signal) => {
  console.log(`\n${signal}: Server wird beendet …`);
  await application.close();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

