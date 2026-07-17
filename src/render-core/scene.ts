import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { CapturedImage, ModelInfo, RenderOptions } from "./types";
import { DEFAULT_PITCH, DEFAULT_YAW, cameraPosition, viewAngles } from "./views";

export class RenderContext {
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  private readonly group = new THREE.Group();
  private readonly captureCamera = new THREE.PerspectiveCamera(40, 1, 0.01, 100);
  private container?: HTMLElement;
  fitRadius = 1;

  constructor(container?: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.add(this.group);
    if (container) {
      this.container = container;
      container.appendChild(this.renderer.domElement);
      new ResizeObserver(() => this.fit()).observe(container);
      this.fit();
    }
  }

  /** 防御：内嵌/无头环境下 clientWidth 可能为 0 */
  fit() {
    if (!this.container) return;
    const w = this.container.clientWidth || 640;
    const h = this.container.clientHeight || 480;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** group.clear() 只解挂不释放 GPU 资源，换模型前需手动 dispose 防 VRAM 堆积
   *  贴图槽用通用遍历而非硬编码列表：MTLLoader 等还会填充 bumpMap/specularMap 等
   *  非固定槽位，硬编码列表会漏释放导致显存泄漏 */
  private disposeGroup() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry?.dispose();
      const materials = Array.isArray(m.material) ? m.material : [m.material];
      for (const material of materials) {
        if (!material) continue;
        for (const value of Object.values(material)) {
          // 共享的 PMREM 环境贴图不能随材质释放（防未来某路径把它挂到 material.envMap）
          if (value instanceof THREE.Texture && value !== this.scene.environment)
            value.dispose();
        }
        material.dispose();
      }
    });
    this.group.clear();
  }

  setModel(obj: THREE.Object3D): ModelInfo {
    this.disposeGroup();
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    // 缩放归一化：按最大边把模型统一缩放到 2 个世界单位（设计文档 §6），
    // 否则毫米制模型（如 150mm STL）会超出相机 far 平面渲染成空白
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    obj.scale.multiplyScalar(2 / maxDim);
    // 缩放后重算包围盒再居中（先减原 center 再缩放会留下 (s-1)·center 的偏移）
    const scaledBox = new THREE.Box3().setFromObject(obj);
    obj.position.sub(scaledBox.getCenter(new THREE.Vector3()));
    this.group.add(obj);
    // fitRadius 取归一化后包围盒的半对角线（外接球半径），而非硬编码 1：
    // 硬编码 1 只覆盖球形物体，立方体/长方体的角到中心距离达 √3，
    // 会导致相机距离不够、模型四角越出画面（正视图甚至铺满整幅画面看不到背景）
    this.fitRadius = scaledBox.getSize(new THREE.Vector3()).length() / 2;
    // 初始机位 = 默认「正面」视角：查看器所见即四视图的正面基准，用户转到哪
    // 就以哪个角度为正面（模型导入时未必摆正）
    const p = cameraPosition(DEFAULT_YAW, DEFAULT_PITCH, this.fitRadius);
    this.camera.position.set(p.x, p.y, p.z);
    this.camera.lookAt(0, 0, 0);
    let triangles = 0;
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry) {
        const g = m.geometry as THREE.BufferGeometry;
        triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
      }
    });
    return {
      triangles: Math.round(triangles),
      dimensions: { x: size.x, y: size.y, z: size.z },
    };
  }

  /** 同一 WebGL 上下文内截图（跨上下文环境贴图失效 → 黑图，禁止另开 renderer） */
  capture(options: RenderOptions): CapturedImage[] {
    const { views, size, background, format } = options;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(size, size, false);
    if (background === "transparent") this.renderer.setClearColor(0x000000, 0);
    else this.renderer.setClearColor(background, 1);
    this.captureCamera.aspect = 1;
    this.captureCamera.updateProjectionMatrix();
    const images = views.map((view) => {
      const a = viewAngles(view, options.yaw, options.pitch);
      const p = cameraPosition(a.az, a.el, this.fitRadius);
      this.captureCamera.position.set(p.x, p.y, p.z);
      this.captureCamera.lookAt(0, 0, 0);
      this.renderer.render(this.scene, this.captureCamera);
      const data = this.renderer.domElement
        .toDataURL(`image/${format}`)
        .split(",")[1];
      return { view, data, width: size, height: size };
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
    this.fit();
    return images;
  }
}
