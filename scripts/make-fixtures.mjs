import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { Document, NodeIO } from "@gltf-transform/core";

mkdirSync("fixtures", { recursive: true });

const FACES = [
  { n: [0, 0, 1], c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], c: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
  { n: [1, 0, 0], c: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { n: [0, 1, 0], c: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { n: [0, -1, 0], c: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
];
const positions = [], normals = [], indices = [];
FACES.forEach((f, fi) => {
  f.c.forEach((v) => { positions.push(...v); normals.push(...f.n); });
  const b = fi * 4;
  indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
});

// --- cube.glb ---
const doc = new Document();
const buffer = doc.createBuffer();
const pos = doc.createAccessor().setType("VEC3").setArray(new Float32Array(positions)).setBuffer(buffer);
const nrm = doc.createAccessor().setType("VEC3").setArray(new Float32Array(normals)).setBuffer(buffer);
const idx = doc.createAccessor().setType("SCALAR").setArray(new Uint16Array(indices)).setBuffer(buffer);
const prim = doc.createPrimitive().setAttribute("POSITION", pos).setAttribute("NORMAL", nrm).setIndices(idx);
doc.createScene().addChild(doc.createNode("cube").setMesh(doc.createMesh("cube").addPrimitive(prim)));
await new NodeIO().write("fixtures/cube.glb", doc);

// --- cube.obj + cube.mtl ---
let obj = "mtllib cube.mtl\nusemtl red\n";
for (let i = 0; i < positions.length; i += 3) obj += `v ${positions[i]} ${positions[i + 1]} ${positions[i + 2]}\n`;
for (const f of FACES) obj += `vn ${f.n.join(" ")}\n`;
for (let i = 0; i < indices.length; i += 3) {
  const ni = Math.floor(i / 6) + 1;
  obj += `f ${indices[i] + 1}//${ni} ${indices[i + 1] + 1}//${ni} ${indices[i + 2] + 1}//${ni}\n`;
}
writeFileSync("fixtures/cube.obj", obj);
writeFileSync("fixtures/cube.mtl", "newmtl red\nKd 0.8 0.1 0.1\n");

// --- cube.stl（ASCII）---
let stl = "solid cube\n";
for (let i = 0; i < indices.length; i += 3) {
  const f = FACES[Math.floor(i / 6)];
  stl += `facet normal ${f.n.join(" ")}\nouter loop\n`;
  for (const k of [indices[i], indices[i + 1], indices[i + 2]])
    stl += `vertex ${positions[k * 3]} ${positions[k * 3 + 1]} ${positions[k * 3 + 2]}\n`;
  stl += "endloop\nendfacet\n";
}
writeFileSync("fixtures/cube.stl", stl + "endsolid cube\n");

// --- cube-large.stl（顶点 ×75 → 150 单位立方体，模拟毫米制模型，验证缩放归一化）---
let stlLarge = "solid cube-large\n";
for (let i = 0; i < indices.length; i += 3) {
  const f = FACES[Math.floor(i / 6)];
  stlLarge += `facet normal ${f.n.join(" ")}\nouter loop\n`;
  for (const k of [indices[i], indices[i + 1], indices[i + 2]])
    stlLarge += `vertex ${positions[k * 3] * 75} ${positions[k * 3 + 1] * 75} ${positions[k * 3 + 2] * 75}\n`;
  stlLarge += "endloop\nendfacet\n";
}
writeFileSync("fixtures/cube-large.stl", stlLarge + "endsolid cube-large\n");

// --- cube.ply（ASCII，带顶点色）---
let ply = `ply\nformat ascii 1.0\nelement vertex 24\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nelement face 12\nproperty list uchar int vertex_indices\nend_header\n`;
for (let i = 0; i < positions.length; i += 3)
  ply += `${positions[i]} ${positions[i + 1]} ${positions[i + 2]} ${(i * 3) % 256} 120 200\n`;
for (let i = 0; i < indices.length; i += 3)
  ply += `3 ${indices[i]} ${indices[i + 1]} ${indices[i + 2]}\n`;
writeFileSync("fixtures/cube.ply", ply);

// --- cube-obj.zip ---
execSync("zip -j -X fixtures/cube-obj.zip fixtures/cube.obj fixtures/cube.mtl");
console.log("fixtures OK");
