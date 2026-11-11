import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { startSessionServer } from "../dist/session/server.js";

const directory = await mkdtemp(join(tmpdir(), "polymind-browser-"));
const port = 35000 + Math.floor(Math.random() * 10000),
  origin = `http://127.0.0.1:${port}`;
const token = "synthetic-browser-operator-token-with-32-characters";
const app = await startSessionServer({
  directory,
  port,
  origin,
  operatorToken: token,
  executor: async (op, snapshot) => {
    if (op.kind === "voice")
      return {
        text: "We want an accessible place to gather.",
        sourceRefs: snapshot.contributions.map((c) => c.id),
      };
    if (op.kind === "analysis")
      return {
        themes: [
          {
            text: "A place we can reach and shape together.",
            sourceRefs: snapshot.contributions.map((c) => c.id),
          },
        ],
        similarities: [],
        tensions: [],
        conflicts: [],
        outlyingConcerns: [],
        questions: [],
      };
    return {
      schemaVersion: 1,
      jobId: op.id,
      snapshot: { id: snapshot.id, hash: op.snapshotHash },
      mode: op.config.mode,
      groups: [
        {
          id: "synthetic-group",
          participantIds: snapshot.eligible,
          sourceRefs: Object.fromEntries(
            snapshot.contributions.map((c) => [c.participantId, [c.id]]),
          ),
          reviewRequired: snapshot.eligible.length === 3,
        },
      ],
    };
  },
});
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const operator = await browser.newPage({
    viewport: { width: 1360, height: 1000 },
  });
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const participant = await mobile.newPage();
  const errors = [];
  for (const page of [operator, participant])
    page.on("pageerror", (e) => errors.push(e.message));
  await operator.goto(`${origin}/operator`);
  await operator.getByLabel("Operator access token").fill(token);
  await operator.getByRole("button", { name: "Sign in", exact: true }).click();
  await operator
    .getByRole("button", { name: "Create session", exact: true })
    .click();
  await expect(operator.locator("#counts")).toContainText("0 / 140");
  await operator
    .getByRole("button", { name: "Open round", exact: true })
    .click();
  await expect(operator.locator("#round-status")).toContainText("collecting");
  const destination = await operator.locator("#join-link").getAttribute("href");
  await participant.goto(`${origin}${destination}`);
  await participant
    .getByLabel("What should your partner call you?")
    .fill("Robin");
  await participant
    .getByRole("button", { name: "Join this gathering" })
    .click();
  await expect(participant.locator("#badge")).toHaveText("001");
  await participant
    .getByLabel("Your contribution", { exact: true })
    .fill("We need an accessible place to gather and make things together.");
  await participant.getByLabel("Include me in this round’s matching").check();
  await participant
    .getByRole("button", { name: "Confirm my contribution" })
    .click();
  await expect(participant.locator("#saved")).toContainText("Confirmed");
  await participant.reload();
  await expect(participant.locator("#badge")).toHaveText("001");
  await expect(
    participant.getByLabel("Your contribution", { exact: true }),
  ).toHaveValue(
    "We need an accessible place to gather and make things together.",
  );
  await operator
    .getByRole("button", {
      name: "Close round and freeze confirmed contributions",
    })
    .click();
  await expect(operator.locator("#snapshot-info")).toContainText("1 confirmed");
  await operator
    .getByLabel("Text model", { exact: true })
    .fill("synthetic-fake-provider");
  await operator
    .getByRole("button", { name: "Analyse frozen contributions" })
    .click();
  await expect(operator.locator("#jobs")).toContainText("succeeded");
  const projection = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  });
  await projection.goto(
    `${origin}/projection${new URL(`${origin}${destination}`).search}`,
  );
  await expect(projection.locator("#idea")).not.toContainText(
    "A place we can reach",
  );
  await operator.getByRole("button", { name: "Reveal on projection" }).click();
  await expect(projection.locator("#idea")).toContainText(
    "A place we can reach",
  );
  await mkdir("test-results", { recursive: true });
  for (const [page, name] of [
    [participant, "participant"],
    [operator, "operator"],
    [projection, "projection"],
  ])
    await page.screenshot({
      path: resolve(`test-results/session-${name}.png`),
      fullPage: true,
    });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Browser flow passed: operator sign-in → join → autosave/confirm → return → freeze → review/reveal. Screenshots in test-results/.",
  );
} finally {
  await browser?.close();
  await app.close();
  await rm(directory, { recursive: true, force: true });
}
