import type { RenderOptions, ViewName } from "./types";
import { DEFAULT_PITCH, DEFAULT_VIEWS, DEFAULT_YAW, PITCH_LIMIT, VIEW_OFFSETS } from "./views";

const SIZES = [512, 1024, 2048] as const;
const HEX = /^#[0-9a-fA-F]{6}$/;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function angle(raw: string | undefined, fallback: number, field: string): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${field} 必须是数字（度）`);
  return n;
}

export function validateOptions(input: Record<string, string | undefined>): RenderOptions {
  const views = [
    ...new Set((input.views ? input.views.split(",") : DEFAULT_VIEWS).map((v) => v.trim())),
  ];
  for (const v of views) {
    if (!(v in VIEW_OFFSETS)) throw new Error(`views 含不支持的角度：${v}`);
  }
  const size = input.size ? Number(input.size) : 1024;
  if (!SIZES.includes(size as (typeof SIZES)[number])) throw new Error(`size 只支持 ${SIZES.join("/")}`);
  const background = input.background ?? "transparent";
  if (background !== "transparent" && !HEX.test(background))
    throw new Error(`background 只支持 transparent 或 #RRGGBB`);
  const format = input.format ?? "png";
  if (format !== "png" && format !== "webp") throw new Error(`format 只支持 png/webp`);
  const yaw = angle(input.yaw, DEFAULT_YAW, "yaw");
  // pitch 夹取而非报错：查看器可转到正上/正下方，夹到 ±89° 即可，没必要让用户的操作失败
  const pitch = clamp(angle(input.pitch, DEFAULT_PITCH, "pitch"), -PITCH_LIMIT, PITCH_LIMIT);
  return {
    views: views as ViewName[],
    size: size as RenderOptions["size"],
    background,
    format,
    yaw,
    pitch,
  };
}
