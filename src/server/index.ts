import { buildApp } from "./app";
import { RenderPool } from "./render-pool";

const PORT = Number(process.env.PORT ?? 8790);
const pool = new RenderPool(`http://127.0.0.1:${PORT}/render.html`);
const app = buildApp(pool, PORT);

await app.listen({ port: PORT, host: "127.0.0.1" });
await pool.start(); // 先 listen 再起池：渲染页由本服务自己提供
console.log(`model-preview listening on http://127.0.0.1:${PORT}`);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    const forced = setTimeout(() => process.exit(1), 10_000);
    forced.unref();
    try {
      await app.close(); // 先排空在途请求
      await pool.stop(); // 再关浏览器
    } finally {
      process.exit(0);
    }
  });
}
