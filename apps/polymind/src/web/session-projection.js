const session = new URL(location.href).searchParams.get("session");
let slides = [],
  index = 0,
  signature = "";
function render() {
  const slide = slides[index];
  document.getElementById("category").textContent =
    slide?.category ?? "Rehearsing We";
  document.getElementById("idea").textContent =
    slide?.text ?? "Listening for what we could change together.";
  document.getElementById("legend").textContent = slide
    ? `${index + 1} / ${slides.length} · ${slide.category === "Collective Microphone" ? "Developing collective voice" : "An interpretation of the contributions, open to disagreement"}`
    : "";
}
document.getElementById("next").onclick = () => {
  index = (index + 1) % Math.max(1, slides.length);
  render();
};
document.getElementById("previous").onclick = () => {
  index = (index - 1 + slides.length) % Math.max(1, slides.length);
  render();
};
async function refresh() {
  try {
    const response = await fetch(`/api/projection?session=${session}`);
    if (!response.ok) return;
    const state = await response.json();
    document.getElementById("title").textContent = state.title;
    const next = [];
    for (const op of state.results) {
      if (op.kind === "voice") {
        for (const text of op.result.text.match(/.{1,320}(?:\s|$)/gs) ?? [
          op.result.text,
        ])
          next.push({ category: "Collective voice", text });
      } else
        for (const [category, findings] of Object.entries(op.result))
          for (const finding of findings)
            next.push({
              category: category.replace(/([A-Z])/g, " $1"),
              text: finding.text,
            });
    }
    if (state.voice?.text)
      next.push({
        category: "Collective Microphone",
        text: state.voice.text.slice(-500),
      });
    const key = state.results.map((op) => op.id).join(":");
    if (signature !== key) {
      index = Math.max(0, next.length - 1);
      signature = key;
    }
    slides = next;
    index = Math.min(index, Math.max(0, slides.length - 1));
    render();
  } catch {
    document.getElementById("legend").textContent =
      "Connection interrupted · holding the last published view";
  }
}
void refresh();
setInterval(refresh, 1500);
