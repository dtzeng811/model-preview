import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: r("src/web"),
  publicDir: false,
  build: {
    outDir: r("dist/client"),
    emptyOutDir: true,
    rollupOptions: {
      input: { index: r("src/web/index.html"), render: r("src/web/render.html") },
    },
  },
});
