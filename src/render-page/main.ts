import { RenderContext } from "../render-core/scene";
import { loadModel, type LoadInput } from "../render-core/loaders";
import type { CapturedImage, ModelInfo, RenderOptions } from "../render-core/types";

const ctx = new RenderContext();

declare global {
  interface Window {
    renderModel: (
      input: LoadInput,
      options: RenderOptions
    ) => Promise<{ info: ModelInfo; images: CapturedImage[] }>;
    renderReady: boolean;
  }
}

// 单飞契约：一页同时只允许一个 renderModel 调用，由 RenderPool 的
// acquire/release 保证；这里加守卫防契约被破坏时静默出错
let busy = false;

window.renderModel = async (input, options) => {
  if (busy) throw new Error("renderModel 不可并发调用（单页单飞契约）");
  busy = true;
  try {
    const obj = await loadModel(input);
    const info = ctx.setModel(obj);
    const images = ctx.capture(options);
    return { info, images };
  } finally {
    busy = false;
  }
};
window.renderReady = true;
