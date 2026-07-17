import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";

// 构造合法的最小 glTF：几何走 data: URI（不触发 fetch），贴图指向 canary（应被拦截）
function evilGltf(canaryPort: number): Buffer {
  const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const uv = new Float32Array([0, 0, 1, 0, 0, 1]);
  const bin = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(uv.buffer)]);
  const gltf = {
    asset: { version: "2.0" },
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    textures: [{ source: 0 }],
    images: [{ uri: `http://127.0.0.1:${canaryPort}/leak.png` }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC2", min: [0, 0], max: [1, 1] },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 24 },
    ],
    buffers: [{ byteLength: 60, uri: `data:application/octet-stream;base64,${bin.toString("base64")}` }],
  };
  return Buffer.from(JSON.stringify(gltf));
}

test("模型内嵌的外部 URI 被拦截（SSRF 防护）", async ({ request }) => {
  let hits = 0;
  const canary: Server = createServer((_req, res) => { hits++; res.end("x"); });
  await new Promise<void>((r) => canary.listen(0, "127.0.0.1", r));
  const canaryPort = (canary.address() as { port: number }).port;
  try {
    const res = await request.post("/render", {
      multipart: {
        file: { name: "evil.gltf", mimeType: "model/gltf+json", buffer: evilGltf(canaryPort) },
      },
    });
    // 渲染要么成功（贴图 fetch 被拦截、模型仍出图）要么受控失败，但绝不能命中 canary
    expect([200, 422]).toContain(res.status());
    expect(hits).toBe(0);
  } finally {
    await new Promise<void>((r) => canary.close(() => r()));
  }
});
