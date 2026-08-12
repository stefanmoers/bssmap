import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export const openDatabase = (dataDirectory) => {
  mkdirSync(dataDirectory, { recursive: true });
  const databasePath = path.join(dataDirectory, "bssmap.sqlite");
  const database = new DatabaseSync(databasePath, { timeout: 5000 });
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('editor', 'admin')),
      enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf_token TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS object_overrides (
      object_id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      updated_by INTEGER NOT NULL REFERENCES users(id),
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      object_id TEXT NOT NULL,
      image_path TEXT NOT NULL UNIQUE,
      thumbnail_path TEXT NOT NULL UNIQUE,
      alt_text TEXT NOT NULL,
      caption TEXT NOT NULL DEFAULT '',
      uploaded_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS photos_object_id_idx ON photos(object_id, created_at);
    CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
  `);
  return database;
};

