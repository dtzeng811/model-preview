import { createReadStream } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";

const FIXTURES = join(process.cwd(), "fixtures");
const upload = (name: string, extra: Record<string, string> = {}) => ({
  multipart: { file: createReadStream(join(FIXTURES, name)), ...extra },
});

for (const name of ["cube.glb", "cube.stl", "cube.ply", "cube-obj.zip"]) {
  test(`渲染 ${name} 返回四张非空透明底图`, async ({ request }) => {
    const res = await request.post("/render", upload(name));
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.model.triangles).toBe(12);
    expect(body.images.map((i: { view: string }) => i.view)).toEqual([
      "front", "back", "left", "right",
    ]);
    for (const img of body.images) {
      const png = PNG.sync.read(Buffer.from(img.data, "base64"));
      expect(png.width).toBe(1024);
      const i = (png.width * (png.height >> 1) + (png.width >> 1)) * 4;
      expect(png.data[i + 3]).toBeGreaterThan(200);
      expect(png.data[i] + png.data[i + 1] + png.data[i + 2]).toBeGreaterThan(30);
      const corners = [
        0,
        (png.width - 1) * 4,
        png.width * (png.height - 1) * 4,
        (png.width * png.height - 1) * 4,
      ];
      for (const c of corners) expect(png.data[c + 3]).toBe(0);
    }
  });
}

test("size=512 与纯色背景生效", async ({ request }) => {
  const res = await request.post("/render", upload("cube.glb", { size: "512", background: "#ff0000" }));
  const body = await res.json();
  const png = PNG.sync.read(Buffer.from(body.images[0].data, "base64"));
  expect(png.width).toBe(512);
  expect(png.data[0]).toBeGreaterThan(150);
  expect(png.data[3]).toBe(255);
});

// 模型导入时未必摆正：用户在查看器里转好角度，那个朝向即「正面」，四视图绕它出。
// cube.ply 带逐顶点颜色，各面不同，四视图才可区分。
test("yaw 基准朝向：绕 90° 后的正面 = 默认朝向的右侧（逐像素相同）", async ({ request }) => {
  const base = await (await request.post("/render", upload("cube.ply", { size: "512" }))).json();
  const rotated = await (
    await request.post("/render", upload("cube.ply", { size: "512", yaw: "90" }))
  ).json();
  const byView = (b: { images: { view: string; data: string }[] }, v: string) =>
    b.images.find((i) => i.view === v)!.data;
  // 同一机位（az=90, el=4）必然渲染出同一张图
  expect(byView(rotated, "front")).toBe(byView(base, "right"));
  // 且确实转过了：转后的正面不等于原正面
  expect(byView(rotated, "front")).not.toBe(byView(base, "front"));
});

test("pitch 基准仰角改变出图", async ({ request }) => {
  const flat = await (await request.post("/render", upload("cube.ply", { size: "512" }))).json();
  const tilted = await (
    await request.post("/render", upload("cube.ply", { size: "512", pitch: "60" }))
  ).json();
  expect(tilted.images[0].data).not.toBe(flat.images[0].data);
});

test("非法参数返回 400", async ({ request }) => {
  const res = await request.post("/render", upload("cube.glb", { size: "999" }));
  expect(res.status()).toBe(400);
});

test("非法 yaw 返回 400", async ({ request }) => {
  const res = await request.post("/render", upload("cube.glb", { yaw: "abc" }));
  expect(res.status()).toBe(400);
});

test("不支持的格式返回 400", async ({ request }) => {
  const res = await request.post("/render", upload("cube.mtl"));
  expect(res.status()).toBe(400);
});

test("损坏的 glb 返回 422", async ({ request }) => {
  const res = await request.post("/render", {
    multipart: { file: { name: "bad.glb", mimeType: "model/gltf-binary", buffer: Buffer.from("not a glb") } },
  });
  expect(res.status()).toBe(422);
});

test("healthz", async ({ request }) => {
  expect((await request.get("/healthz")).status()).toBe(200);
});
