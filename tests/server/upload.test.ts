import { mkdtempSync, rmSync, cpSync, readdirSync, existsSync, lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { prepareModel } from "../../src/server/upload";

const FIXTURES = join(process.cwd(), "fixtures");
let dirs: string[] = [];
const work = () => {
  const d = mkdtempSync(join(tmpdir(), "mp-test-"));
  dirs.push(d);
  return d;
};
afterEach(() => { dirs.forEach((d) => rmSync(d, { recursive: true, force: true })); dirs = []; });

describe("prepareModel", () => {
  it("单文件模型原样返回", async () => {
    const dir = work();
    cpSync(join(FIXTURES, "cube.glb"), join(dir, "upload.bin"));
    const r = await prepareModel(join(dir, "upload.bin"), "cube.glb", dir);
    expect(r.ext).toBe("glb");
    expect(r.entryPath.endsWith("cube.glb")).toBe(true);
  });
  it("zip 解压并定位 obj + mtl", async () => {
    const dir = work();
    cpSync(join(FIXTURES, "cube-obj.zip"), join(dir, "upload.bin"));
    const r = await prepareModel(join(dir, "upload.bin"), "cube-obj.zip", dir);
    expect(r.ext).toBe("obj");
    expect(r.mtlPath).toBeDefined();
    expect(readdirSync(r.dir).sort()).toContain("cube.mtl");
  });
  it("不支持的扩展名抛 400", async () => {
    const dir = work();
    cpSync(join(FIXTURES, "cube.mtl"), join(dir, "upload.bin"));
    await expect(prepareModel(join(dir, "upload.bin"), "cube.txt", dir)).rejects.toMatchObject({ statusCode: 400 });
  });
  it("zip 内无模型抛 400", async () => {
    const dir = work();
    execSync(`cd ${dir} && echo hi > readme.txt && zip -q empty.zip readme.txt`);
    await expect(prepareModel(join(dir, "empty.zip"), "empty.zip", dir)).rejects.toMatchObject({ statusCode: 400 });
  });

  it.each([
    ["正斜杠穿越", "../../evil.glb"],
    ["反斜杠穿越", "..\\..\\evil.glb"],
  ])("恶意文件名（%s）的 entryPath 仍限定在 model 目录内", async (_label, name) => {
    const dir = work();
    cpSync(join(FIXTURES, "cube.glb"), join(dir, "upload.bin"));
    const modelDir = join(dir, "model");
    const r = await prepareModel(join(dir, "upload.bin"), name, dir);
    expect(r.entryPath.startsWith(modelDir)).toBe(true);
    expect(r.entryRel.includes("..")).toBe(false);
    expect(r.entryPath.endsWith("evil.glb")).toBe(true);
    // 没有逃逸到 workDir 之外
    expect(existsSync(join(dir, "..", "evil.glb"))).toBe(false);
  });

  it("zip 解压总大小超过上限抛 400", async () => {
    const dir = work();
    cpSync(join(FIXTURES, "cube-obj.zip"), join(dir, "upload.bin"));
    await expect(
      prepareModel(join(dir, "upload.bin"), "cube-obj.zip", dir, { maxUncompressedBytes: 10 })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("zip 内的符号链接被剥离（不进入静态目录）", async () => {
    const dir = work();
    // 构造含符号链接 evil.glb → /etc/hosts 与真实模型 cube.stl 的 zip
    execSync(`cd ${dir} && ln -s /etc/hosts evil.glb && cp ${join(FIXTURES, "cube.stl")} . && zip -q -y payload.zip evil.glb cube.stl && rm evil.glb cube.stl`);
    const r = await prepareModel(join(dir, "payload.zip"), "payload.zip", dir);
    // 符号链接被删除，真实模型被选中（否则 glb 优先级更高会选中 evil.glb）
    expect(r.ext).toBe("stl");
    expect(existsSync(join(r.dir, "evil.glb"))).toBe(false);
    for (const f of readdirSync(r.dir)) {
      expect(lstatSync(join(r.dir, f)).isSymbolicLink()).toBe(false);
    }
  });
});
