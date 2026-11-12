// Greedy weighted modularity: derived from edges, independently of analysis findings.
export function atlasNeighbourhoods(nodes, links) {
  const groups = new Map(nodes.map((n) => [n.id, new Set([n.id])]));
  const degrees = new Map(nodes.map((n) => [n.id, 0]));
  const weights = new Map(nodes.map((n) => [n.id, new Map()]));
  let total = 0;
  for (const { source, target, similarity } of links) {
    if (
      source === target ||
      !groups.has(source) ||
      !groups.has(target) ||
      !(similarity > 0)
    )
      continue;
    degrees.set(source, degrees.get(source) + similarity);
    degrees.set(target, degrees.get(target) + similarity);
    weights
      .get(source)
      .set(target, (weights.get(source).get(target) ?? 0) + similarity);
    weights
      .get(target)
      .set(source, (weights.get(target).get(source) ?? 0) + similarity);
    total += similarity;
  }
  while (total > 0) {
    let best = null,
      gain = 1e-12;
    const ids = [...groups.keys()].sort();
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = ids[i],
          b = ids[j],
          weight = weights.get(a).get(b) ?? 0;
        const delta =
          weight / total -
          (degrees.get(a) * degrees.get(b)) / (2 * total * total);
        if (delta > gain) {
          gain = delta;
          best = [a, b];
        }
      }
    if (!best) break;
    const [a, b] = best;
    for (const id of groups.get(b)) groups.get(a).add(id);
    for (const id of groups.keys())
      if (id !== a && id !== b) {
        const weight =
          (weights.get(a).get(id) ?? 0) + (weights.get(b).get(id) ?? 0);
        weights.get(a).set(id, weight);
        weights.get(id).set(a, weight);
        weights.get(id).delete(b);
      }
    weights.get(a).delete(b);
    weights.delete(b);
    degrees.set(a, degrees.get(a) + degrees.get(b));
    degrees.delete(b);
    groups.delete(b);
  }
  const membership = new Map();
  [...groups.values()]
    .filter((group) => group.size > 1)
    .sort((a, b) => [...a].sort()[0].localeCompare([...b].sort()[0]))
    .forEach((group, index) => {
      for (const id of group) membership.set(id, index);
    });
  return membership;
}

const number = (id) => String(id).replace(/^c(?=\d+$)/i, "");
const NEIGHBOURHOOD_COLOURS = [
  "#2855ff",
  "#ff4268",
  "#943cff",
  "#00b8c8",
  "#80cc16",
  "#ff8a00",
  "#ed35ba",
  "#00b88a",
];
const neighbourhoodColour = (index) =>
  index === undefined
    ? "#99998f"
    : (NEIGHBOURHOOD_COLOURS[index] ??
      `hsl(${(index * 137.508 + 215) % 360} 85% 52%)`);
