import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

type Element = {
  value: string;
  textContent: string;
  hidden: boolean;
  disabled: boolean;
  checked: boolean;
  src: string;
  dataset: Record<string, string>;
  onclick?: (...args: never[]) => unknown;
  onchange?: (...args: never[]) => unknown;
  onsubmit?: (event: { preventDefault(): void }) => unknown;
  addEventListener(name: string, callback: (...args: never[]) => unknown): void;
  listeners: Map<string, (...args: never[]) => unknown>;
  append(...children: Element[]): void;
  replaceChildren(): void;
};
type Fetch = (
  url: string,
  options?: { method?: string; body?: unknown },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function response(value: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => value,
  };
}

const initialState = (
  contribution = { revision: 0, text: "", confirmed: false, matching: false },
) => ({
  session: { id: "session-1", title: "A gathering", open: true },
  round: {
    id: "round-1",
    prompt: "What matters?",
    mode: "bounded",
    open: true,
  },
  participant: { id: "participant-1", name: "Jo", badge: "001" },
  contribution,
  encounters: [],
  voice: null,
  hubUrl: "https://we.supercollective.io",
  capture: {
    enabled: true,
    provider: "Test",
    model: "fake",
    retention: "Test retention.",
  },
});

async function browser(
  fetch: Fetch,
  savedDraft?: unknown,
  sharedStorage = new Map<string, string>(),
) {
  const elements = new Map<string, Element>();
  const makeElement = (): Element => ({
    value: "",
    textContent: "",
    hidden: false,
    disabled: false,
    checked: false,
    src: "",
    dataset: {},
    listeners: new Map(),
    addEventListener(name, callback) {
      this.listeners.set(name, callback);
    },
    append() {},
    replaceChildren() {},
  });
  const get = (id: string) => {
    let element = elements.get(id);
    if (!element) {
      element = makeElement();
      elements.set(id, element);
    }
    return element;
  };
  const local = sharedStorage;
  get("capture").hidden = true;
  if (savedDraft)
    local.set(
      "polymind:session-1:participant-1:round-1",
      JSON.stringify(savedDraft),
    );
  const timers = new Map<number, { delay: number; callback: () => unknown }>();
  const intervals: (() => unknown)[] = [];
  let timerId = 0;
  let uuid = 0;
  class FakeMediaRecorder {
    static isTypeSupported() {
      return true;
    }
    state = "inactive";
    ondataavailable?: (event: { data: Blob }) => void;
    onstop?: () => void;
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.onstop?.();
    }
  }
  const FakeURL = class extends URL {};
  Object.assign(FakeURL, {
    createObjectURL: () => "blob:session-test",
    revokeObjectURL: () => undefined,
  });
  const stream = { getTracks: () => [{ stop: () => undefined }] };
  const context = {
    document: {
      getElementById: get,
      createElement: makeElement,
    },
    location: { href: "https://polymind.test/?session=session-1" },
    localStorage: {
      getItem: (key: string) => local.get(key) ?? null,
      setItem: (key: string, value: string) => local.set(key, value),
      removeItem: (key: string) => local.delete(key),
    },
    navigator: {
      mediaDevices: { getUserMedia: () => Promise.resolve(stream) },
    },
    window: {
      MediaRecorder: FakeMediaRecorder,
      addEventListener: () => undefined,
    },
    MediaRecorder: FakeMediaRecorder,
    URL: FakeURL,
    Blob,
    Date,
    crypto: { randomUUID: () => `request-${++uuid}` },
    fetch,
    setTimeout: (callback: () => unknown, delay: number) => {
      const id = ++timerId;
      timers.set(id, { delay, callback });
      return id;
    },
    clearTimeout: (id: number) => timers.delete(id),
    setInterval: (callback: () => unknown) => {
      intervals.push(callback);
      return intervals.length;
    },
    clearInterval: () => undefined,
  };
  const source = await readFile("src/web/session.js", "utf8");
  runInNewContext(`(() => {${source}\n})()`, context);
  await vi.waitFor(() => {
    expect(get("capture").hidden).toBe(false);
    expect(get("prompt").textContent).toBe("What matters?");
  });
  return {
    get,
    local,
    scheduledDelays: () => [...timers.values()].map((timer) => timer.delay),
    async runTimer(delay: number) {
      let found:
        | [number, { delay: number; callback: () => unknown }]
        | undefined;
      await vi.waitFor(() => {
        found = [...timers.entries()].find(
          ([, timer]) => timer.delay === delay,
        );
        expect(found).toBeDefined();
      });
      if (!found) throw new Error(`No timer scheduled for ${delay} ms.`);
      const [timerId, timer] = found;
      timers.delete(timerId);
      timer.callback();
      await Promise.resolve();
      await Promise.resolve();
    },
    async refresh() {
      await intervals[0]?.();
    },
  };
}

