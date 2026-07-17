import { describe, expect, it } from "vitest";
import {
  DEFAULT_PITCH,
  DEFAULT_VIEWS,
  DEFAULT_YAW,
  VIEW_OFFSETS,
  cameraPosition,
  viewAngles,
} from "../../src/render-core/views";

describe("views", () => {
  it("默认恰好四视图且有偏移定义", () => {
    expect(DEFAULT_VIEWS).toEqual(["front", "back", "left", "right"]);
    for (const v of DEFAULT_VIEWS) expect(VIEW_OFFSETS[v]).toBeDefined();
  });

  it("默认基准下 front 在 +Z 侧、back 在 -Z 侧、left 在 -X 侧、right 在 +X 侧", () => {
    const at = (v: (typeof DEFAULT_VIEWS)[number]) => {
      const a = viewAngles(v);
      return cameraPosition(a.az, a.el, 1);
    };
    expect(at("front").z).toBeGreaterThan(0);
    expect(at("back").z).toBeLessThan(0);
    expect(at("left").x).toBeLessThan(0);
    expect(at("right").x).toBeGreaterThan(0);
  });

  it("相机距离 = 3.2 × fitRadius", () => {
    const p = cameraPosition(0, 0, 2);
    expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(6.4);
  });

  it("不传基准朝向时用默认 yaw/pitch", () => {
    expect(viewAngles("front")).toEqual({ az: DEFAULT_YAW, el: DEFAULT_PITCH });
    expect(viewAngles("back")).toEqual({ az: DEFAULT_YAW + 180, el: DEFAULT_PITCH });
  });

  it("四视图绕基准朝向旋转：yaw 即正面，其余按 ±90/180 偏移，共用同一仰角", () => {
    const yaw = 30;
    const pitch = 18;
    expect(viewAngles("front", yaw, pitch)).toEqual({ az: 30, el: 18 });
    expect(viewAngles("back", yaw, pitch)).toEqual({ az: 210, el: 18 });
    expect(viewAngles("left", yaw, pitch)).toEqual({ az: -60, el: 18 });
    expect(viewAngles("right", yaw, pitch)).toEqual({ az: 120, el: 18 });
  });

  it("基准 yaw 旋转 90° 后，front 机位落到原 right 的位置", () => {
    const rotated = viewAngles("front", 90, DEFAULT_PITCH);
    const original = viewAngles("right");
    const a = cameraPosition(rotated.az, rotated.el, 1);
    const b = cameraPosition(original.az, original.el, 1);
    expect(a.x).toBeCloseTo(b.x);
    expect(a.z).toBeCloseTo(b.z);
  });
});
