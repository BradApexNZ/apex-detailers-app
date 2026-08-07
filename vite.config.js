import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function apexHqV6ParserCompat() {
  return {
    name: "apex-hq-v6-parser-compat",
    enforce: "pre",
    transform(code, id) {
      if (!id.endsWith("/src/hq-v6.jsx")) return null;
      return code.replace(
        'String(j.status||"").replace(/\\W+/g,"-").toLowerCase()',
        'String(j.status||"").trim().toLowerCase().split(" ").filter(Boolean).join("-")'
      );
    }
  };
}

export default defineConfig({
  plugins: [apexHqV6ParserCompat(), react()],
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
