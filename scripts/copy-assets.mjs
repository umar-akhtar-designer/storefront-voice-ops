import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Copies non-TypeScript static assets (for example SQL files) into dist/ so the
 * compiled server can read them at runtime.
 */
const assets = [["src/db/schema.sql", "dist/db/schema.sql"]];

for (const [from, to] of assets) {
  if (!existsSync(from)) {
    console.warn(`copy-assets: skipping missing ${from}`);
    continue;
  }
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to);
}

console.log("copy-assets: done");
