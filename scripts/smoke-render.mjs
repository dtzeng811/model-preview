import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import puppeteer from "puppeteer";
import { PNG } from "pngjs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const app = Fastify();
app.register(fastifyStatic, { root: `${root}/dist/client`, prefix: "/" });
app.register(fastifyStatic, { root: `${root}/fixtures`, prefix: "/fixtures/", decorateReply: false });
await app.listen({ port: 0, host: "127.0.0.1" });
const port = app.server.address().port;

function centerPixel(png) {
  const i = (png.width * (png.height >> 1) + (png.width >> 1)) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
}

// 失败路径（断言抛错、evaluate 拒绝、waitForFunction 超时）必须仍能关闭
// 浏览器和服务器，否则遗留孤儿 Chromium 进程树和端口监听
let browser;
try {
  browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage();
  page.on("pageerror", (e) => { console.error("pageerror:", e); process.exitCode = 1; });
  await page.goto(`http://127.0.0.1:${port}/render.html`, { waitUntil: "networkidle0" });
  await page.waitForFunction("window.renderReady === true");

  async function renderOne(url, ext, expectTriangles) {
    const result = await page.evaluate(
      (u, x) => window.renderModel(
        { url: u, ext: x },
        { views: ["front"], size: 256, background: "transparent", format: "png" }
      ),
      url, ext
    );
    const png = PNG.sync.read(Buffer.from(result.images[0].data, "base64"));
    const [r, g, b, a] = centerPixel(png);
    if (a < 200) throw new Error(`${url}: 中心像素透明（a=${a}）——模型没渲染出来`);
    if (r + g + b < 30) throw new Error(`${url}: 中心像素接近纯黑（${r},${g},${b}）——环境光失效（黑图 bug）`);
    if (result.info.triangles !== expectTriangles)
      throw new Error(`${url}: 三角面数 ${result.info.triangles} ≠ ${expectTriangles}`);
    return { rgba: [r, g, b, a], info: result.info };
  }

  const small = await renderOne("/fixtures/cube.glb", "glb", 12);
  console.log("cube.glb OK", small);
  const large = await renderOne("/fixtures/cube-large.stl", "stl", 12);
  if (large.info.dimensions.x < 149 || large.info.dimensions.x > 151)
    throw new Error(`cube-large.stl 原始尺寸报告异常：${large.info.dimensions.x}`);
  console.log("cube-large.stl OK（150 单位模型经归一化正常出图）", large);

  console.log("smoke OK");
} finally {
  // launch 本身失败时 browser 未定义，用可选链跳过
  await browser?.close();
  await app.close();
}
