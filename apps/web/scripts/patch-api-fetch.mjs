import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.join(__dirname, "../src");

function walk(dir, acc = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      if (f === "node_modules" || f === ".git") continue;
      walk(p, acc);
    } else if (/\.(jsx|js|tsx|ts)$/.test(f)) acc.push(p);
  }
  return acc;
}

const skip = (p) =>
  p.includes("apiClient.js") ||
  p.includes("daraja") ||
  p.includes("stripe.ts") ||
  p.includes("useDevServerHeartbeat");

for (const file of walk(srcRoot)) {
  if (skip(file)) continue;
  let t = fs.readFileSync(file, "utf8");
  if (!t.includes("fetch(")) continue;
  const orig = t;
  t = t.replace(/fetch\(\s*'\/api/g, "apiFetch('/api");
  t = t.replace(/fetch\(\s*`\/api/g, "apiFetch(`/api");
  t = t.replace(/fetch\(\s*"\/api/g, 'apiFetch("/api');
  if (t === orig) continue;

  if (!t.includes("apiFetch") || t.includes("import { apiFetch }")) {
    /* already has import from partial run */
  }
  if (!/from ['"]@\/utils\/apiClient['"]/.test(t) && !/from ['"]\.\.\/.*apiClient['"]/.test(t)) {
    const firstImport = t.indexOf("import ");
    const line = "import { apiFetch } from '@/utils/apiClient';\n";
    if (firstImport === 0 || firstImport > -1) {
      t = t.slice(0, firstImport) + line + t.slice(firstImport);
    } else {
      t = line + t;
    }
  }
  fs.writeFileSync(file, t);
  console.log("patched", path.relative(srcRoot, file));
}