it("autosaves bounded contributions into matching and preserves the latest edit", async () => {
  const first = deferred<ReturnType<typeof response>>();
  const requests: Record<string, unknown>[] = [];
  let state = initialState();
  const page = await browser(async (url, options) => {
    if (url.startsWith("/api/state")) return response(state);
    const payload = JSON.parse(String(options?.body)) as Record<
      string,
      unknown
    >;
    requests.push(payload);
    if (requests.length === 1) return first.promise;
    const saved = {
      ...payload,
      revision: Number(payload.expectedRevision) + 1,
      text: String(payload.text ?? ""),
      confirmed: Boolean(payload.confirmed),
      matching: Boolean(payload.matching),
      savedAt: "now",
    };
    state = initialState(saved);
    return response(saved);
  });

  page.get("text").value = "First draft";
  page.get("text").listeners.get("input")?.();
  await page.runTimer(500);
  await vi.waitFor(() => expect(requests).toHaveLength(1));
  page.get("text").value = "Latest text";
  page.get("text").listeners.get("input")?.();
  first.resolve(response({ ...requests[0], revision: 1, savedAt: "now" }));
  await page.runTimer(20);
  await vi.waitFor(() => expect(requests).toHaveLength(2));
  expect(requests[1]).toMatchObject({
    expectedRevision: 1,
    text: "Latest text",
    confirmed: true,
    matching: true,
  });
  await vi.waitFor(() => expect(page.get("saved").textContent).toBe("Saved"));
  expect(page.local.has("polymind:session-1:participant-1:round-1")).toBe(
    false,
  );

  const reloaded = await browser(
    async (url) => {
      if (url.startsWith("/api/state")) return response(state);
      throw new Error(`Unexpected request ${url}`);
    },
    undefined,
    page.local,
  );
  expect(reloaded.get("text").value).toBe("Latest text");
});

it("retries the same saved request after a connection error", async () => {
  const requests: Record<string, unknown>[] = [];
  let state = initialState();
  const page = await browser(async (url, options) => {
    if (url.startsWith("/api/state")) return response(state);
    const payload = JSON.parse(String(options?.body)) as Record<
      string,
      unknown
    >;
    requests.push(payload);
    if (requests.length === 1) {
      state = initialState({
        ...payload,
        revision: 1,
        text: String(payload.text ?? ""),
        confirmed: Boolean(payload.confirmed),
        matching: Boolean(payload.matching),
      });
      throw new TypeError("Network disconnected after saving.");
    }
    const saved = {
      ...payload,
      revision: 1,
      text: String(payload.text ?? ""),
      confirmed: Boolean(payload.confirmed),
      matching: Boolean(payload.matching),
    };
    state = initialState(saved);
    return response(saved);
  });
  page.get("text").value = "A contribution";
  page.get("text").listeners.get("input")?.();
  await page.runTimer(500);
  await vi.waitFor(() =>
    expect(page.get("status").textContent).toContain("Reconnecting"),
  );
  await page.refresh();
  await vi.waitFor(() => expect(requests).toHaveLength(2));
  expect(requests[1]).toEqual(requests[0]);
  await vi.waitFor(() => expect(page.get("saved").textContent).toBe("Saved"));
});

