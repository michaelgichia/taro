import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mkdirSyncMock,
  existsSyncMock,
  databaseFactoryMock,
  ensureProjectStateDirSyncMock,
} = vi.hoisted(() => ({
  mkdirSyncMock: vi.fn(),
  existsSyncMock: vi.fn(),
  databaseFactoryMock: vi.fn(),
  ensureProjectStateDirSyncMock: vi.fn(() => "/repo/.taro"),
}));

type FakeRow = { value: string; expires_at?: string | null } | undefined;

function createDbHarness() {
  let conventionRow: FakeRow;
  const cacheRows = new Map<
    string,
    { value: string; expires_at: string | null }
  >();
  const preparedSql: string[] = [];

  const prepare = vi.fn((sql: string) => {
    preparedSql.push(sql);

    if (sql.includes("INSERT INTO conventions")) {
      return {
        run: vi.fn((key: string, value: string) => {
          conventionRow = { value, expires_at: null };
          return { changes: 1, lastInsertRowid: 1 };
        }),
      };
    }

    if (sql.includes("SELECT value FROM conventions")) {
      return { get: vi.fn(() => conventionRow) };
    }

    if (sql.includes("SELECT value, expires_at FROM cache")) {
      return { get: vi.fn((key: string) => cacheRows.get(key)) };
    }

    if (sql.includes("INSERT INTO cache")) {
      return {
        run: vi.fn((key: string, value: string, expiresAt: string | null) => {
          cacheRows.set(key, { value, expires_at: expiresAt });
          return { changes: 1 };
        }),
      };
    }

    if (sql.includes("DELETE FROM cache WHERE key = ?")) {
      return {
        run: vi.fn((key: string) => {
          cacheRows.delete(key);
          return { changes: 1 };
        }),
      };
    }

    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const exec = vi.fn((sql: string) => {
    preparedSql.push(sql);
    if (sql === "DELETE FROM cache") {
      cacheRows.clear();
    }
  });

  const close = vi.fn();

  return {
    db: { prepare, exec, close },
    prepare,
    exec,
    close,
    setConventionRow(value?: string) {
      conventionRow = value ? { value, expires_at: null } : undefined;
    },
    setCacheRow(key: string, value: unknown, expiresAt: string | null = null) {
      cacheRows.set(key, {
        value: typeof value === "string" ? value : JSON.stringify(value),
        expires_at: expiresAt,
      });
    },
    getCacheRow(key: string) {
      return cacheRows.get(key);
    },
  };
}

vi.mock("fs", () => ({ existsSync: existsSyncMock, mkdirSync: mkdirSyncMock }));

vi.mock("better-sqlite3", () => ({ default: databaseFactoryMock }));

vi.mock("#project-state.ts", () => ({
  ensureProjectStateDirSync: ensureProjectStateDirSyncMock,
}));

import { ConventionStore, createStore } from "#learner/storage.ts";

describe("ConventionStore", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    existsSyncMock.mockReturnValue(true);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("creates the database directory and schema during init", () => {
    const harness = createDbHarness();
    databaseFactoryMock.mockReturnValue(harness.db);
    existsSyncMock.mockReturnValue(false);

    const store = new ConventionStore("/repo/.taro/conventions.db");
    store.init();

    expect(mkdirSyncMock).toHaveBeenCalledWith("/repo/.taro", {
      recursive: true,
    });
    expect(databaseFactoryMock).toHaveBeenCalledWith(
      "/repo/.taro/conventions.db"
    );
    expect(harness.exec).toHaveBeenCalledTimes(2);
  });

  it("throws when methods are used before initialization", () => {
    const store = new ConventionStore("/repo/.taro/conventions.db");

    expect(() => store.saveConventions({} as never)).toThrow(
      "Database not initialized"
    );
    expect(() => store.loadConventions()).toThrow("Database not initialized");
    expect(() => store.getCached("x")).toThrow("Database not initialized");
    expect(() => store.setCached("x", "y")).toThrow("Database not initialized");
    expect(() => store.deleteCached("x")).toThrow("Database not initialized");
    expect(() => store.clearCache()).toThrow("Database not initialized");
  });

  it("saves and loads conventions", () => {
    const harness = createDbHarness();
    databaseFactoryMock.mockReturnValue(harness.db);

    const store = new ConventionStore("/repo/.taro/conventions.db");
    store.init();
    store.saveConventions({ importStyle: "esm" } as never, "app");

    expect(store.loadConventions("app")).toEqual({ importStyle: "esm" });
  });

  it("returns null when conventions are missing or invalid JSON", () => {
    const harness = createDbHarness();
    databaseFactoryMock.mockReturnValue(harness.db);

    const store = new ConventionStore("/repo/.taro/conventions.db");
    store.init();

    expect(store.loadConventions("missing")).toBeNull();

    harness.setConventionRow("{invalid json");
    expect(store.loadConventions("broken")).toBeNull();
  });

  it("sets, gets, expires, deletes, and clears cache entries", () => {
    const harness = createDbHarness();
    databaseFactoryMock.mockReturnValue(harness.db);

    const store = new ConventionStore("/repo/.taro/conventions.db");
    store.init();

    store.setCached("settings", { theme: "light" }, 60);
    expect(store.getCached("settings")).toEqual({ theme: "light" });
    expect(harness.getCacheRow("settings")?.expires_at).toMatch(/T/);

    harness.setCacheRow(
      "expired",
      { stale: true },
      new Date(Date.now() - 1000).toISOString()
    );
    expect(store.getCached("expired")).toBeNull();
    expect(harness.getCacheRow("expired")).toBeUndefined();

    harness.setCacheRow("broken", "{not json}" as never, null);
    expect(store.getCached("broken")).toBeNull();

    store.deleteCached("settings");
    expect(store.getCached("settings")).toBeNull();

    store.setCached("a", 1);
    store.setCached("b", 2);
    store.clearCache();
    expect(store.getCached("a")).toBeNull();
    expect(store.getCached("b")).toBeNull();
  });

  it("closes the database connection safely", () => {
    const harness = createDbHarness();
    databaseFactoryMock.mockReturnValue(harness.db);

    const store = new ConventionStore("/repo/.taro/conventions.db");
    store.init();
    store.close();
    store.close();

    expect(harness.close).toHaveBeenCalledTimes(1);
  });
});

describe("createStore", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("creates and initializes a store in the project state directory", () => {
    const harness = createDbHarness();
    databaseFactoryMock.mockReturnValue(harness.db);

    const store = createStore("/repo");

    expect(ensureProjectStateDirSyncMock).toHaveBeenCalledWith("/repo");
    expect(databaseFactoryMock).toHaveBeenCalledWith(
      "/repo/.taro/conventions.db"
    );
    expect(store).toBeInstanceOf(ConventionStore);
  });
});
