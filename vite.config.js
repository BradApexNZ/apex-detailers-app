import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0"
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), "index.html"),
        hq: resolve(process.cwd(), "hq.html"),
        booking: resolve(process.cwd(), "booking.html"),
        dataTools: resolve(process.cwd(), "data-tools.html"),
        marketing: resolve(process.cwd(), "marketing.html")
      }
    }
  }
});
