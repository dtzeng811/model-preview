export const SUPPORTED_EXTS = ["glb", "gltf", "obj", "stl", "ply"] as const;
export type SupportedExt = (typeof SUPPORTED_EXTS)[number];

export interface EntryPick {
  entry: string;
  ext: SupportedExt;
  mtl?: string;
}

const extOf = (p: string) => p.split(".").pop()!.toLowerCase();
const baseOf = (p: string) => p.split("/").pop()!;
const dirOf = (p: string) => p.split("/").slice(0, -1).join("/");

export function pickEntry(paths: string[]): EntryPick {
  const usable = paths.filter(
    (p) => !p.startsWith("__MACOSX/") && !baseOf(p).startsWith(".")
  );
  for (const ext of SUPPORTED_EXTS) {
    const entry = usable.find((p) => extOf(p) === ext);
    if (!entry) continue;
    const pick: EntryPick = { entry, ext };
    if (ext === "obj") {
      const mtl = usable.find((p) => extOf(p) === "mtl" && dirOf(p) === dirOf(entry));
      if (mtl) pick.mtl = mtl;
    }
    return pick;
  }
  throw new Error("未找到支持的模型文件（glb/gltf/obj/stl/ply）");
}
