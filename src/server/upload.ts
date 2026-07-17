import { mkdirSync } from "node:fs";
import { copyFile, readdir, rename, unlink } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import extractZip from "extract-zip";
import { pickEntry, SUPPORTED_EXTS, type SupportedExt } from "../render-core/entry";
import { UnsupportedFormatError } from "./errors";

const DEFAULT_MAX_UNCOMPRESSED = 2 * 1024 ** 3; // 2GB 解压上限，防 zip 炸弹撑爆磁盘

export interface PrepareOptions {
  maxUncompressedBytes?: number;
}

export interface PreparedModel {
  dir: string;        // 模型资源根目录（静态挂载用）
  entryPath: string;  // 入口模型绝对路径
  entryRel: string;   // 相对 dir 的入口路径（拼 URL 用）
  ext: SupportedExt;
  mtlPath?: string;
  mtlRel?: string;
}

/** 递归列出普通文件（相对路径、正斜杠）；顺手剥离符号链接，防静态挂载被用作任意文件读 */
async function listFiles(root: string, base = root): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(root, { withFileTypes: true })) {
    const p = join(root, e.name);
    if (e.isSymbolicLink()) {
      await unlink(p); // zip 里的 symlink entry 一律删除，绝不进入返回列表
      continue;
    }
    if (e.isDirectory()) out.push(...(await listFiles(p, base)));
    else out.push(relative(base, p).split("\\").join("/"));
  }
  return out;
}

/** 跨设备安全的移动：优先 rename，遇 EXDEV（tmpfs → 应用卷）退回 copy+unlink */
async function moveFile(from: string, to: string): Promise<void> {
  try {
    await rename(from, to);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "EXDEV") {
      await copyFile(from, to);
      await unlink(from);
    } else {
      throw e;
    }
  }
}

export async function prepareModel(
  uploadedFile: string,
  originalName: string,
  workDir: string,
  opts: PrepareOptions = {}
): Promise<PreparedModel> {
  const maxUncompressed = opts.maxUncompressedBytes ?? DEFAULT_MAX_UNCOMPRESSED;
  // 只信任文件名的 basename：客户端可传 "../../evil.glb" 或 "..\\..\\evil.glb"。
  // 先把反斜杠归一成正斜杠再取 basename——否则 POSIX basename 不识别 \，
  // 反斜杠名会原样留下，后续 listFiles 的 \→/ 归一会把它还原成穿越路径。
  const safeName = basename(originalName.replace(/\\/g, "/"));
  const ext = safeName.split(".").pop()!.toLowerCase();
  const dir = join(workDir, "model");
  mkdirSync(dir, { recursive: true });

  if (ext === "zip") {
    let total = 0;
    await extractZip(uploadedFile, {
      dir,
      onEntry: (entry) => {
        total += entry.uncompressedSize;
        if (total > maxUncompressed) {
          throw new UnsupportedFormatError("zip 解压总大小超过上限");
        }
      },
    });
  } else if ((SUPPORTED_EXTS as readonly string[]).includes(ext)) {
    await moveFile(uploadedFile, join(dir, safeName));
  } else {
    throw new UnsupportedFormatError(
      `不支持的文件格式 .${ext}（支持 ${SUPPORTED_EXTS.join("/")} 或 zip）`
    );
  }

  let pick;
  try {
    pick = pickEntry(await listFiles(dir));
  } catch (e) {
    throw new UnsupportedFormatError((e as Error).message);
  }
  return {
    dir,
    entryPath: join(dir, pick.entry),
    entryRel: pick.entry,
    ext: pick.ext,
    mtlPath: pick.mtl ? join(dir, pick.mtl) : undefined,
    mtlRel: pick.mtl,
  };
}
