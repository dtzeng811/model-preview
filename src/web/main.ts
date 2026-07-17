import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/manrope";
import "./styles.css";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import JSZip from "jszip";
import { RenderContext } from "../render-core/scene";
import { loadModel } from "../render-core/loaders";
import { pickEntry, type SupportedExt } from "../render-core/entry";
import type { CapturedImage, ImageFormat } from "../render-core/types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// ---------- 查看器 ----------
const viewport = $("viewport");
const ctx = new RenderContext(viewport);
const controls = new OrbitControls(ctx.camera, ctx.renderer.domElement);
controls.enableDamping = true;
ctx.renderer.setAnimationLoop(() => {
  controls.update();
  ctx.renderer.render(ctx.scene, ctx.camera);
});

const meta = $("meta");
let currentFile: File | null = null;

function toast(msg: string) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

async function loadIntoViewer(file: File) {
  const name = file.name;
  const ext = name.split(".").pop()!.toLowerCase();
  // 加载完成后统一回收本次创建的 blob URL，避免反复换模型泄漏
  const blobUrls: string[] = [];
  try {
    let obj: THREE.Object3D;
    if (ext === "zip") {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const paths = Object.keys(zip.files).filter((p) => !zip.files[p].dir);
      const pick = pickEntry(paths);
      const blobMap = new Map<string, string>();
      for (const p of paths) {
        const blob = new Blob([await zip.files[p].async("arraybuffer")]);
        const url = URL.createObjectURL(blob);
        blobUrls.push(url);
        blobMap.set(p.split("/").pop()!, url);
      }
      const resolve = (url: string) => blobMap.get(url.split("/").pop()!) ?? url;
      obj = await loadModel({
        url: resolve(pick.entry), ext: pick.ext,
        mtlUrl: pick.mtl ? resolve(pick.mtl) : undefined, resolveUrl: resolve,
      });
    } else {
      const url = URL.createObjectURL(file);
      blobUrls.push(url);
      obj = await loadModel({ url, ext: ext as SupportedExt });
    }
    const info = ctx.setModel(obj);
    controls.target.set(0, 0, 0);
    meta.hidden = false;
    meta.textContent = `${name} · ${info.triangles.toLocaleString()} 三角面 · ${info.dimensions.x.toFixed(2)} × ${info.dimensions.y.toFixed(2)} × ${info.dimensions.z.toFixed(2)}`;
    currentFile = file;
  } catch (e) {
    toast(`加载失败：${(e as Error).message}`);
  } finally {
    for (const url of blobUrls) URL.revokeObjectURL(url);
  }
}

const card = $("viewerCard");
card.addEventListener("dragover", (e) => { e.preventDefault(); card.classList.add("dragging"); });
card.addEventListener("dragleave", () => card.classList.remove("dragging"));
card.addEventListener("drop", (e) => {
  e.preventDefault();
  card.classList.remove("dragging");
  const f = e.dataTransfer?.files[0];
  if (f) void loadIntoViewer(f);
});
$("pickBtn").addEventListener("click", () => $("fileInput").click());
($("fileInput") as HTMLInputElement).addEventListener("change", (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) void loadIntoViewer(f);
});

// ---------- 参数 ----------
for (const segId of ["bgSeg", "fmtSeg"]) {
  $(segId).addEventListener("click", (e) => {
    const btn = e.target as HTMLButtonElement;
    if (btn.tagName !== "BUTTON") return;
    btn.parentElement!.querySelectorAll("button").forEach((b) => b.classList.remove("on"));
    btn.classList.add("on");
    if (segId === "bgSeg")
      ($("bgColor") as HTMLInputElement).disabled = btn.dataset.bg !== "color";
  });
}
const currentFormat = () =>
  ($("fmtSeg").querySelector(".on") as HTMLElement).dataset.f as ImageFormat;

// ---------- 出图（走 API）----------
interface Shot { view: string; url: string; }
let shots: Shot[] = [];

