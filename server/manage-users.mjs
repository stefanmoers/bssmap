import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { openDatabase } from "./database.mjs";
import { hashPassword } from "./security.mjs";

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,63}$/i;
const dataDirectory = path.resolve(process.env.BSSMAP_DATA_DIR || "var");
const command = process.argv[2] || "setup";
const argumentValue = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const readSecret = async (prompt) => {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    const readline = createInterface({ input: process.stdin, output: process.stdout });
    const value = await readline.question(prompt);
    readline.close();
    return value;
  }

  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdout.write("\n");
    };
    const onData = (character) => {
      if (character === "\u0003") {
        cleanup();
        reject(new Error("Abgebrochen."));
      } else if (character === "\r" || character === "\n") {
        cleanup();
        resolve(value);
      } else if (character === "\u007f" || character === "\b") {
        value = value.slice(0, -1);
      } else if (character >= " ") {
        value += character;
      }
    };
    process.stdin.on("data", onData);
  });
};

const database = openDatabase(dataDirectory);

try {
  if (command === "list") {
    const users = database.prepare(`
      SELECT username, role, enabled, created_at AS createdAt
        FROM users ORDER BY username COLLATE NOCASE
    `).all();
    if (users.length === 0) {
      console.log("Noch keine Benutzer eingerichtet.");
    } else {
      console.table(users.map((user) => ({
        Benutzer: user.username,
        Rolle: user.role,
        Aktiv: user.enabled ? "ja" : "nein",
        Erstellt: user.createdAt
      })));
    }
    process.exitCode = 0;
  } else if (["setup", "add"].includes(command)) {
    const readline = createInterface({ input: process.stdin, output: process.stdout });
    const defaultRole = command === "setup" ? "admin" : "editor";
    const username = (argumentValue("--username")
      || await readline.question("Benutzername: ")).trim();
    let role = (argumentValue("--role")
      || await readline.question(`Rolle (editor/admin) [${defaultRole}]: `)
      || defaultRole).trim().toLowerCase();
    readline.close();

    if (!USERNAME_PATTERN.test(username)) {
      throw new Error("Der Benutzername benötigt 3 bis 64 Zeichen und darf Buchstaben, Ziffern, Punkt, Minus und Unterstrich enthalten.");
    }
    if (!["editor", "admin"].includes(role)) {
      throw new Error("Die Rolle muss editor oder admin sein.");
    }

    const suppliedPassword = process.env.BSSMAP_USER_PASSWORD;
    const password = suppliedPassword || await readSecret("Passwort (mindestens 12 Zeichen): ");
    const confirmation = suppliedPassword ? password : await readSecret("Passwort wiederholen: ");
    if (password.length < 12) {
      throw new Error("Das Passwort muss mindestens 12 Zeichen lang sein.");
    }
    if (password !== confirmation) {
      throw new Error("Die Passwörter stimmen nicht überein.");
    }

    const passwordHash = await hashPassword(password);
    const existing = database.prepare("SELECT id FROM users WHERE username = ?").get(username);
    if (existing) {
      database.prepare(`
        UPDATE users SET password_hash = ?, role = ?, enabled = 1 WHERE id = ?
      `).run(passwordHash, role, existing.id);
      console.log(`Benutzer „${username}“ wurde aktualisiert (${role}).`);
    } else {
      database.prepare(`
        INSERT INTO users (username, password_hash, role, enabled, created_at)
        VALUES (?, ?, ?, 1, ?)
      `).run(username, passwordHash, role, new Date().toISOString());
      console.log(`Benutzer „${username}“ wurde angelegt (${role}).`);
    }
    console.log(`Datenbank: ${path.join(dataDirectory, "bssmap.sqlite")}`);
  } else if (command === "disable") {
    const username = String(argumentValue("--username") || "").trim();
    if (!username) {
      throw new Error("Verwendung: npm run user:disable -- --username <name>");
    }
    const result = database.prepare("UPDATE users SET enabled = 0 WHERE username = ?").run(username);
    if (Number(result.changes) === 0) {
      throw new Error(`Benutzer „${username}“ wurde nicht gefunden.`);
    }
    database.prepare(`
      DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE username = ?)
    `).run(username);
    console.log(`Benutzer „${username}“ wurde deaktiviert.`);
  } else {
    throw new Error("Unbekannter Befehl. Erlaubt sind setup, add, list und disable.");
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  database.close();
}

