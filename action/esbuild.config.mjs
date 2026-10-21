import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));

await esbuild.build({
  entryPoints: [path.join(dir, "src/index.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  outfile: path.join(dir, "dist/index.js"),
  sourcemap: true,
  legalComments: "none",
  plugins: [
    {
      name: "undici-slim",
      setup(build) {
        build.onResolve({ filter: /^undici$/ }, () => ({
          path: path.join(dir, "src/undici-slim.cjs"),
        }));
      },
    },
  ],
});
