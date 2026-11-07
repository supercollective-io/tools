import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";

it("automatically retries uncertain revisions without blocking typing or losing newer edits", async () => {
  const listeners: Record<string, () => void> = {};
  const field = {
    value: "",
    disabled: true,
    addEventListener: (name: string, callback: () => void) => {
      listeners[name] = callback;
    },
  };
  const status = { textContent: "" };
  let tick: (() => Promise<void>) | undefined;
  const advance = async () => {
    await tick?.();
  };
  let current = { revision: 0, text: "" };
  const sent: { revision: number; text: string }[] = [];
  const saved = new Map<string, string>();
  let loseReply = true;
  const context = {
    document: {
      getElementById: (id: string) =>
        id === "contribution"
          ? field
          : id === "status"
            ? status
            : { textContent: "" },
    },
    localStorage: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
    },
    location: { hash: "" },
    setTimeout: (callback: () => Promise<void>) => {
      tick = callback;
    },
    fetch: async (path: string, options?: { body?: string }) => {
      if (path === "/api/state")
        return {
          ok: true,
          json: async () => ({
            runId: "test",
            status: "running",
            invitation: "An invitation",
            contribution: current,
          }),
        };
      const payload = JSON.parse(options?.body ?? "{}");
      sent.push(payload);
      current = payload;
      if (loseReply) {
        loseReply = false;
        throw new Error("Disconnected");
      }
      return { ok: true, json: async () => ({ revision: payload.revision }) };
    },
  };
  const source = await readFile("src/web/participant.js", "utf8");
  runInNewContext(`(() => {${source}\n})()`, context);
  await vi.waitFor(() => expect(tick).toBeDefined());
  field.value = "A particular concern";
  listeners.input?.();
  await advance();
  expect(field.disabled).toBe(false);
  expect(sent).toHaveLength(1);
  field.value += " that keeps developing";
  listeners.input?.();
  await advance();
  expect(sent[1]).toEqual(sent[0]);
  expect(field.value).toBe("A particular concern that keeps developing");
  await advance();
  expect(sent[2]).toEqual({ revision: 2, text: field.value });
  listeners.compositionstart?.();
  field.value += " composing";
  listeners.input?.();
  await advance();
  expect(sent).toHaveLength(3);
  listeners.compositionend?.();
  await advance();
  expect(sent).toHaveLength(4);
  // Reload keeps the complete editable contribution; it does not resend it.
  tick = undefined;
  runInNewContext(`(() => {${source}\n})()`, context);
  await vi.waitFor(() => expect(tick).toBeDefined());
  expect(field.value).toBe(current.text);
  expect(sent).toHaveLength(4);
  field.value = "";
  listeners.input?.();
  await advance();
  expect(current.text).toBe("");
});
