/**
 * ConventionStore - SQLite-based persistence for learned conventions
 *
 * Implements CNV-02 (conventions persist across runs) and CNV-03 (faster subsequent runs via caching)
 */

import Database from "better-sqlite3";
import * as fs from "fs";
import * as path from "path";

import { TestConvention } from "#learner/types.ts";
import { ensureProjectStateDirSync } from "#project-state.ts";

/**
 * ConventionStore class with SQLite persistence
 */
export class ConventionStore {
  private db: ReturnType<typeof Database> | null = null;
  private dbPath: string;

  /**
   * Create a new ConventionStore
   * @param dbPath - Path to SQLite database file
   */
  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  /**
   * Initialize the database - creates tables if they don't exist
   */
  init(): void {
    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);

    // Create conventions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conventions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Create cache table with TTL support
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        expires_at TEXT
      )
    `);

    console.log(`[ConventionStore] Initialized database at ${this.dbPath}`);
  }

  /**
   * Save conventions to the database
   * @param conventions - TestConvention object to save
   * @param key - Optional key for the conventions (default: 'default')
   */
  saveConventions(conventions: TestConvention, key: string = "default"): void {
    if (!this.db) {
      throw new Error("Database not initialized. Call init() first.");
    }

    const value = JSON.stringify(conventions);
    const updatedAt = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO conventions (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `);

    stmt.run(key, value, updatedAt);
    console.log(`[ConventionStore] Saved conventions for key: ${key}`);
  }

  /**
   * Load conventions from the database
   * @param key - Optional key for the conventions (default: 'default')
   * @returns TestConvention or null if not found
   */
  loadConventions(key: string = "default"): TestConvention | null {
    if (!this.db) {
      throw new Error("Database not initialized. Call init() first.");
    }

    const stmt = this.db.prepare(`
      SELECT value FROM conventions WHERE key = ?
    `);

    const row = stmt.get(key) as { value: string } | undefined;

    if (!row) {
      console.log(`[ConventionStore] No conventions found for key: ${key}`);
      return null;
    }

    try {
      const conventions = JSON.parse(row.value) as TestConvention;
      console.log(`[ConventionStore] Loaded conventions for key: ${key}`);
      return conventions;
    } catch (error) {
      console.error(`[ConventionStore] Failed to parse conventions:`, error);
      return null;
    }
  }

  /**
   * Get a cached value
   * @param key - Cache key
   * @returns Cached value or null if not found or expired
   */
  getCached(key: string): unknown | null {
    if (!this.db) {
      throw new Error("Database not initialized. Call init() first.");
    }

    const stmt = this.db.prepare(`
      SELECT value, expires_at FROM cache WHERE key = ?
    `);

    const row = stmt.get(key) as
      | { value: string; expires_at: string | null }
      | undefined;

    if (!row) {
      return null;
    }

    // Check if expired
    if (row.expires_at) {
      const expiresAt = new Date(row.expires_at);
      if (expiresAt < new Date()) {
        // Expired - delete and return null
        this.deleteCached(key);
        return null;
      }
    }

    try {
      return JSON.parse(row.value);
    } catch {
      return null;
    }
  }

  /**
   * Set a cached value with optional TTL
   * @param key - Cache key
   * @param value - Value to cache (will be JSON serialized)
   * @param ttlSeconds - Optional TTL in seconds
   */
  setCached(key: string, value: unknown, ttlSeconds?: number): void {
    if (!this.db) {
      throw new Error("Database not initialized. Call init() first.");
    }

    const serializedValue = JSON.stringify(value);
    let expiresAt: string | null = null;

    if (ttlSeconds && ttlSeconds > 0) {
      const expiryDate = new Date();
      expiryDate.setSeconds(expiryDate.getSeconds() + ttlSeconds);
      expiresAt = expiryDate.toISOString();
    }

    const stmt = this.db.prepare(`
      INSERT INTO cache (key, value, expires_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        expires_at = excluded.expires_at
    `);

    stmt.run(key, serializedValue, expiresAt);
  }

  /**
   * Delete a cached value
   * @param key - Cache key to delete
   */
  deleteCached(key: string): void {
    if (!this.db) {
      throw new Error("Database not initialized. Call init() first.");
    }

    const stmt = this.db.prepare(`DELETE FROM cache WHERE key = ?`);
    stmt.run(key);
  }

  /**
   * Clear all cached values
   */
  clearCache(): void {
    if (!this.db) {
      throw new Error("Database not initialized. Call init() first.");
    }

    this.db.exec(`DELETE FROM cache`);
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log(`[ConventionStore] Closed database connection`);
    }
  }
}

/**
 * Create a ConventionStore instance
 * @param projectRoot - Root directory of the project (will create .taro/ subdirectory)
 * @returns Initialized ConventionStore
 */
export function createStore(projectRoot: string): ConventionStore {
  const taroDir = ensureProjectStateDirSync(projectRoot);
  const dbPath = path.join(taroDir, "conventions.db");

  const store = new ConventionStore(dbPath);
  store.init();

  return store;
}
