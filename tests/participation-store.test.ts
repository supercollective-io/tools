import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { ParticipationStore } from "../src/participation-store.ts";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function storeFixture() {
  const directory = await mkdtemp(join(tmpdir(), "participation-store-test-"));
  directories.push(directory);
  return new ParticipationStore(join(directory, "inputs.sqlite"), "test-run");
}

it("captures the latest pending revision for all 100 participants", async () => {
  const store = await storeFixture();
  try {
    const people = Array.from({ length: 100 }, () => store.join());
    for (const person of people)
      store.revise(person.id, 1, `thought ${person.id}`);

    const batch = store.batch();
    expect(batch).toHaveLength(100);
    expect(batch.map((item) => item.participant)).toEqual(
      people.map((person) => person.id),
    );
    expect(batch.every((item) => item.revision === 1)).toBe(true);
  } finally {
    store.close();
  }
});

it("coalesces superseded revisions to the latest revision in a snapshot", async () => {
  const store = await storeFixture();
  try {
    const person = store.join();
    store.revise(person.id, 1, "first draft");
    store.revise(person.id, 2, "second draft");
    store.revise(person.id, 3, "final draft");

    expect(store.batch()).toEqual([
      expect.objectContaining({
        participant: person.id,
        revision: 3,
        text: "final draft",
      }),
    ]);
  } finally {
    store.close();
  }
});

it("leaves a revision saved after a snapshot pending when the old snapshot is acknowledged", async () => {
  const store = await storeFixture();
  try {
    const person = store.join();
    store.revise(person.id, 1, "captured revision");
    const oldSnapshot = store.batch()[0];
    expect(oldSnapshot).toBeDefined();
    if (!oldSnapshot) throw new Error("Missing snapshot");

    store.revise(person.id, 2, "new revision");
    store.admitted(
      oldSnapshot.id,
      oldSnapshot.position,
      oldSnapshot.revision,
      oldSnapshot.participant,
    );

    expect(store.batch()).toEqual([
      expect.objectContaining({
        participant: person.id,
        revision: 2,
        text: "new revision",
      }),
    ]);
  } finally {
    store.close();
  }
});

it("handles replayed acknowledgements idempotently", async () => {
  const store = await storeFixture();
  try {
    const person = store.join();
    store.revise(person.id, 1, "one thought");
    const snapshot = store.batch()[0];
    expect(snapshot).toBeDefined();
    if (!snapshot) throw new Error("Missing snapshot");

    store.admitted(
      snapshot.id,
      snapshot.position,
      snapshot.revision,
      snapshot.participant,
    );
    store.admitted(
      snapshot.id,
      snapshot.position,
      snapshot.revision,
      snapshot.participant,
    );

    expect(store.batch()).toEqual([]);
    expect(store.current(person.id)).toEqual({
      revision: 1,
      text: "one thought",
    });
  } finally {
    store.close();
  }
});

it("keeps legacy chunks in per-person order across batches", async () => {
  const store = await storeFixture();
  try {
    const people = Array.from({ length: 3 }, () => store.join());
    for (const [index, person] of people.entries())
      store.submit(person.id, `submission-${index}`, "x".repeat(600), 0);

    const firstBatch = store.batch();
    expect(firstBatch.map((item) => item.id)).toEqual(
      people.map(
        (person) => `${person.id}:submission-${people.indexOf(person)}:0`,
      ),
    );
    for (const item of firstBatch) store.admitted(item.id, item.position);

    const secondBatch = store.batch();
    expect(secondBatch.map((item) => item.id)).toEqual(
      people.map((person, index) => `${person.id}:submission-${index}:500`),
    );
    for (const item of secondBatch) store.admitted(item.id, item.position);

    expect(store.batch()).toEqual([]);
  } finally {
    store.close();
  }
});
