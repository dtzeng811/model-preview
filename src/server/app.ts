import { createWriteStream, mkdirSync, rmSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import { validateOptions } from "../render-core/options";
import { HttpError } from "./errors";
import { prepareModel } from "./upload";
import type { RenderPool } from "./render-pool";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const TMP = join(ROOT, "tmp");
const MAX_FILE_SIZE = 500 * 1024 * 1024;

export function buildApp(pool: RenderPool, port: number) {
  const app = Fastify({ bodyLimit: MAX_FILE_SIZE, logger: true });
  app.register(multipart, { limits: { fileSize: MAX_FILE_SIZE, files: 1 } });
  app.register(fastifyStatic, { root: join(ROOT, "dist/client"), prefix: "/" });
  app.register(fastifyStatic, { root: TMP, prefix: "/__models/", decorateReply: false });

  app.get("/healthz", async (_req, reply) => {
    if (!pool.ready) return reply.status(503).send({ ok: false });
    return { ok: true };
  });

  app.post("/render", async (req, reply) => {
    if (!req.isMultipart()) throw new HttpError(415, "请以 multipart/form-data 上传文件");
    const part = await req.file();
    if (!part) throw new HttpError(400, "缺少文件");

    const id = randomUUID();
    const workDir = join(TMP, id);
    mkdirSync(workDir, { recursive: true });
    try {
      const uploaded = join(workDir, "upload.bin");
      await pipeline(part.file, createWriteStream(uploaded)); // 流式落盘，不整读内存
      if (part.file.truncated) throw new HttpError(413, "文件超过 500MB 上限");

      const fields = Object.fromEntries(
        Object.entries(part.fields).map(([k, v]) => [k, (v as { value?: string })?.value])
      ) as Record<string, string | undefined>;
      let options;
      try {
        options = validateOptions(fields);
      } catch (e) {
        throw new HttpError(400, (e as Error).message);
      }

      const model = await prepareModel(uploaded, part.filename, workDir);
      const base = `http://127.0.0.1:${port}/__models/${id}/model`;
      const result = await pool.render(
        {
          url: `${base}/${model.entryRel}`,
          ext: model.ext,
          mtlUrl: model.mtlRel ? `${base}/${model.mtlRel}` : undefined,
        },
        options
      );
      return {
        model: { format: model.ext, ...result.info },
        images: result.images,
      };
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }
  });

  app.setErrorHandler((err: Error, req, reply) => {
    const status =
      err instanceof HttpError ? err.statusCode
      : (err as { statusCode?: number }).statusCode === 413 ? 413
      : 500;
    if (status >= 500) {
      req.log.error({ err }, "render request failed");
      reply.status(status).send({ error: "服务器内部错误" });
      return;
    }
    // 4xx/5xx-known：回传消息，但抹掉可能内嵌的内部 URL（如 loader 报错里的 __models 链接）
    const safe = err.message.replace(/https?:\/\/\S+/g, "<model>");
    reply.status(status).send({ error: safe });
  });

  return app;
}
