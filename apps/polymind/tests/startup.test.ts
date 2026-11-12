import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("production startup", () => {
  it.each([undefined, "", "   "])(
    "rejects a missing or blank public origin (%s) before opening data",
    (value) => {
      const directory = mkdtempSync(join(tmpdir(), "origin-startup-"));
      const dataPath = join(directory, "data");
      try {
        const env: NodeJS.ProcessEnv = {
          ...process.env,
          NODE_ENV: "production",
          DATA_DIR: dataPath,
        };
        delete env.PUBLIC_ORIGIN;
        if (value !== undefined) env.PUBLIC_ORIGIN = value;
        const result = spawnSync(process.execPath, ["src/session-cli.ts"], {
          cwd: fileURLToPath(new URL("..", import.meta.url)),
          env,
          encoding: "utf8",
          timeout: 10000,
        });
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(1);
        expect(result.stderr).toContain(
          "Set PUBLIC_ORIGIN to the public origin before starting Polymind in production.",
        );
        expect(existsSync(dataPath)).toBe(false);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );
});
