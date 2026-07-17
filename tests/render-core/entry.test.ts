import { describe, expect, it } from "vitest";
import { pickEntry, SUPPORTED_EXTS } from "../../src/render-core/entry";

describe("pickEntry", () => {
  it("单模型文件直接选中", () => {
    expect(pickEntry(["cube.stl"])).toEqual({ entry: "cube.stl", ext: "stl" });
  });
  it("obj 自动携带同目录 mtl", () => {
    expect(pickEntry(["a/cube.obj", "a/cube.mtl", "readme.txt"])).toEqual({
      entry: "a/cube.obj", ext: "obj", mtl: "a/cube.mtl",
    });
  });
  it("多候选时优先级 glb > gltf > obj > stl > ply", () => {
    expect(pickEntry(["m.ply", "m.glb", "m.obj"]).ext).toBe("glb");
  });
  it("忽略 __MACOSX 与隐藏文件", () => {
    expect(pickEntry(["__MACOSX/._x.glb", ".hidden.glb", "real.stl"]).ext).toBe("stl");
  });
  it("找不到模型时抛错", () => {
    expect(() => pickEntry(["readme.txt"])).toThrow(/未找到/);
  });
  it("支持列表恰为五种", () => {
    expect(SUPPORTED_EXTS).toEqual(["glb", "gltf", "obj", "stl", "ply"]);
  });
});