$("renderBtn").addEventListener("click", async () => {
  if (!currentFile) return toast("请先拖入或选择模型文件");
  const btn = $("renderBtn") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = "渲染中…";
  const t0 = performance.now();
  try {
    const size = ($("sizeSel") as HTMLSelectElement).value;
    const bg = ($("bgSeg").querySelector(".on") as HTMLElement).dataset.bg!;
    const background = bg === "transparent" ? "transparent" : ($("bgColor") as HTMLInputElement).value;
    const format = currentFormat();
    const form = new FormData();
    form.set("size", size);
    form.set("background", background);
    form.set("format", format);
    // 查看器当前朝向即「正面」基准：模型导入时未必摆正，用户转好角度再出图。
    // OrbitControls 的方位角与 cameraPosition 的 az 同约定（0 = +Z）；
    // 极角自 +Y 起算，转成自水平面起算的仰角。
    form.set("yaw", String(THREE.MathUtils.radToDeg(controls.getAzimuthalAngle())));
    form.set("pitch", String(90 - THREE.MathUtils.radToDeg(controls.getPolarAngle())));
    form.set("file", currentFile, currentFile.name);
    const res = await fetch("/render", { method: "POST", body: form });
    if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
    const body = (await res.json()) as { images: CapturedImage[] };
    shots = body.images.map((i) => ({ view: i.view, url: `data:image/${format};base64,${i.data}` }));
    rebuildGrid(format);
    refreshSheetPreview();
    $("stats").textContent =
      `${shots.length} 张 · ${size}px · ${background === "transparent" ? "透明背景" : "纯色背景"} · ${format.toUpperCase()} · 耗时 ${((performance.now() - t0) / 1000).toFixed(1)}s`;
    $("results").hidden = false;
  } catch (e) {
    toast(`渲染失败：${(e as Error).message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "渲染出图";
  }
});

// ---------- 结果网格 + pointer 拖拽排序 ----------
const grid = $("grid");
const VIEW_LABELS: Record<string, string> = { front: "正面", back: "背面", left: "左侧", right: "右侧" };

function rebuildGrid(format: ImageFormat) {
  grid.innerHTML = "";
  shots.forEach((s, i) => {
    const d = document.createElement("div");
    d.className = "shot";
    d.dataset.view = s.view;
    d.innerHTML =
      `<div class="img"><img src="${s.url}" alt="${s.view}"></div>` +
      `<div class="bar"><span><span class="n">${i + 1}</span>${VIEW_LABELS[s.view]}（${s.view}）</span>` +
      `<a download="${s.view}.${format}" href="${s.url}">下载</a></div>`;
    grid.appendChild(d);
  });
}

let dragSrc: HTMLElement | null = null;
grid.addEventListener("pointerdown", (e) => {
  const shot = (e.target as HTMLElement).closest<HTMLElement>(".shot");
  if (!shot || (e.target as HTMLElement).closest("a")) return;
  e.preventDefault();
  dragSrc = shot;
  shot.classList.add("drag-src");
  const move = (ev: PointerEvent) => {
    const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>(".shot");
    if (!over || !dragSrc || over === dragSrc || over.parentElement !== grid) return;
    const cards = [...grid.children];
    grid.insertBefore(dragSrc, cards.indexOf(dragSrc) < cards.indexOf(over) ? over.nextSibling : over);
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    dragSrc?.classList.remove("drag-src");
    dragSrc = null;
    const byView = new Map(shots.map((s) => [s.view, s]));
    shots = [...grid.children].map((c) => byView.get((c as HTMLElement).dataset.view!)!);
    grid.querySelectorAll(".bar .n").forEach((n, i) => (n.textContent = String(i + 1)));
    refreshSheetPreview(); // 拼图预览跟随新顺序
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
});

// ---------- 下载（顺序 = 当前卡片顺序）----------
function downloadUrl(url: string, name: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
}

// 拼图：预览与下载共用同一套合成逻辑，只是格子尺寸不同 —— 预览所见即下载所得
const SHEET_COLS = 2;
const SHEET_PREVIEW_CELL = 256;

async function composeSheet(cell: number, target?: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const rows = Math.ceil(shots.length / SHEET_COLS);
  const cv = target ?? document.createElement("canvas");
  cv.width = SHEET_COLS * cell;
  cv.height = rows * cell;
  const c2d = cv.getContext("2d")!;
  c2d.clearRect(0, 0, cv.width, cv.height); // 保留透明底
  await Promise.all(
    shots.map(
      (s, i) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            c2d.drawImage(img, (i % SHEET_COLS) * cell, Math.floor(i / SHEET_COLS) * cell, cell, cell);
            resolve();
          };
          img.src = s.url;
        })
    )
  );
  return cv;
}

/** 拼图预览：随卡片顺序实时刷新 */
function refreshSheetPreview() {
  if (!shots.length) return;
  void composeSheet(SHEET_PREVIEW_CELL, $("sheetCanvas") as HTMLCanvasElement);
}

$("sheetBtn").addEventListener("click", async () => {
  if (!shots.length) return;
  const size = Number(($("sizeSel") as HTMLSelectElement).value);
  const cv = await composeSheet(size);
  downloadUrl(cv.toDataURL("image/png"), "preview-sheet.png");
});

$("zipBtn").addEventListener("click", async () => {
  if (!shots.length) return;
  const zip = new JSZip();
  const format = currentFormat();
  shots.forEach((s, i) => zip.file(`${i + 1}-${s.view}.${format}`, s.url.split(",")[1], { base64: true }));
  const blob = await zip.generateAsync({ type: "blob" });
  downloadUrl(URL.createObjectURL(blob), "previews.zip");
});
