import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Single-page build: index.html IS the booking page.
// (In apex-detailers-app the same page is booking.html, served at /book.)
export default defineConfig({
  plugins: [react()],
  server: { host: "0.0.0.0" }
});
