import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, expect } from "@playwright/test";
import { buildAtlas } from "../dist/session/atlas.js";
import { startSessionServer } from "../dist/session/server.js";

// This is a software rehearsal: every provider result and every contribution is synthetic.
const directory = await mkdtemp(join(tmpdir(), "polymind-show-browser-"));
const port = 35000 + Math.floor(Math.random() * 10000);
const origin = `http://127.0.0.1:${port}`;
const token = "synthetic-show-operator-token-at-least-32-characters";
const question = "What could we change together? Synthetic original question.";
const writing = [
  "Synthetic Robin contribution: an accessible workshop with shared tools.",
  "Synthetic Casey contribution: a quiet garden with shared responsibility.",
];
const calls = [];
let findings;
let finishAnalysis;
const analysisReady = new Promise((resolve) => {
  finishAnalysis = resolve;
});
const sized = (prefix, length) =>
  `${prefix} ${"shared places and careful decisions ".repeat(10)}`.slice(
    0,
    length,
  );
const app = await startSessionServer({
  directory,
  port,
  origin,
  operatorToken: token,
  executor: async (operation, snapshot) => {
    calls.push({ operation, snapshot: structuredClone(snapshot) });
    if (operation.kind === "atlas")
      return buildAtlas(
        snapshot,
        operation.snapshotHash,
        operation.config.embeddingModel,
        snapshot.contributions.map(() => [1, 0]),
      );
    if (operation.kind === "analysis") {
      const refs = snapshot.contributions.map((item) => item.id);
      let number = 0;
      const group = (category, count) =>
        Array.from({ length: count }, (_, index) => {
          const own = refs[index % refs.length];
          const finding = {
            id: `synthetic-finding-${++number}`,
            title: sized(`${category} ${index + 1}`, 60),
            text: sized(
              `Synthetic ${category.toLowerCase()} perspective ${index + 1}.`,
              180,
            ),
            sourceRefs: ["Common ground", "Difference"].includes(category)
              ? refs
              : [own],
            evidence: [
              {
                sourceRef: own,
                text: snapshot.contributions
                  .find((item) => item.id === own)
                  .text.slice(0, 30),
              },
            ],
          };
          if (category === "Difference")
            finding.distinction = ["emphasis", "tension", "disagreement"][
              index
            ];
          return finding;
        });
      findings = {
        version: "analysis-v2",
        commonGround: group("Common ground", 4),
        differences: group("Difference", 3),
        questions: group("Question", 3),
        otherConcerns: group("Other concern", 2),
      };
      await analysisReady;
      return findings;
    }
    if (operation.kind === "voice")
      return {
        text: "Synthetic bounded voice.",
        sourceRefs: snapshot.contributions.map((item) => item.id),
      };
    return {
      schemaVersion: 1,
      jobId: operation.id,
      snapshot: { id: snapshot.id, hash: operation.snapshotHash },
      mode: operation.config.mode,
      groups: [
        {
          id: "synthetic-pair",
          participantIds: snapshot.eligible,
          sourceRefs: Object.fromEntries(
            snapshot.contributions.map((item) => [
              item.participantId,
              [item.id],
            ]),
          ),
          reviewRequired: false,
        },
      ],
    };
  },
});
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const errors = [];
  const operator = await browser.newPage({
    viewport: { width: 1360, height: 1000 },
  });
  const contexts = await Promise.all(
    [0, 1].map(() =>
      browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      }),
    ),
  );
  const phones = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  const projection = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  for (const page of [operator, projection, ...phones])
    page.on("pageerror", (error) => errors.push(error.message));
  await operator.goto(`${origin}/operator`);
  await operator.getByLabel("Operator access token").fill(token);
  await operator.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    operator.getByRole("button", { name: "Create session", exact: true }),
  ).toBeVisible();
  await operator
    .getByRole("button", { name: "Create session", exact: true })
    .click();
  await operator.getByLabel("Round question", { exact: true }).fill(question);
  await operator
    .getByRole("button", { name: "Open writing", exact: true })
    .click();
  const entrance = await operator.locator("#join-link").getAttribute("href");
  const query = new URL(entrance, origin).search;
  const state = async (context) =>
    (await context.request.get(`${origin}/api/state${query}`)).json();
  const operatorState = async () =>
    (await operator.request.get(`${origin}/api/operator/state${query}`)).json();
  for (const [index, phone] of phones.entries()) {
    await phone.goto(new URL(entrance, origin).href);
    await phone.getByLabel("Your name").fill(["Robin", "Casey"][index]);
    await phone
      .getByRole("button", { name: "Join session", exact: true })
      .click();
    await phone
      .getByLabel("Your contribution", { exact: true })
      .fill(writing[index]);
    await expect(phone.locator("#saved")).toHaveText("Saved");
    const saved = await state(contexts[index]);
    assert.equal(saved.contribution.text, writing[index]);
    assert.equal(saved.contribution.confirmed, true);
    assert.equal(saved.contribution.matching, true);
  }
  await projection.goto(`${origin}/projection${query}`);
  await operator
    .getByRole("button", {
      name: "Close collection without analysis",
      exact: true,
    })
    .click();
  await expect(operator.locator("#close-writing")).toBeDisabled();
  await expect(operator.locator("#freeze")).toHaveText(
    "Analyse frozen writing",
  );
  assert.equal(
    calls.some((call) => call.operation.kind === "analysis"),
    false,
  );
  if (!(await operator.locator("#model").isVisible()))
    await operator.locator("#setup > summary").click();
  await operator
    .getByLabel("Text model", { exact: true })
    .fill("synthetic-provider-never-called");
  await operator
    .getByRole("button", { name: "Analyse frozen writing", exact: true })
    .click();
  await expect
    .poll(async () => calls.some((call) => call.operation.kind === "analysis"))
    .toBe(true);
  assert.equal((await state(contexts[0])).show.analysisState, "running");
  assert.equal((await state(contexts[0])).personalAnalysis, undefined);
  await expect(
    phones[0].getByText("Writing closed. Analysis in progress.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(phones[0].locator("#personal")).toBeHidden();
  finishAnalysis();
  await expect
    .poll(
      async () =>
        (await operatorState()).operations.find(
          (operation) => operation.kind === "analysis",
        )?.state,
    )
    .toBe("succeeded");
  const analysis = (await operatorState()).operations.find(
    (operation) => operation.kind === "analysis",
  );
  const frozen = calls.find(
    (call) => call.operation.kind === "analysis",
  ).snapshot;
  assert.deepEqual(
    frozen.contributions.map((item) => item.text),
    writing,
  );
  assert(frozen.contributions.every((item) => item.prompt === question));
  await expect(
    phones[0].getByText("Analysis complete", { exact: true }),
  ).toBeVisible();
  for (const context of contexts)
    assert.equal((await state(context)).personalAnalysis, undefined);
  for (const phone of phones)
    await expect(phone.locator("#personal")).toBeHidden();

  const allFindings = [
    "commonGround",
    "differences",
    "questions",
    "otherConcerns",
  ].flatMap((category) => findings[category]);
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await projection.setViewportSize(viewport);
    for (const finding of allFindings) {
      await expect(
        projection.getByText(finding.title, { exact: true }),
      ).toBeVisible();
      await expect(
        projection.getByText(finding.text, { exact: true }),
      ).toBeVisible();
    }
    const fits = await projection.evaluate(() => {
      const viewportFits =
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight;
      const elementsFit = [...document.querySelectorAll("h1,h2,h3,p")]
        .filter((element) => element.getBoundingClientRect().height)
        .every((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.top >= 0 &&
            rect.bottom <= innerHeight &&
            rect.left >= 0 &&
            rect.right <= innerWidth &&
            (() => {
              const range = document.createRange();
              range.selectNodeContents(element);
              return [...range.getClientRects()].every(
                (box) =>
                  box.top >= 0 &&
                  box.bottom <= innerHeight &&
                  box.left >= 0 &&
                  box.right <= innerWidth,
              );
            })()
          );
        });
      return viewportFits && elementsFit;
    });
    await mkdir("test-results/show-flow", { recursive: true });
    await projection.screenshot({
      path: resolve(`test-results/show-flow/projection-${viewport.width}.png`),
    });
    assert(
      fits,
      `The complete maximum-length overview must fit ${viewport.width} × ${viewport.height}`,
    );
  }
  await operator.screenshot({
    path: resolve("test-results/show-flow/operator-analysis.png"),
    fullPage: true,
  });
  const publicResponse = await (
    await projection.request.get(`${origin}/api/projection${query}`)
  ).text();
  assert(!publicResponse.includes("sourceRefs"));
  assert(!publicResponse.includes("evidence"));
  assert(!publicResponse.includes(writing[0]));
  assert(!publicResponse.includes(writing[1]));

  await operator
    .getByRole("button", { name: "Build atlas", exact: true })
    .click();
  await expect(operator.locator("#atlas-reviewed")).toBeVisible();
  await operator.locator("#atlas-reviewed").check();
  await operator
    .getByRole("button", {
      name: "Publish original writing in atlas",
      exact: true,
    })
    .click();
  await operator
    .locator("#atlas-finding")
    .selectOption(findings.commonGround[0].id);
  await operator
    .getByRole("button", { name: "Show atlas on projection", exact: true })
    .click();
  await expect(projection.locator(".analysis-atlas")).toBeVisible();
  await expect(projection.locator(".atlas-contribution")).toHaveCount(2);
  await expect(
    projection.getByText("The room, connected", { exact: true }),
  ).toHaveCount(0);
  await expect(projection.locator(".atlas-key")).toHaveCount(0);
  assert.deepEqual(
    await projection.locator(".atlas-node text").allTextContents(),
    ["1", "2"],
  );
  assert(
    (
      await projection
        .locator(".atlas-node circle")
        .first()
        .getAttribute("fill")
    ).startsWith("#"),
  );

  await expect(projection.locator(".atlas-reading")).toContainText(writing[0]);
  assert.equal(await projection.locator(".analysis-atlas button").count(), 0);
  const atlasResponse = await (
    await projection.request.get(`${origin}/api/projection${query}`)
  ).json();
  assert.deepEqual(atlasResponse.presentation.atlas.findings[0].sourceRefs, [
    "c1",
    "c2",
  ]);
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
    { width: 390, height: 844 },
  ]) {
    await projection.setViewportSize(viewport);
    await projection.screenshot({
      path: resolve(`test-results/show-flow/atlas-${viewport.width}.png`),
      fullPage: true,
    });
    assert(
      await projection.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Atlas must fit the screen width",
    );
  }
  await operator
    .getByRole("button", { name: "Show analysis on projection", exact: true })
    .first()
    .click();
  await expect(projection.locator(".analysis-atlas")).toHaveCount(0);
  await projection.setViewportSize({ width: 1920, height: 1080 });

  await operator
    .getByRole("button", { name: "Release personal perspectives", exact: true })
    .click();
  for (const [index, context] of contexts.entries()) {
    await expect
      .poll(async () => Boolean((await state(context)).personalAnalysis))
      .toBe(true);
    const personal = (await state(context)).personalAnalysis;
    assert.equal(personal.contribution.text, writing[index]);
    assert.equal(personal.contribution.prompt, question);
    for (const category of [
      "commonGround",
      "differences",
      "questions",
      "otherConcerns",
    ]) {
      assert.deepEqual(
        personal.analysis[category].map((finding) => finding.id),
        findings[category]
          .filter((finding) =>
            finding.sourceRefs.includes(personal.contribution.id),
          )
          .map((finding) => finding.id),
      );
      for (const finding of personal.analysis[category]) {
        assert(
          finding.sourceRefs.every((ref) => ref === personal.contribution.id),
        );
        assert(
          (finding.evidence ?? []).every(
            (evidence) => evidence.sourceRef === personal.contribution.id,
          ),
        );
      }
    }
    assert.equal((await state(context)).encounters.length, 0);
    const phone = phones[index];
    await expect(phone.locator("#personal")).toBeVisible();
    await expect(phone.locator("#personal-findings")).toContainText(
      personal.analysis.commonGround[0].title,
    );
    for (const width of [320, 390]) {
      await phone.setViewportSize({ width, height: 844 });
      assert(
        await phone.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `Phone perspective overflows ${width}px`,
      );
      await phone.screenshot({
        path: resolve(`test-results/show-flow/personal-${index}-${width}.png`),
        fullPage: true,
        mask: [phone.locator("#recovery")],
      });
    }
  }
  // Editing the next invitation must never rewrite this round's frozen source.
  await operator
    .getByLabel("Round question", { exact: true })
    .fill("Synthetic next invitation, distinct from the frozen question.");
  await operator
    .getByText("Matching model, budget and roster", { exact: true })
    .click();
  await expect(operator.locator("#matching-mode")).toHaveValue("");
  await expect(
    operator.getByRole("button", { name: "Start matching", exact: true }),
  ).toBeDisabled();
  await operator.locator("#matching-mode").selectOption("similarity");
  await operator
    .getByLabel("Embedding model / collaboration model", { exact: true })
    .fill("synthetic-embedding-never-called");
  await operator
    .getByRole("button", { name: "Start matching", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await operatorState()).operations.find(
          (operation) => operation.kind === "matching",
        )?.state,
    )
    .toBe("succeeded");
  const matchCall = calls.find((call) => call.operation.kind === "matching");
  assert.equal(matchCall.snapshot.id, frozen.id);
  assert.deepEqual(matchCall.snapshot.contributions, frozen.contributions);
  assert.equal(matchCall.operation.config.mode, "similarity");
  for (const context of contexts)
    assert.equal((await state(context)).encounters.length, 0);
  await operator
    .getByPlaceholder("Meeting 1: verified zone or seated rendezvous")
    .fill("Synthetic Zone A");
  // Previous rounds remain reviewable while a new invitation is collecting.
  await operator
    .getByRole("button", { name: "Open writing", exact: true })
    .click();
  await expect(operator.locator("#round-status")).toContainText("Writing open");
  await expect(projection.locator("#idea")).toContainText(
    "Synthetic next invitation, distinct from the frozen question.",
  );
  await operator.locator("#diagnostics > summary").click();
  const previousLocation = operator.locator(
    `#location-${matchCall.operation.id}-0`,
  );
  await expect(previousLocation).toHaveValue("Synthetic Zone A");
  await expect(
    operator.locator("#jobs").getByRole("button", {
      name: "Show analysis on projection",
      exact: true,
    }),
  ).toBeVisible();
  await operator
    .locator("#jobs")
    .getByRole("button", { name: "Show analysis on projection", exact: true })
    .click();
  await expect(
    projection.getByRole("heading", {
      name: "Collective analysis",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    projection.getByText(findings.commonGround[0].text, { exact: true }),
  ).toBeVisible();
  await operator
    .getByRole("button", {
      name: "Release reviewed encounters privately",
      exact: true,
    })
    .click();
  for (const [index, context] of contexts.entries()) {
    await expect
      .poll(async () => (await state(context)).encounters.length)
      .toBe(1);
    const encounter = (await state(context)).encounters[0];
    assert.equal(encounter.partners.length, 1);
    assert.equal(encounter.partners[0].name, ["Casey", "Robin"][index]);
  }
  await operator.reload();
  await expect(operator.locator("#workspace")).toBeVisible();
  await operator.locator("#diagnostics > summary").click();
  await expect(
    operator.locator(`#location-${matchCall.operation.id}-0`),
  ).toHaveValue("Synthetic Zone A");
  await expect(
    operator.locator(`#location-${matchCall.operation.id}-0`),
  ).toBeDisabled();
  assert.equal(analysis.snapshotId, frozen.id);
  assert.deepEqual(errors, []);
  console.log(
    "Synthetic show flow passed: autosave → freeze and analyse → complete overview → reviewed atlas publication → personal release → explicit matching → private encounter release. Screenshots in test-results/show-flow/.",
  );
} finally {
  await browser?.close();
  await app.close();
  await rm(directory, { recursive: true, force: true });
}
