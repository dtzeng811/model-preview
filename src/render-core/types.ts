export type ViewName = "front" | "back" | "left" | "right";
export type ImageFormat = "png" | "webp";

export interface RenderOptions {
  views: ViewName[];
  size: 512 | 1024 | 2048;
  background: string; // "transparent" 或 "#RRGGBB"
  format: ImageFormat;
  /** 基准朝向方位角（度）——查看器当前朝向即「正面」，四视图绕它出 */
  yaw: number;
  /** 基准仰角（度），四视图共用同一仰角 */
  pitch: number;
}

export interface ModelInfo {
  triangles: number;
  dimensions: { x: number; y: number; z: number };
}

export interface CapturedImage {
  view: ViewName;
  data: string; // 不含 data: 前缀的 base64
  width: number;
  height: number;
}
