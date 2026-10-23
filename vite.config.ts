import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { apiPlugin } from "./server/api.ts";

const root = fileURLToPath(new URL(".", import.meta.url));

// The API key is read server-side only (process.env or a local .env file).
// Vite never exposes variables without the VITE_ prefix to the browser bundle.
export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, root, "");
  const env = {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? fileEnv.ANTHROPIC_API_KEY ?? "",
    PI_LLM_MODEL: process.env.PI_LLM_MODEL ?? fileEnv.PI_LLM_MODEL ?? "claude-opus-5-5",
  };
  return {
    root,
    base: "./", // relative asset paths so the static build works on GitHub Pages or any sub-path
    plugins: [react(), apiPlugin(env)],
    server: { port: 5173, strictPort: false },
    preview: { port: 5173 },
  };
});
