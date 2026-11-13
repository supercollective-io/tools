import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

// Execute the shipped browser script: scope must survive sign-in, and a stale
// link must never fall back to a different session's controls.
async function operator(
  search: string,
  signedIn = true,
  preparation: unknown = null,
) {
  type Control = {
    value: string;
    hidden: boolean;
    open: boolean;
    disabled: boolean;
    textContent: string;
    dataset: Record<string, string>;
    children: unknown[];
    append(...children: unknown[]): void;
    replaceChildren(): void;
    onsubmit?: (event: { preventDefault(): void }) => Promise<void>;
    onchange?: () => void;
  };
  const make = (): Control => ({
    value: "",
    hidden: false,
    open: false,
    disabled: false,
    textContent: "",
    dataset: {},
    children: [],
    append(...children) {
      this.children.push(...children);
    },
    replaceChildren() {
      this.children = [];
    },
  });
  const elements = new Map<string, Control>();
  const get = (id: string) => {
    const existing = elements.get(id);
    if (existing) return existing;
    const control = make();
    elements.set(id, control);
    return control;
  };
  get("workspace").hidden = true;
  const location = { href: `https://polymind.test/operator${search}` };
  const fetch = vi.fn(async (path: string) => {
    if (path === "/api/login") signedIn = true;
    const value =
      path === "/api/operator/sessions"
        ? [
            { id: "first", title: "First", open: true },
            { id: "second", title: "Second", open: true },
          ]
        : path.endsWith("/preparation")
          ? preparation
          : { error: "Synthetic state unavailable" };
    return {
      ok:
        signedIn &&
        (path.endsWith("/preparation") ||
          !path.startsWith("/api/operator/state")),
      json: async () => value,
    };
  });
  runInNewContext(await readFile("src/web/session-operator.js", "utf8"), {
    URL,
    location,
    history: {
      replaceState: (_state: unknown, _title: string, url: URL) => {
        location.href = String(url);
      },
    },
    document: {
      getElementById: get,
      createElement: make,
      querySelectorAll: () => [],
    },
    fetch,
    AbortSignal: { timeout: () => "synthetic-timeout" },
    setInterval: () => 0,
  });
  await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
  return { get, fetch, location };
}

it("opens the linked session rather than the first and updates links after manual selection", async () => {
  const page = await operator("?session=second");
  await vi.waitFor(() =>
    expect(page.fetch).toHaveBeenCalledWith(
      "/api/operator/state?session=second",
      {},
    ),
  );
  expect(page.get("sessions").value).toBe("second");
  expect(page.get("workspace").hidden).toBe(false);
  page.get("sessions").value = "first";
  page.get("sessions").onchange?.();
  expect(page.location.href).toBe(
    "https://polymind.test/operator?session=first",
  );
});

it("retains the requested session across operator sign-in", async () => {
  const page = await operator("?session=second", false);
  await vi.waitFor(() =>
    expect(page.get("status").textContent).toBe("Sign in to manage sessions."),
  );
  page.get("token").value = "synthetic-token";
  await page.get("login").onsubmit?.({ preventDefault() {} });
  expect(page.get("sessions").value).toBe("second");
  expect(page.fetch).toHaveBeenCalledWith(
    "/api/operator/state?session=second",
    {},
  );
});

it.each(["missing", ""])(
  "refuses a missing linked session (%s) without fetching another session",
  async (id) => {
    const page = await operator(`?session=${id}`);
    await vi.waitFor(() =>
      expect(page.get("status").textContent).toContain(
        "linked session was not found",
      ),
    );
    expect(page.get("workspace").hidden).toBe(true);
    expect(
      page.fetch.mock.calls.some(([path]) =>
        path.startsWith("/api/operator/state"),
      ),
    ).toBe(false);
    expect(page.get("status").children).toEqual([
      expect.objectContaining({ href: "/operator" }),
    ]);
  },
);

it("keeps the ordinary first-session choice for an unscoped operator link", async () => {
  const page = await operator("");
  await vi.waitFor(() =>
    expect(page.fetch).toHaveBeenCalledWith(
      "/api/operator/state?session=first",
      {},
    ),
  );
});

it("loads continuous preparation into its controls and switches views only on selection", async () => {
  const page = await operator("?session=second", true, {
    mode: "continuous",
    prompt: "What should we keep exploring?",
    model: {
      provider: "openai",
      reasoningEffort: "low",
      model: "synthetic-model",
      maxInputCharacters: 12000,
      maxOutputTokens: 1000,
      timeoutMs: 30000,
    },
  });
  await vi.waitFor(() => {
    expect(page.get("reasoning-effort").value).toBe("low");
    expect(page.get("preparation-mode").value).toBe("continuous");
    expect(page.get("microphone-prompt").value).toBe(
      "What should we keep exploring?",
    );
    expect(page.get("writing-controls").hidden).toBe(true);
    expect(page.get("microphone-controls").hidden).toBe(false);
    expect(page.get("microphone-controls").open).toBe(true);
  });

  page.get("preparation-mode").value = "bounded";
  page.get("preparation-mode").onchange?.();
  expect(page.get("writing-controls").hidden).toBe(false);
  expect(page.get("microphone-controls").hidden).toBe(false);
  expect(page.get("microphone-controls").open).toBe(false);
  expect(
    page.fetch.mock.calls.filter(([path]) => path.endsWith("/preparation")),
  ).toHaveLength(1);
});
