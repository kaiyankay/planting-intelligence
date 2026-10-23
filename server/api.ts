import type { Plugin, ViteDevServer, PreviewServer } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import { interpretAdjustments, interpretIntentions, llmAvailable, narrate, type LlmEnv } from "./llm.ts";

// Vite plugin that serves /api/* in both `vite` (dev) and `vite preview`.
// Keeps the API key on the server; the browser only ever sees JSON results.

function readJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

export function apiPlugin(env: LlmEnv): Plugin {
  const handler = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url ?? "";
    if (!url.startsWith("/api/")) return next();
    try {
      if (url === "/api/status") {
        return send(res, 200, {
          available: llmAvailable(env),
          model: llmAvailable(env) ? env.PI_LLM_MODEL : undefined,
          mode: llmAvailable(env) ? "llm" : "offline_demonstration",
        });
      }
      if (!llmAvailable(env)) return send(res, 503, { error: "No ANTHROPIC_API_KEY configured on the server. Running in Offline Demonstration Mode." });
      if (req.method !== "POST") return send(res, 405, { error: "POST required" });
      const body = await readJson(req);
      if (url === "/api/interpret") return send(res, 200, await interpretIntentions(env, body.stakeholders ?? []));
      if (url === "/api/adjust") return send(res, 200, await interpretAdjustments(env, body.feedback ?? "", body.strategySummary ?? "", body.plants ?? []));
      if (url === "/api/narrate") return send(res, 200, { text: await narrate(env, body.facts ?? "", body.instruction ?? ""), model: env.PI_LLM_MODEL });
      return send(res, 404, { error: "Unknown endpoint" });
    } catch (e: any) {
      const message = e?.message ?? String(e);
      // Never leak the key or raw headers; message only.
      return send(res, 500, { error: message });
    }
  };
  return {
    name: "planting-intelligence-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use(handler);
    },
  };
}
