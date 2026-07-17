import puppeteer, { type Browser, type Page } from "puppeteer";
import type { CapturedImage, ModelInfo, RenderOptions } from "../render-core/types";
import type { LoadInput } from "../render-core/loaders";
import { ParseFailedError, RenderTimeoutError, ServiceBusyError } from "./errors";

const RENDER_TIMEOUT_MS = 120_000;
// 排队等页面的上限：池永久无法恢复时，请求不会无限挂起，而是快速 503 让客户端重试
const ACQUIRE_TIMEOUT_MS = 30_000;

export interface RenderResult {
  info: ModelInfo;
  images: CapturedImage[];
}

const RESTART_RETRY_MS = 5_000;

export class RenderPool {
  private browser!: Browser;
  private idle: Page[] = [];
  private waiters: Array<(p: Page) => void> = [];
  private restarting: Promise<void> | null = null;
  private started = false;
  // 防 SSRF 的白名单来源：只有本服务自身（渲染页 + /__models 静态资源）算同源。
  // 注意：不能用字段初始化器写成 `= new URL(this.pageUrl).origin`——ES2022 原生
  // class field 语义下，字段初始化器在构造函数体（含参数属性赋值）之前执行，
  // 此时 this.pageUrl 还是 undefined，会直接抛 TypeError: Invalid URL。
  private readonly allowedOrigin: string;

  constructor(private pageUrl: string, private size = 2) {
    this.allowedOrigin = new URL(pageUrl).origin;
  }

  get ready(): boolean {
    return this.started;
  }

  async start() {
    this.browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--enable-unsafe-swiftshader"],
    });
    // 用 release() 归还：重启期间排队的 waiter 能直接拿到新页面，不必等下一次 render
    for (let i = 0; i < this.size; i++) this.release(await this.newPage());
    this.started = true;
  }

  private async newPage(): Promise<Page> {
    const page = await this.browser.newPage();
    // 防 SSRF：模型文件可内嵌外部 URI（buffer/贴图），无头 Chrome 会去 fetch。
    // 只放行同源（本服务自托管的渲染页与 /__models 资源）与内联 scheme，其余一律拦截。
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const url = req.url();
      // 内联 scheme 无网络行为，放行；其余按“严格同源”判定（origin 相等，
      // 而非前缀匹配——前缀匹配会误放 http://origin@evil.com/ 这类凭证 URL）
      if (url.startsWith("data:") || url.startsWith("blob:")) {
        void req.continue();
        return;
      }
      let sameOrigin = false;
      try {
        sameOrigin = new URL(url).origin === this.allowedOrigin;
      } catch {
        sameOrigin = false;
      }
      if (sameOrigin) void req.continue();
      else void req.abort();
    });
    await page.goto(this.pageUrl, { waitUntil: "networkidle0" });
    await page.waitForFunction("window.renderReady === true", { timeout: 30_000 });
    return page;
  }

  private acquire(): Promise<Page> {
    const page = this.idle.pop();
    if (page) return Promise.resolve(page);
    return new Promise((resolve, reject) => {
      const waiter = (p: Page) => { clearTimeout(timer); resolve(p); };
      const timer = setTimeout(() => {
        const i = this.waiters.indexOf(waiter);
        if (i >= 0) this.waiters.splice(i, 1); // 从队列摘除自己，避免泄漏
        reject(new ServiceBusyError());
      }, ACQUIRE_TIMEOUT_MS);
      this.waiters.push(waiter);
    });
  }

  private release(page: Page) {
    const waiter = this.waiters.shift();
    if (waiter) waiter(page);
    else this.idle.push(page);
  }

  /**
   * 整体重启（浏览器已死）。用 restarting 互斥：两个页面同时失败只会 launch 一次。
   * 内部吞掉所有错误——失败则后台定时重试，绝不向外抛（recycle 被 void 调用）。
   */
  private ensureRestart(): Promise<void> {
    if (!this.restarting) {
      this.restarting = this.restart()
        .catch((err) => {
          console.error(`[render-pool] 浏览器重启失败，${RESTART_RETRY_MS}ms 后重试`, err);
          setTimeout(() => void this.ensureRestart(), RESTART_RETRY_MS);
        })
        .finally(() => { this.restarting = null; });
    }
    return this.restarting;
  }

  private async restart(): Promise<void> {
    try { await this.browser?.close(); } catch { /* 已崩溃 */ }
    this.idle = [];
    await this.start();
  }

  /**
   * 单个页面渲染失败/超时后回收。区分两类故障：
   * - 浏览器已断开 → 整体重启（带互斥）
   * - 浏览器仍在（仅这个页面坏了）→ 只补一个新页面，绝不动浏览器，避免误杀其它在途渲染
   * 本方法永不抛错（被 render 以 void 调用）。
   */
  private async recycle(page: Page): Promise<void> {
    try { await page.close(); } catch { /* 已崩溃 */ }
    if (!this.browser.connected) {
      void this.ensureRestart();
      return;
    }
    try {
      this.release(await this.newPage());
    } catch (err) {
      // 页面级瞬时故障（goto / waitForFunction 超时）：池容量临时 -1，不重启浏览器
      console.error("[render-pool] 重建渲染页失败，池容量临时减一", err);
    }
  }

  async render(input: LoadInput, options: RenderOptions): Promise<RenderResult> {
    const page = await this.acquire();
    let timer!: ReturnType<typeof setTimeout>;
    try {
      const result = await Promise.race([
        page.evaluate(
          (i, o) => window.renderModel(i, o),
          input as never,
          options as never
        ),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new RenderTimeoutError()), RENDER_TIMEOUT_MS);
        }),
      ]);
      this.release(page);
      return result as RenderResult;
    } catch (err) {
      void this.recycle(page);
      if (err instanceof RenderTimeoutError) throw err;
      throw new ParseFailedError((err as Error).message);
    } finally {
      clearTimeout(timer);
    }
  }

  async stop() {
    try { await this.browser?.close(); } catch { /* noop */ }
  }
}
