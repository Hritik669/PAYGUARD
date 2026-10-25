import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiUrl = process.env.VITE_API_URL || env.VITE_API_URL || "";
  if (process.env.RENDER === "true" && !apiUrl.startsWith("https://")) {
    throw new Error("Set VITE_API_URL to https://YOUR-API.onrender.com/api/v1 before the Render static build.");
  }
  return {
    plugins: [react(), tailwindcss()],
    server: { port: 5173, host: "localhost" },
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      globals: true,
    },
  };
});
