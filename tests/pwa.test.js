import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("PWA manifest, icons, and offline shell are complete", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("manifest.webmanifest", root), "utf8")
  );
  const serviceWorker = await readFile(new URL("sw.js", root), "utf8");

  assert.equal(manifest.name, "VT ImageMaker");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.icons.some(icon => icon.sizes === "192x192"), true);
  assert.equal(manifest.icons.some(icon => icon.sizes === "512x512"), true);
  assert.equal(manifest.icons.some(icon => icon.purpose === "maskable"), true);

  const shellMatch = serviceWorker.match(/const APP_SHELL = (\[[\s\S]*?\]);/);
  assert.ok(shellMatch, "Service Worker cache list is missing");
  const appShell = JSON.parse(shellMatch[1]);
  for (const relativePath of appShell) {
    if (relativePath === "./") continue;
    await access(new URL(relativePath.replace(/^\.\//, ""), root));
  }

  for (const icon of manifest.icons) {
    const bytes = await readFile(new URL(icon.src.replace(/^\.\//, ""), root));
    const size = Number(icon.sizes.split("x")[0]);
    assert.equal(bytes.toString("ascii", 1, 4), "PNG");
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }

  assert.match(serviceWorker, /ignoreSearch: true/);
  assert.match(serviceWorker, /request\.mode === "navigate"/);
  assert.match(serviceWorker, /SKIP_WAITING/);
});
