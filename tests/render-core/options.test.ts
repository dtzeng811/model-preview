import { describe, expect, it } from "vitest";
import { validateOptions } from "../../src/render-core/options";
import { DEFAULT_PITCH, DEFAULT_YAW, PITCH_LIMIT } from "../../src/render-core/views";

describe("validateOptions", () => {
  it("空输入返回默认值", () => {
    expect(validateOptions({})).toEqual({
      views: ["front", "back", "left", "right"],
      size: 1024,
      background: "transparent",
      format: "png",
      yaw: DEFAULT_YAW,
      pitch: DEFAULT_PITCH,
    });
  });
  it("views 去重且保序", () => {
    expect(validateOptions({ views: "front,front,left" }).views).toEqual(["front", "left"]);
  });
  it("解析合法输入", () => {
    expect(
      validateOptions({ views: "front,left", size: "512", background: "#FF0000", format: "webp" })
    ).toEqual({
      views: ["front", "left"],
      size: 512,
      background: "#FF0000",
      format: "webp",
      yaw: DEFAULT_YAW,
      pitch: DEFAULT_PITCH,
    });
  });
  it("解析基准朝向（含负值与小数）", () => {
    const o = validateOptions({ yaw: "-137.5", pitch: "22.25" });
    expect(o.yaw).toBe(-137.5);
    expect(o.pitch).toBe(22.25);
  });
  it("pitch 夹取到 ±89°（查看器可转到正上/正下方，不该让请求失败）", () => {
    expect(validateOptions({ pitch: "90" }).pitch).toBe(PITCH_LIMIT);
    expect(validateOptions({ pitch: "-1000" }).pitch).toBe(-PITCH_LIMIT);
  });
  it("yaw 不做归一化：任意角度都是合法的绕行基准", () => {
    expect(validateOptions({ yaw: "540" }).yaw).toBe(540);
  });
  it.each([
    [{ views: "front,upside" }, /views/],
    [{ size: "999" }, /size/],
    [{ background: "red" }, /background/],
    [{ format: "gif" }, /format/],
    [{ yaw: "abc" }, /yaw/],
    [{ pitch: "abc" }, /pitch/],
  ])("非法输入 %j 抛带字段名的错", (input, re) => {
    expect(() => validateOptions(input as Record<string, string>)).toThrow(re);
  });
});
