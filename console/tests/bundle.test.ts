import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const consoleRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const wranglerCli = join(consoleRoot, "node_modules", "wrangler", "bin", "wrangler.js");

test("Wrangler bundle keeps the serialized browser client free of external helpers", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "agentpass-console-bundle-"));
  const outputDirectory = join(temporaryRoot, "dist");
  const result = spawnSync(
    process.execPath,
    [wranglerCli, "deploy", "--env=", "--dry-run", "--outdir", outputDirectory],
    {
      cwd: consoleRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        WRANGLER_LOG_PATH: join(temporaryRoot, "wrangler.log"),
      },
    },
  );

  try {
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const bundleName = readdirSync(outputDirectory).find((name) => name.endsWith(".js"));
    assert.ok(bundleName, "Wrangler did not emit a JavaScript Worker bundle.");
    const bundle = readFileSync(join(outputDirectory, bundleName), "utf8");
    const functionStart = bundle.indexOf("function consoleApp(");
    const functionEnd = bundle.indexOf("\nvar APP_JS =", functionStart);
    assert.ok(functionStart >= 0, "Bundled consoleApp function was not found.");
    assert.ok(functionEnd > functionStart, "Bundled APP_JS declaration was not found.");

    const serializedFunction = bundle.slice(functionStart, functionEnd);
    const helperCalls = Array.from(
      serializedFunction.matchAll(/\b(__[A-Za-z0-9_$]+)\s*\(/g),
      (match) => match[1],
    );
    assert.deepEqual(
      [...new Set(helperCalls)],
      [],
      "The standalone browser asset would depend on bundler helpers that are not served with it.",
    );
    assert.doesNotThrow(() => new Function(`(${serializedFunction})(window);`));
  } finally {
    rmSync(temporaryRoot, { force: true, recursive: true });
  }
});
