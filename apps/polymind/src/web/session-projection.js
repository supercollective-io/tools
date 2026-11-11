const session = new URL(location.href).searchParams.get("session");
let slides = [],
  index = 0,
  signature = "";
function render() {
  const slide = slides[index];
  document.getElementById("idea").textContent = slide?.text ?? "";
}
document.addEventListener("keydown", (event) => {
  if (!["ArrowRight", "ArrowLeft"].includes(event.key)) return;
  event.preventDefault();
  index =
    (index + (event.key === "ArrowRight" ? 1 : -1) + slides.length) %
    Math.max(1, slides.length);
  render();
});
async function refresh() {
  try {
    const response = await fetch(`/api/projection?session=${session}`);
    if (!response.ok) return;
    const state = await response.json();
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
    if (state.voice?.text) {
      next.length = 0;
      next.push({
        category: "Collective Microphone",
        text: state.voice.text.slice(-500),
      });
    }
    const key = state.results.map((op) => op.id).join(":");
    if (signature !== key) {
      index = Math.max(0, next.length - 1);
      signature = key;
    }
    slides = next;
    index = Math.min(index, Math.max(0, slides.length - 1));
    render();
  } catch {
    // Hold the last published words during a connection interruption.
  }
}
void refresh();
setInterval(refresh, 1500);
