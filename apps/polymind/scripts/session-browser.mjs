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
        version: "analysis-v2",
        commonGround: [],
        differences: [],
        questions: [
          {
            id: "synthetic-question",
            title: "A shared place",
            text: "A place we can reach and shape together.",
            sourceRefs: snapshot.contributions.map((c) => c.id),
          },
        ],
        otherConcerns: [],
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
async function captureReview(page, name) {
  await mkdir("test-results/copy-review", { recursive: true });
  const recovery = page.locator("#recovery");
  const original = (await recovery.count())
    ? await recovery.textContent()
    : null;
  if (original)
    await recovery.evaluate((el) => {
      el.textContent =
        "Private recovery code — use this to recover your place in another browser: [example code]";
    });
  await page.screenshot({
    path: resolve(`test-results/copy-review/${name}.png`),
    fullPage: true,
  });
  if (original)
    await recovery.evaluate((el, text) => {
      el.textContent = text;
    }, original);
}
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
  await captureReview(operator, "operator-sign-in");
  await operator.getByLabel("Operator access token").fill(token);
  await operator.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    operator.getByRole("button", { name: "Create session", exact: true }),
  ).toBeVisible();
  await operator
    .getByRole("button", { name: "Create session", exact: true })
    .click();
  await expect(operator.locator("#counts")).toContainText("0 / 140");
  await operator
    .getByRole("button", { name: "Open writing", exact: true })
    .click();
  await expect(operator.locator("#round-status")).toContainText("Writing open");
  const destination = await operator.locator("#join-link").getAttribute("href");
  // A Hub control link must select its session even when another session exists.
  const otherSession = await operator.evaluate(async () => {
    const result = await fetch("/api/operator/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Other synthetic session", capacity: 140 }),
    });
    if (!result.ok)
      throw new Error("Could not create synthetic second session");
    return result.json();
  });
  await operator.goto(
    `${origin}/operator?session=${encodeURIComponent(otherSession.id)}`,
  );
  await expect(operator.locator("#sessions")).toHaveValue(otherSession.id);
  await expect(operator.locator("#join-link")).toHaveAttribute(
    "href",
    `/?session=${otherSession.id}`,
  );
  await operator.goto(`${origin}/operator?session=missing-synthetic-session`);
  await expect(operator.locator("#status")).toContainText(
    "linked session was not found",
  );
  await expect(operator.locator("#workspace")).toBeHidden();
  await operator.goto(
    `${origin}/operator${new URL(`${origin}${destination}`).search}`,
  );
  await expect(operator.locator("#join-link")).toHaveAttribute(
    "href",
    destination,
  );
  await participant.goto(`${origin}${destination}#rw-name-v1=Robin`);
  await expect(participant.getByLabel("Your name")).toHaveValue("Robin");
  await expect(participant).toHaveURL(`${origin}${destination}`);
  await captureReview(participant, "participant-join");
  await participant.getByRole("button", { name: "Join session" }).click();
  await expect(participant.locator("#badge")).toHaveText("001");
  const questionBox = await participant.locator("#prompt").boundingBox();
  const writingBox = await participant.locator("#text").boundingBox();
  expect(questionBox.y).toBeGreaterThanOrEqual(0);
  expect(writingBox.y + writingBox.height).toBeLessThanOrEqual(844);
  expect(writingBox.height).toBeGreaterThanOrEqual(180);
  await captureReview(participant, "participant-write");
  await participant
    .getByLabel("Your contribution", { exact: true })
    .fill("We need an accessible place to gather and make things together.");
  await expect(participant.locator("#saved")).toHaveText("Saved");
  const included = await (
    await mobile.request.get(
      `${origin}/api/state${new URL(`${origin}${destination}`).search}`,
    )
  ).json();
  if (!included.contribution.confirmed || !included.contribution.matching)
    throw new Error("Saved writing must be included in the round and matching");
  await expect(participant.locator("#confirm")).toHaveCount(0);
  await expect(participant.locator("#matching")).toHaveCount(0);
  await captureReview(participant, "participant-confirmed");
  await participant.reload();
  await expect(participant.locator("#badge")).toHaveText("001");
  await expect(
    participant.getByLabel("Your contribution", { exact: true }),
  ).toHaveValue(
    "We need an accessible place to gather and make things together.",
  );
  if (!(await operator.locator("#model").isVisible()))
    await operator.locator("#setup > summary").click();
  await operator
    .getByLabel("Text model", { exact: true })
    .fill("synthetic-fake-provider");
  await operator
    .getByRole("button", { name: "Close writing and analyse", exact: true })
    .click();
  await expect(operator.locator("#snapshot-info")).toContainText(
    "1 contributions",
  );
  await expect(operator.locator("#analysis-status")).toContainText("complete");
  const projection = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  });
  await projection.goto(
    `${origin}/projection${new URL(`${origin}${destination}`).search}`,
  );
  await expect(
    projection.getByText("A place we can reach and shape together.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(projection.locator("nav, button")).toHaveCount(0);
  await expect(operator.locator("#status")).toHaveText("");
  await captureReview(projection, "projection-published");
  await captureReview(operator, "operator-review");
  // Identity changes in the same browser must never inherit another person's draft.
  await operator
    .getByRole("button", { name: "Open writing", exact: true })
    .click();
  await expect(participant.locator("#text")).toBeEnabled();
  await expect(participant.locator("#text")).toHaveValue("");
  const sessionQuery = new URL(`${origin}${destination}`).search;
  await participant.route("**/api/contribution?*", (route) => route.abort());
  await participant.locator("#text").fill("Synthetic private draft for Robin");
  await expect(participant.locator("#saved")).toContainText("Not yet saved");
  await captureReview(participant, "participant-unsaved");
  await mobile.clearCookies();
  await participant.reload();
  await participant.getByLabel("Your name").fill("Casey");
  await participant.getByRole("button", { name: "Join session" }).click();
  await expect(participant.locator("#badge")).toHaveText("002");
  await expect(participant.locator("#text")).toHaveValue("");
  await participant.unroute("**/api/contribution?*");
  await participant.locator("#text").fill("Synthetic contribution for Casey");
  await expect(participant.locator("#saved")).toHaveText("Saved");
  const casey = await (
    await mobile.request.get(`${origin}/api/state${sessionQuery}`)
  ).json();
  if (casey.contribution.text !== "Synthetic contribution for Casey")
    throw new Error("Identity isolation failed");
  const recovery = (await participant.locator("#recovery").textContent())
    .split(": ")
    .at(-1);
  await mobile.clearCookies();
  const other = await mobile.request.post(`${origin}/api/join${sessionQuery}`, {
    headers: { Origin: origin },
    data: { name: "Morgan", seated: false },
  });
  if (!other.ok()) throw new Error("Synthetic identity switch failed");
  await expect(participant.locator("#badge")).toHaveText("003", {
    timeout: 10000,
  });
  await participant.route("**/api/contribution?*", (route) => route.abort());
  await participant.locator("#text").fill("Synthetic private draft for Morgan");
  await expect(participant.locator("#saved")).toContainText("Not yet saved");
  const recovered = await mobile.request.post(
    `${origin}/api/recover${sessionQuery}`,
    { headers: { Origin: origin }, data: { recovery } },
  );
  if (!recovered.ok()) throw new Error("Synthetic recovery failed");
  await expect(participant.locator("#badge")).toHaveText("002", {
    timeout: 10000,
  });
  await expect(participant.locator("#text")).toHaveValue(
    "Synthetic contribution for Casey",
  );
  await participant.unroute("**/api/contribution?*");

  // Exercise operator controls with a synthetic voice; no provider is called.
  await operator.locator("#diagnostics > summary").click();
  await operator.locator("#legacy-freeze").click();
  let activeVoice;
  await operator.route("**/api/operator/state?*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: { ...(await response.json()), voice: activeVoice },
    });
  });
  await operator.route("**/api/operator/voice?*", async (route) => {
    const command = route.request().postDataJSON();
    const round = app.store.round(command.roundId);
    if (round.mode !== "continuous")
      throw new Error("Voice control targeted a bounded round");
    if (command.action !== "start" && command.roundId !== activeVoice?.roundId)
      throw new Error("Voice control changed the active round");
    if (command.action === "end") {
      const response = await route.fetch();
      if (!response.ok())
        throw new Error("End round did not close contributions");
    }
    if (command.action === "start")
      app.store.selectPresentation(round.sessionId, { kind: "voice" });
    activeVoice = {
      id: "synthetic-voice",
      roundId: round.id,
      status:
        command.action === "pause"
          ? "paused"
          : command.action === "end"
            ? "ended"
            : "running",
      text: "We can change how the room is used.",
    };
    await route.fulfill({ json: activeVoice });
  });
  await projection.route("**/api/projection?*", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    if (body.presentation?.kind === "voice")
      body.presentation.text = activeVoice?.text ?? "";
    await route.fulfill({ json: body });
  });
  await operator
    .getByText("Collective Microphone — separate activity", { exact: true })
    .click();
  await operator
    .locator("#microphone-prompt")
    .fill("Synthetic continuous invitation");
  await operator
    .getByRole("button", { name: "Open contributions", exact: true })
    .click();
  await expect(operator.locator("#voice-status")).toHaveText(
    "Contributions open. Voice has not started.",
  );
  await expect(participant.locator("#text")).toHaveValue("");
  await participant
    .locator("#text")
    .fill("Synthetic microphone writing for Casey");
  await expect(participant.locator("#saved")).toHaveText("Saved");
  await operator
    .getByRole("button", { name: "Start voice", exact: true })
    .click();
  await expect(operator.locator("#voice-status")).toHaveText(
    "Voice running. Contributions open.",
  );
  await expect(operator.locator("#voice-projection-status")).toContainText(
    "showing the collective voice",
  );
  await expect(projection.locator("#idea")).toHaveText(activeVoice.text);
  await expect(projection.locator("h1, h2, header, nav")).toHaveCount(0);
  const firstVoiceRound = activeVoice.roundId;
  await operator
    .getByRole("button", { name: "Pause voice", exact: true })
    .click();
  await expect(operator.locator("#voice-status")).toHaveText(
    "Voice paused. Contributions remain open.",
  );
  await expect(participant.locator("#text")).toBeEnabled();
  await operator
    .getByRole("button", { name: "Resume voice", exact: true })
    .click();
  await expect(operator.locator("#voice-status")).toHaveText(
    "Voice running. Contributions open.",
  );
  if (activeVoice.roundId !== firstVoiceRound)
    throw new Error("Resume created another round");
  await operator
    .getByRole("button", { name: "End round", exact: true })
    .click();
  await expect(operator.locator("#voice-status")).toHaveText(
    "Round ended. Contributions are closed.",
  );
  await expect(participant.locator("#text")).toBeDisabled();
  await expect(participant.locator("#earlier-writing")).toBeVisible();
  await operator
    .locator("#microphone-prompt")
    .fill("An edited continuous invitation");
  await operator
    .getByRole("button", { name: "Start a new microphone round", exact: true })
    .click();
  await expect(participant.locator("#prompt")).toHaveText(
    "An edited continuous invitation",
  );
  await expect(participant.locator("#text")).toHaveValue("");
  await expect(participant.locator("#badge")).toHaveText("002");
  await expect(participant.locator("#bounded")).toHaveCount(0);
  await participant.locator("#earlier-writing > summary").click();
  await expect(participant.locator("#earlier-contributions")).toContainText(
    "Synthetic microphone writing for Casey",
  );
  await expect(
    participant.locator(
      "#earlier-contributions textarea, #earlier-contributions input, #earlier-contributions [contenteditable]",
    ),
  ).toHaveCount(0);
  await captureReview(participant, "participant-live");
  await expect(operator.locator("#status")).toHaveText("");
  await captureReview(operator, "operator-live");
  await mkdir("test-results", { recursive: true });
  for (const [page, name] of [
    [participant, "participant"],
    [operator, "operator"],
    [projection, "projection"],
  ]) {
    await page.screenshot({
      path: resolve(`test-results/session-${name}.png`),
      fullPage: true,
    });
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      if (
        !(await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ))
      ) {
        throw new Error(`${name} overflows at ${width}px`);
      }
      await page.screenshot({
        path: resolve(`test-results/session-${name}-${width}.png`),
        fullPage: true,
      });
    }
  }
  await participant.setViewportSize({ width: 390, height: 844 });
  await participant.evaluate(() => {
    document.documentElement.style.fontSize = "36px";
  });
  expect(
    await participant.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await captureReview(participant, "participant-enlarged-text");
  await participant.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Browser flow passed: operator sign-in → join → autosave/include → return → analyse/autoproject → identity isolation → voice controls across rounds. Screenshots in test-results/.",
  );
} finally {
  await browser?.close();
  await app.close();
  await rm(directory, { recursive: true, force: true });
}
