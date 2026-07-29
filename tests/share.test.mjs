import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [html, manifest, viteConfig] = await Promise.all([
  readFile(new URL("../share/index.html", import.meta.url), "utf8"),
  readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
  readFile(new URL("../vite.share.config.ts", import.meta.url), "utf8"),
]);

test("the public share shell stays portable on a repository subpath", () => {
  assert.match(viteConfig, /base:\s*["']\.\/["']/);
  assert.match(html, /data-runtime="static"/);
  assert.match(html, /href="\.\/manifest\.webmanifest"/);
  assert.match(html, /href="\.\/favicon\.png"/);
  assert.doesNotMatch(html, /chatgpt\.site|wechat-jock/);
});

test("the install manifest uses repository-relative navigation", () => {
  const parsed = JSON.parse(manifest);
  assert.equal(parsed.start_url, "./");
  assert.equal(parsed.scope, "./");
  assert.equal(parsed.display, "standalone");
  assert.ok(parsed.icons.some((icon) => icon.src === "./favicon.png"));
});
