import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Vercel serves the static dashboard from site and keeps root API functions configured", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.equal(config.framework, null);
  assert.equal(config.outputDirectory, "site");
  assert.equal(config.functions["api/*.js"].maxDuration, 30);
  assert.equal(config.functions["api/**/*.js"].maxDuration, 30);
});

test("GitHub Actions workflow validates and builds without publishing the admin dashboard to Pages", async () => {
  const workflow = await readFile(new URL("../.github/workflows/build.yml", import.meta.url), "utf8");
  assert.match(workflow, /npm test/);
  assert.match(workflow, /docker/build-push-action/);
  assert.doesNotMatch(workflow, /deploy-pages|upload-pages-artifact|pages: write/);
});
