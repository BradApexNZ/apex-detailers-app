import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function publishApexPwaAssets() {
  return {
    name: "publish-apex-pwa-assets",
    closeBundle() {
      copyFileSync(
        resolve(process.cwd(), "assets/apex-logo-official.svg"),
        resolve(process.cwd(), "dist/apex-logo-official.svg")
      );
    }
  };
}

export default defineConfig({
  plugins: [react(), publishApexPwaAssets()],
  server: {
    host: "0.0.0.0"
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), "index.html"),
        hq: resolve(process.cwd(), "hq.html"),
        booking: resolve(process.cwd(), "booking.html"),
        dataTools: resolve(process.cwd(), "data-tools.html")
      }
    }
  }
});
