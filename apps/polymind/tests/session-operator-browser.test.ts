import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

// Execute the shipped browser script: scope must survive sign-in, and a stale
// link must never fall back to a different session's controls.
async function operator(search: string, signedIn = true) {
  type Control = {
    value: string;
    hidden: boolean;
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
        : { error: "Synthetic state unavailable" };
    return {
      ok: signedIn && !path.startsWith("/api/operator/state"),
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
