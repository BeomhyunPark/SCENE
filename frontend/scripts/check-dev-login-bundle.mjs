import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const assets = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "assets");
const banned = ["Local owner", "00000000-0000-4000-8000-000000000001"];
const hits = [];
for (const name of readdirSync(assets)) {
  if (!name.endsWith(".js")) {
    continue;
  }
  const text = readFileSync(join(assets, name), "utf8");
  for (const needle of banned) {
    if (text.includes(needle)) {
      hits.push(`${name}: ${needle}`);
    }
  }
}
if (hits.length > 0) {
  console.error("dev login seed leaked into the production bundle:");
  for (const hit of hits) {
    console.error(hit);
  }
  process.exit(1);
}