const EXCERPT_LIMIT = 200;

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function layout(nodes, links, width, height) {
  const positions = nodes.map((node, index) => {
    const angle = index * 2.399963229728653;
    const radius = Math.sqrt(index + 0.5) * Math.min(width, height) * 0.045;
    return {
      id: node.id,
      x: width / 2 + Math.cos(angle) * radius,
      y: height / 2 + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
    };
  });
  const byId = new Map(positions.map((node) => [node.id, node]));
  const edgePoints = links
    .map((link) => [byId.get(link.source), byId.get(link.target)])
    .filter(([a, b]) => a && b);
  for (let step = 0; step < 220; step += 1) {
    for (let i = 0; i < positions.length; i += 1) {
      const a = positions[i];
      for (let j = i + 1; j < positions.length; j += 1) {
        const b = positions[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distance = Math.max(Math.hypot(dx, dy), 1);
        const force = Math.min(7, 2100 / (distance * distance));
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }
    for (const [a, b] of edgePoints) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.max(Math.hypot(dx, dy), 1);
      const force = (distance - 82) * 0.005;
      a.vx += (dx / distance) * force;
      a.vy += (dy / distance) * force;
      b.vx -= (dx / distance) * force;
      b.vy -= (dy / distance) * force;
    }
    for (const point of positions) {
      point.vx += (width / 2 - point.x) * 0.001;
      point.vy += (height / 2 - point.y) * 0.001;
      point.vx *= 0.76;
      point.vy *= 0.76;
      point.x += Math.max(-10, Math.min(10, point.vx));
      point.y += Math.max(-10, Math.min(10, point.vy));
      if (point.x < 30) point.vx += 0.5;
      if (point.x > width - 30) point.vx -= 0.5;
      if (point.y < 30) point.vy += 0.5;
      if (point.y > height - 30) point.vy -= 0.5;
    }
  }
  const bounds = positions.reduce(
    (current, point) => ({
      left: Math.min(current.left, point.x),
      right: Math.max(current.right, point.x),
      top: Math.min(current.top, point.y),
      bottom: Math.max(current.bottom, point.y),
    }),
    { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity },
  );
  const scale = Math.min(
    (width - 96) / Math.max(1, bounds.right - bounds.left),
    (height - 96) / Math.max(1, bounds.bottom - bounds.top),
  );
  for (const point of positions) {
    point.x = width / 2 + (point.x - (bounds.left + bounds.right) / 2) * scale;
    point.y = height / 2 + (point.y - (bounds.top + bounds.bottom) / 2) * scale;
  }
  return byId;
}

export function renderAtlas(atlas, view = {}) {
  const findings = Array.isArray(atlas.findings) ? atlas.findings : [];
  const nodes = Array.isArray(atlas.nodes) ? atlas.nodes : [];
  const links = Array.isArray(atlas.links) ? atlas.links : [];
  const selected = findings.find((finding) => finding.id === view.findingId);
  const sourceIds = new Set(selected?.sourceRefs ?? []);
  const wrapper = el("section", undefined, "analysis-atlas");
  const header = el("header", undefined, "atlas-header");
  header.append(
    el("p", `${nodes.length} contributions · ${links.length} connections`),
  );
  wrapper.append(header);

  const stage = el("div", undefined, "atlas-stage");
  const graphPanel = el("div", undefined, "atlas-map-wrap");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 1000 640");
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    `Network of ${nodes.length} contributions connected by semantic similarity`,
  );
  const desc = document.createElementNS("http://www.w3.org/2000/svg", "desc");
  desc.textContent = selected
    ? `Each numbered point is one contribution. Highlighted points support “${selected.title}”. Lines show semantic similarity, not agreement.`
    : "Each numbered point is one contribution. Select an analysis finding on the operator screen to highlight its sources. Lines show semantic similarity, not agreement.";
  svg.append(desc);

  const positions = layout(nodes, links, 1000, 640);
  const neighbourhoods = atlasNeighbourhoods(nodes, links);
  const colourByNode = (node) =>
    neighbourhoodColour(neighbourhoods.get(node.id));
  for (const link of links) {
    const a = positions.get(link.source);
    const b = positions.get(link.target);
    if (!a || !b) continue;
    const line = document.createElementNS(svg.namespaceURI, "line");
    line.setAttribute("x1", a.x);
    line.setAttribute("y1", a.y);
    line.setAttribute("x2", b.x);
    line.setAttribute("y2", b.y);
    line.setAttribute("class", "atlas-link");
    line.setAttribute(
      "stroke-width",
      String(0.8 + Math.max(0, Math.min(1, link.similarity ?? 0.5)) * 1.5),
    );
    if (selected && sourceIds.has(link.source) && sourceIds.has(link.target))
      line.classList.add("is-related");
    else if (selected) line.classList.add("is-dimmed");
    svg.append(line);
  }
  for (const node of nodes) {
    const point = positions.get(node.id);
    if (!point) continue;
    const group = document.createElementNS(svg.namespaceURI, "g");
    group.setAttribute("class", "atlas-node");
    group.dataset.nodeId = node.id;
    if (selected && sourceIds.has(node.id)) group.classList.add("is-selected");
    if (selected && !sourceIds.has(node.id)) group.classList.add("is-dimmed");
    const circle = document.createElementNS(svg.namespaceURI, "circle");
    circle.setAttribute("cx", point.x);
    circle.setAttribute("cy", point.y);
    circle.setAttribute("r", selected && sourceIds.has(node.id) ? "9" : "7");
    circle.setAttribute("fill", colourByNode(node));
    const label = document.createElementNS(svg.namespaceURI, "text");
    label.setAttribute("x", point.x);
    label.setAttribute("y", point.y - 12);
    label.setAttribute("text-anchor", "middle");
    label.textContent = number(node.id);
    label.setAttribute("font-size", "12");
    group.append(circle, label);
    svg.append(group);
  }
  graphPanel.append(svg);

  const reading = el("aside", undefined, "atlas-reading");
  reading.setAttribute("aria-live", "polite");
  if (selected) {
    reading.append(el("h2", selected.title));
    reading.append(el("p", selected.text, "atlas-finding-text"));
    const sourceCount = nodes.filter((node) => sourceIds.has(node.id)).length;
    const sourceLabel = el(
      "p",
      `${sourceCount} supporting contributions`,
      "atlas-source-count",
    );
    reading.append(sourceLabel);
  } else {
    reading.append(el("h2", "Contributions"));
  }
  const pageSize = 3;
  const pages = Math.max(
    1,
    Math.ceil(
      (selected
        ? nodes.filter((node) => sourceIds.has(node.id)).length
        : nodes.length) / pageSize,
    ),
  );
  const page = Math.max(
    0,
    Math.min(pages - 1, Number.isInteger(view.page) ? view.page : 0),
  );
  const relevant = selected
    ? nodes.filter((node) => sourceIds.has(node.id))
    : nodes;
  for (const node of relevant.slice(page * pageSize, (page + 1) * pageSize)) {
    const article = el("article", undefined, "atlas-contribution");
    const meta = el("p", number(node.id), "atlas-contribution-meta");
    meta.style.setProperty("--finding-colour", colourByNode(node));
    const fullText = String(node.text ?? "");
    const excerpt =
      fullText.length > EXCERPT_LIMIT
        ? `${fullText.slice(0, EXCERPT_LIMIT).trimEnd()}…`
        : fullText;
    article.append(meta, el("blockquote", `“${excerpt}”`));
    reading.append(article);
  }
  if (
    relevant
      .slice(page * pageSize, (page + 1) * pageSize)
      .some((node) => String(node.text ?? "").length > EXCERPT_LIMIT)
  )
    reading.append(
      el(
        "p",
        "Long contributions are excerpted here; the operator can review the full text.",
        "atlas-excerpt-note",
      ),
    );
  const paging = el(
    "p",
    `${Math.min(relevant.length, page * pageSize + 1)}–${Math.min(relevant.length, (page + 1) * pageSize)} / ${relevant.length}`,
    "atlas-page",
  );
  reading.append(paging);
  stage.append(graphPanel, reading);
  wrapper.append(stage);

  const key = el("div", undefined, "atlas-finding-key");
  key.setAttribute("aria-label", "Analysis findings");
  findings.forEach((finding) => {
    const item = el("div", undefined, "atlas-key-item");
    if (selected === finding) item.setAttribute("aria-current", "true");
    const swatch = el("span", undefined, "atlas-swatch");
    swatch.setAttribute("aria-hidden", "true");
    const colours = [
      ...new Set(
        finding.sourceRefs.map((ref) =>
          neighbourhoodColour(neighbourhoods.get(ref)),
        ),
      ),
    ];
    swatch.style.background =
      colours.length > 1
        ? `linear-gradient(to right, ${colours.map((colour, index) => `${colour} ${(index * 100) / colours.length}% ${((index + 1) * 100) / colours.length}%`).join(", ")})`
        : (colours[0] ?? "#99998f");
    item.append(swatch, el("span", finding.title));
    key.append(item);
  });
  wrapper.append(key);
  const resizeLabels = () => {
    const scale = svg.getBoundingClientRect().width / 1000;
    if (scale > 0) {
      const fontSize = 12 / scale;
      const visibleIds = new Set(
        scale < 0.65
          ? relevant
              .slice(page * pageSize, (page + 1) * pageSize)
              .map((node) => node.id)
          : nodes.map((node) => node.id),
      );
      svg.querySelectorAll(".atlas-node").forEach((group) => {
        const label = group.querySelector("text");
        label.setAttribute("font-size", String(fontSize));
        label.classList.toggle(
          "is-hidden",
          !visibleIds.has(group.dataset.nodeId),
        );
      });
      svg.querySelectorAll(".atlas-node circle").forEach((circle) => {
        const highlighted =
          circle.parentElement.classList.contains("is-selected");
        circle.setAttribute("r", String((highlighted ? 9 : 7) / scale));
      });
    }
  };
  requestAnimationFrame(resizeLabels);
  const observer = new ResizeObserver(resizeLabels);
  observer.observe(graphPanel);
  wrapper.dispose = () => observer.disconnect();
  return wrapper;
}