it("shows a competing contribution and lets the participant keep either version", async () => {
  const requests: Record<string, unknown>[] = [];
  const remote = {
    revision: 2,
    text: "The other window's latest text",
    confirmed: true,
    matching: true,
  };
  const page = await browser(
    async (url, options) => {
      if (url.startsWith("/api/state")) return response(initialState(remote));
      const payload = JSON.parse(String(options?.body)) as Record<
        string,
        unknown
      >;
      requests.push(payload);
      return response(
        { error: "This contribution changed in another window." },
        409,
      );
    },
    {
      text: "My local text",
      pending: {
        requestId: "old-request",
        roundId: "round-1",
        expectedRevision: 1,
        text: "My local text",
        confirmed: true,
        matching: true,
        source: "typed",
      },
    },
  );
  await page.runTimer(20);
  await vi.waitFor(() => expect(page.get("conflict").hidden).toBe(false));
  expect(page.get("conflict-text").textContent).toContain(remote.text);
  expect(page.get("text").value).toBe("My local text");
  expect(requests).toHaveLength(1);
  page.get("keep-saved").onclick?.();
  expect(page.get("text").value).toBe(remote.text);
  expect(page.get("conflict").hidden).toBe(true);
  expect(page.get("saved").textContent).toBe("Saved");
});

it("binds transcript polling and upload to the captured recording job", async () => {
  const source = await readFile("src/web/session.js", "utf8");
  expect(source).toContain("async function pollRecording(job)");
  expect(source).toContain("const job = {\n    id: recordingId");
  expect(source).toContain("await api(`/api/recordings/" + "$" + "{job.id}`)");
  expect(source).toContain(
    'if (!isCurrentRecording(job)) return;\n    $("record-status").textContent =\n      item.state === "succeeded" ? "Transcript ready." : item.state;',
  );
  expect(source).toContain(
    "if (isCurrentRecording(job)) await pollRecording(job);",
  );
});

it("clears only transient reconnect status after a successful refresh", async () => {
  let fail = false;
  const page = await browser(async (url) => {
    if (url.startsWith("/api/state")) {
      if (fail) throw new TypeError("Network is offline.");
      return response(initialState());
    }
    return response({ ok: true });
  });
  fail = true;
  await page.refresh();
  expect(page.get("status").textContent).toContain("Reconnecting");
  fail = false;
  await page.refresh();
  expect(page.get("status").textContent).toBe("Connection restored.");

  page.get("help-reason").value = "A question";
  await page.get("help").onclick?.();
  expect(page.get("status").textContent).toBe("Request sent to the organiser.");
  await page.refresh();
  expect(page.get("status").textContent).toBe("Request sent to the organiser.");
});

it("saves bounded text to matching and removes both choices from the page", async () => {
  let state = initialState();
  const requests: Record<string, unknown>[] = [];
  const page = await browser(async (url, options) => {
    if (url.startsWith("/api/state")) return response(state);
    const payload = JSON.parse(String(options?.body));
    requests.push(payload);
    const saved = { ...payload, revision: payload.expectedRevision + 1 };
    state = initialState(saved);
    return response(saved);
  });
  expect(page.get("confirm").disabled).toBe(false);
  page.get("text").value = "Included automatically";
  page.get("text").listeners.get("input")?.();
  await page.runTimer(500);
  await vi.waitFor(() => expect(page.get("saved").textContent).toBe("Saved"));
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    text: "Included automatically",
    confirmed: true,
    matching: true,
  });
});

it("sends continuous text to the voice without bounded confirmation", async () => {
  const bounded = initialState();
  let state = { ...bounded, round: { ...bounded.round, mode: "continuous" } };
  const requests: Record<string, unknown>[] = [];
  const page = await browser(async (url, options) => {
    if (url.startsWith("/api/state")) return response(state);
    const payload = JSON.parse(String(options?.body));
    requests.push(payload);
    return response({ ...payload, revision: 1 });
  });
  expect(page.get("participation-notice").hidden).toBe(false);
  expect(page.get("participation-notice").textContent).toContain(
    "saved text goes to the selected model",
  );
  page.get("text").value = "Voice input";
  page.get("text").listeners.get("input")?.();
  await page.runTimer(500);
  await vi.waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0]).toMatchObject({
    text: "Voice input",
    confirmed: false,
    matching: false,
  });
  state = bounded;
  await page.refresh();
  expect(page.get("participation-notice").hidden).toBe(false);
  expect(page.get("participation-notice").textContent).toContain(
    "Saved writing is included",
  );
});

