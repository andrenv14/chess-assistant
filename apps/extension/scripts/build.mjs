import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await build({
  absWorkingDir: root,
  entryPoints: ["background", "content", "popup"].map((name) =>
    path.join(root, "src", `${name}.ts`)),
  bundle: true,
  outdir: output,
  format: "esm",
  target: "chrome120",
  sourcemap: true,
});

await Promise.all([
  cp(path.join(root, "manifest.json"), path.join(output, "manifest.json")),
  cp(path.join(root, "popup.html"), path.join(output, "popup.html")),
]);
