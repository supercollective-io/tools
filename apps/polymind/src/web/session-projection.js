const session = new URL(location.href).searchParams.get("session");

import { renderAtlas } from "./session-atlas.js";

const idea = document.getElementById("idea");
const categories = [
  ["commonGround", "Common ground", 4],
  ["differences", "Differences", 3],
  ["questions", "Core questions", 3],
  ["otherConcerns", "Other concerns", 2],
];
let signature = "";
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function overview(result, count) {
  const view = element("div", undefined, "analysis-overview");
  const header = element("header");
  header.append(element("h1", "Collective analysis"));
  if (Number.isFinite(count))
    header.append(element("p", `${count} contributions`));
  view.append(header);
  const grid = element("div", undefined, "overview-grid");
  for (const [key, label, limit] of categories) {
    const section = element("section", undefined, "overview-category");
    section.dataset.category = key;
    section.append(element("h2", label));
    const findings = result[key] ?? [];
    if (!findings.length)
      section.append(
        element("p", "None identified in this analysis.", "overview-empty"),
      );
    for (const finding of findings.slice(0, limit)) {
      const article = element("article", undefined, "overview-finding");
      if (finding.title) article.append(element("h3", finding.title));
      article.append(element("p", finding.text));
      section.append(article);
    }
    grid.append(section);
  }
  view.append(grid);
  return view;
}
function render(state) {
  const presentation = state.presentation;
  const key = JSON.stringify(
    presentation ?? { results: state.results, voice: state.voice?.text },
  );
  if (signature === key) return;
  const isAtlas =
    presentation?.kind === "analysis" &&
    presentation.atlas &&
    presentation.atlasView?.mode === "atlas";
  document.documentElement.classList.toggle(
    "projection-atlas",
    Boolean(isAtlas),
  );
  const theme = document.querySelector('meta[name="theme-color"]');
  if (theme) theme.content = isAtlas ? "#f3f3ef" : "#161616";
  let content;
  if (presentation?.kind === "writing") {
    content = element(
      "div",
      undefined,
      "projection-waiting projection-writing",
    );
    content.append(element("h1", presentation.question));
    content.append(element("p", `${presentation.count} saved contributions`));
  } else if (presentation?.kind === "analysis") {
    if (presentation.atlas && presentation.atlasView?.mode === "atlas")
      content = renderAtlas(presentation.atlas, presentation.atlasView);
    else if (presentation.result)
      content = overview(presentation.result, presentation.count);
    else {
      content = element("div", undefined, "projection-waiting");
      content.append(element("h1", "Collective analysis"));
      const messages = {
        queued: "Analysis queued.",
        running: "Analysing the saved contributions.",
        failed: "Analysis failed. The operator can retry.",
        interrupted: "Analysis interrupted. The operator can retry.",
        cancelled: "Analysis cancelled.",
      };
      content.append(
        element("p", messages[presentation.state] ?? "Waiting for analysis."),
      );
    }
  } else if (presentation?.kind === "voice") {
    content = element("div", undefined, "projection-voice");
    content.append(
      element("p", presentation.text?.slice(-500) || "Waiting for the voice."),
    );
  } else {
    // Retain historical publication rendering only when no presentation is selected.
    const latest = state.results?.at(-1);
    if (latest?.result?.version === "analysis-v2")
      content = overview(latest.result);
    else if (state.voice?.text || latest?.kind === "voice") {
      content = element("div", undefined, "projection-voice");
      content.append(
        element("p", state.voice?.text?.slice(-500) || latest.result.text),
      );
    } else if (latest?.result) {
      content = element("div", undefined, "legacy-overview");
      content.append(element("h1", "Collective analysis"));
      for (const [key, findings] of Object.entries(latest.result)) {
        if (!Array.isArray(findings) || !findings.length) continue;
        const section = element("section");
        section.append(element("h2", key.replace(/([A-Z])/g, " $1")));
        for (const finding of findings)
          section.append(element("p", finding.text));
        content.append(section);
      }
    } else {
      content = element("div", undefined, "projection-waiting");
      content.append(element("h1", "Waiting for the round"));
    }
  }
  signature = key;
  idea.firstElementChild?.dispose?.();
  idea.replaceChildren(content);
  idea.classList.toggle("overview-reveal", Boolean(presentation?.result));
}
async function refresh() {
  try {
    const response = await fetch(
      `/api/projection?session=${encodeURIComponent(session ?? "")}`,
    );
    if (!response.ok) throw new Error("Projection unavailable.");
    render(await response.json());
    document.getElementById("projection-connection").hidden = true;
  } catch {
    document.getElementById("projection-connection").hidden = false;
  }
}
void refresh();
setInterval(refresh, 1500);