it("does not include an empty bounded contribution", async () => {
  const requests: Record<string, unknown>[] = [];
  const page = await browser(async (url, options) => {
    if (url.startsWith("/api/state")) return response(initialState());
    requests.push(JSON.parse(String(options?.body)));
    return response({ revision: 1 });
  });
  page.get("text").value = "   ";
  page.get("text").listeners.get("input")?.();
  await page.runTimer(500);
  await vi.waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0]).toMatchObject({
    text: "   ",
    confirmed: false,
    matching: false,
  });
});

it("isolates retained drafts and discards late saves and recordings when identity changes", async () => {
  const first = deferred<ReturnType<typeof response>>();
  let state = initialState();
  const requests: Record<string, unknown>[] = [];
  const page = await browser(async (url, options) => {
    if (url.startsWith("/api/state")) return response(state);
    const sent = JSON.parse(String(options?.body));
    requests.push(sent);
    if (requests.length === 1) return first.promise;
    return response({ ...sent, revision: 1 });
  });
  page.get("text").value = "Synthetic draft for A";
  page.get("text").listeners.get("input")?.();
  await page.get("record").onclick?.();
  await page.runTimer(500);
  const saving = Promise.resolve();
  state = {
    ...initialState(),
    participant: { id: "participant-2", name: "B", badge: "002" },
  };
  await page.refresh();
  expect(page.get("text").value).toBe("");
  expect(page.get("playback").hidden).toBe(true);
  expect(page.get("transcribe").hidden).toBe(true);
  expect(page.get("stop").hidden).toBe(true);
  first.resolve(response({ ...requests[0], revision: 1 }));
  await saving;
  expect(page.get("text").value).toBe("");
  page.get("text").value = "Synthetic draft for B";
  page.get("text").listeners.get("input")?.();
  await page.runTimer(500);
  expect(requests[1]).toMatchObject({
    text: "Synthetic draft for B",
    expectedRevision: 0,
    source: "typed",
  });
  state = initialState();
  await page.refresh();
  expect(page.get("text").value).toBe("Synthetic draft for A");
});

it("does not restore legacy drafts without an owner", async () => {
  const local = new Map([
    [
      "polymind:session-1:round-1",
      JSON.stringify({ text: "Unowned synthetic draft" }),
    ],
  ]);
  const page = await browser(
    async () => response(initialState()),
    undefined,
    local,
  );
  expect(page.get("text").value).toBe("");
});

it("only offers partner-specific assistance after an encounter is released", async () => {
  let state = { ...initialState(), encounters: [] as object[] };
  const page = await browser(async () => response(state));
  expect(page.get("help-absent").hidden).toBe(true);
  expect(page.get("help-decline").disabled).toBe(true);
  expect(page.get("matches-title").hidden).toBe(true);
  state = {
    ...state,
    encounters: [
      { partners: [], location: "Zone A", invitation: "Discuss the question." },
    ],
  };
  await page.refresh();
  expect(page.get("help-absent").hidden).toBe(false);
  expect(page.get("help-decline").disabled).toBe(false);
  expect(page.get("matches-title").hidden).toBe(false);
});

it("keeps a previous voice off the phone during bounded writing and analysis", async () => {
  let state = {
    ...initialState(),
    voice: { text: "Earlier voice" },
    show: { presentation: "writing" },
  };
  const page = await browser(async () => response(state));
  expect(page.get("collective").hidden).toBe(true);
  state = { ...state, show: { presentation: "analysis" } };
  await page.refresh();
  expect(page.get("collective").hidden).toBe(true);
  state = { ...state, show: { presentation: "voice" } };
  await page.refresh();
  expect(page.get("collective").hidden).toBe(false);
});

it("retains and labels unsaved text excluded when the operator closes writing", async () => {
  let state = initialState({
    revision: 1,
    text: "Saved version",
    confirmed: true,
    matching: true,
  });
  const page = await browser(async () => response(state));
  page.get("text").value = "New local version";
  page.get("text").listeners.get("input")?.();
  state = { ...state, round: { ...state.round, open: false } };
  await page.refresh();
  expect(page.get("capture").hidden).toBe(true);
  expect(page.get("closed-writing").hidden).toBe(false);
  expect(page.get("frozen-writing").textContent).toBe("Saved version");
  expect(page.get("excluded-draft").hidden).toBe(false);
  expect(page.get("excluded-text").textContent).toBe("New local version");
  expect(page.local.get("polymind:session-1:participant-1:round-1")).toContain(
    "New local version",
  );
});
