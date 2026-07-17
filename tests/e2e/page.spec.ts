import { join } from "node:path";
import { expect, test } from "@playwright/test";

const FIXTURES = join(process.cwd(), "fixtures");

test("上传 → 查看器 → 出图 → 拖拽排序 → 下载", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("h1")).toContainText("四视图");

  // 上传（走隐藏 input，等价于拖拽）
  await page.setInputFiles("#fileInput", join(FIXTURES, "cube.glb"));
  await expect(page.locator("#meta")).toContainText("12 三角面");

  // 出图
  await page.click("#renderBtn");
  await expect(page.locator(".shot")).toHaveCount(4, { timeout: 60_000 });
  await expect(page.locator(".shot .bar").first()).toContainText("正面");

  // pointer 拖拽：第 1 张拖到第 2 张上 → 顺序变 back, front
  const first = page.locator(".shot").first();
  const second = page.locator(".shot").nth(1);
  await first.scrollIntoViewIfNeeded();
  const a = (await first.boundingBox())!;
  const b = (await second.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".shot .bar").first()).toContainText("背面");
  await expect(page.locator(".shot .bar .n").first()).toHaveText("1");

  // 三种下载都触发 download 事件
  for (const [selector, name] of [
    [".shot .bar a", "back.png"],
    ["#zipBtn", "previews.zip"],
    ["#sheetBtn", "preview-sheet.png"],
  ] as const) {
    const dl = page.waitForEvent("download");
    await page.click(selector === ".shot .bar a" ? `${selector} >> nth=0` : selector);
    expect((await dl).suggestedFilename()).toBe(name);
  }
});

test("zip（obj+mtl）在查看器与出图都可用", async ({ page }) => {
  await page.goto("/");
  await page.setInputFiles("#fileInput", join(FIXTURES, "cube-obj.zip"));
  await expect(page.locator("#meta")).toContainText("cube-obj.zip");
  await page.click("#renderBtn");
  await expect(page.locator(".shot")).toHaveCount(4, { timeout: 60_000 });
});

test("未选文件点渲染出 toast 提示", async ({ page }) => {
  await page.goto("/");
  await page.click("#renderBtn");
  await expect(page.locator(".toast")).toContainText("请先拖入或选择模型文件");
});
