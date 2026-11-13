import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { SessionStore } from "../src/session/store.ts";

it("recovers a creation request across restart without duplicating or accepting changed settings", () => {
  const directory = mkdtempSync(join(tmpdir(), "polymind-creation-"));
  const path = join(directory, "sessions.sqlite");
  let store = new SessionStore(path);
  try {
    const key = "synthetic-session-request-001";
    const created = store.createSession("Synthetic session", 140, key);
    expect(store.createSession("Synthetic session", 140, key)).toEqual(created);
    expect(() => store.createSession("Different session", 140, key)).toThrow(
      "different settings",
    );
    store.close();
    store = new SessionStore(path);
    expect(store.createSession("Synthetic session", 140, key)).toEqual(created);
    expect(store.sessions()).toHaveLength(1);
    expect(() =>
      store.createSession("Invalid capacity", 1, "synthetic-bad-request-001"),
    ).toThrow();
    expect(
      store.createSession("Valid capacity", 140, "synthetic-bad-request-001"),
    ).toBeDefined();
    expect(store.sessions()).toHaveLength(2);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
