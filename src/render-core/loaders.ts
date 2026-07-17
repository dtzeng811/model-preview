import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js";
import type { SupportedExt } from "./entry";

export interface LoadInput {
  url: string;
  ext: SupportedExt;
  mtlUrl?: string;
  /** 可选 URL 重写（浏览器端 zip → blob URL 映射用） */
  resolveUrl?: (url: string) => string;
}

export function neutralMaterial(vertexColors = false) {
  return new THREE.MeshStandardMaterial({
    color: 0x9a988f,
    metalness: 0.1,
    roughness: 0.55,
    vertexColors,
  });
}

/** OBJ 无 vn 时补法线，否则无光照渲染成黑色 */
function ensureNormals(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.geometry && !m.geometry.attributes.normal) {
      m.geometry.computeVertexNormals();
    }
  });
}

export async function loadModel(input: LoadInput): Promise<THREE.Object3D> {
  const manager = new THREE.LoadingManager();
  if (input.resolveUrl) manager.setURLModifier(input.resolveUrl);

  switch (input.ext) {
    case "glb":
    case "gltf": {
      const gltf = await new GLTFLoader(manager).loadAsync(input.url);
      return gltf.scene;
    }
    case "obj": {
      const objLoader = new OBJLoader(manager);
      let hasMtl = false;
      if (input.mtlUrl) {
        try {
          const materials = await new MTLLoader(manager).loadAsync(input.mtlUrl);
          materials.preload();
          objLoader.setMaterials(materials);
          hasMtl = true;
        } catch {
          // MTL 加载失败不阻断渲染，退回中性材质
        }
      }
      const obj = await objLoader.loadAsync(input.url);
      if (!hasMtl) {
        obj.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = neutralMaterial();
        });
      }
      ensureNormals(obj);
      return obj;
    }
    case "stl": {
      const geo = await new STLLoader(manager).loadAsync(input.url);
      geo.computeVertexNormals();
      return new THREE.Mesh(geo, neutralMaterial());
    }
    case "ply": {
      const geo = await new PLYLoader(manager).loadAsync(input.url);
      geo.computeVertexNormals();
      return new THREE.Mesh(geo, neutralMaterial(Boolean(geo.attributes.color)));
    }
  }
}
