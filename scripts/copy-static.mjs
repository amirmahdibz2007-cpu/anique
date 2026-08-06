// scripts/copy-static.mjs — copies src/server/static → dist/server/static after tsc build
import { chmodSync, mkdirSync, readdirSync, copyFileSync } from "node:fs";

chmodSync("dist/index.js", 0o755);
mkdirSync("dist/server/static", { recursive: true });
for (const f of readdirSync("src/server/static")) {
  copyFileSync(`src/server/static/${f}`, `dist/server/static/${f}`);
}
console.log("postbuild: static files copied to dist/server/static/");
