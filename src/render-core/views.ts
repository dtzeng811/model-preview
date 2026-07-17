import type { ViewName } from "./types";

export const DEFAULT_VIEWS: ViewName[] = ["front", "back", "left", "right"];

/** 四视图相对「基准朝向」的方位角偏移（度）。基准朝向 = 查看器当前朝向 = 正面。 */
export const VIEW_OFFSETS: Record<ViewName, number> = {
  front: 0,
  back: 180,
  left: -90,
  right: 90,
};

/** 未指定朝向时的基准：世界坐标 +Z 为正面、略微俯视 4°（与查看器初始机位一致） */
export const DEFAULT_YAW = 0;
export const DEFAULT_PITCH = 4;
/** pitch 夹取范围：±90° 时 lookAt 与 up 向量共线会退化 */
export const PITCH_LIMIT = 89;

export const CAMERA_DISTANCE_FACTOR = 3.2;

/** 某个视角在给定基准朝向下的机位角度。模型导入时可能没摆正，用户在查看器里
 *  转到满意的角度后，那个角度即 yaw/pitch 基准，四视图绕它出。 */
export function viewAngles(
  view: ViewName,
  yaw: number = DEFAULT_YAW,
  pitch: number = DEFAULT_PITCH
): { az: number; el: number } {
  return { az: yaw + VIEW_OFFSETS[view], el: pitch };
}

export function cameraPosition(azDeg: number, elDeg: number, fitRadius: number) {
  const r = fitRadius * CAMERA_DISTANCE_FACTOR;
  const az = (azDeg * Math.PI) / 180;
  const el = (elDeg * Math.PI) / 180;
  return {
    x: r * Math.cos(el) * Math.sin(az),
    y: r * Math.sin(el),
    z: r * Math.cos(el) * Math.cos(az),
  };
}
