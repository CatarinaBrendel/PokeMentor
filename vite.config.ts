import { defineConfig } from "vite";
import path from "node:path";
import electron from "vite-plugin-electron/simple";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteStaticCopy } from "vite-plugin-static-copy";

const nativeExternals = ["better-sqlite3", "bindings", "node-gyp-build"];

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),

    electron({
      main: {
        entry: "electron/main.ts",
        vite: {
          plugins: [
            viteStaticCopy({
              targets: [
                {
                  src: "electron/db/migrations/*",
                  dest: "db/migrations",
                },
              ],
            }),
          ],
          build: {
            rollupOptions: {
              external: nativeExternals,
            },
          },
        },
      },

      preload: {
        input: path.join(__dirname, "electron/preload.ts"),
        vite: {
          build: {
            rollupOptions: {
              external: nativeExternals,
            },
          },
        },
      },

      renderer: process.env.NODE_ENV === "test" ? undefined : {},
    }),
  ],
});