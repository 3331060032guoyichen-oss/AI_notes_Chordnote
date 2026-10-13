"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * 抽象流体体 —— Hero 右侧的视觉焦点
 *
 * 形态：球面被多频噪声揉成不规则有机体（不是数学曲线，避免"水管打结"的廉价感）
 * 材质：液态金属（metalness 1 / roughness 0.08），靠极光环境贴图反射出青与紫。
 *       不用 transmission —— 单遍折射会有补丁感，金属反射反而更干净、更"高级实验室"。
 * 光照：不用白光，环境与点光源全部取自页面的极光色。
 */

/** 多频正弦叠加，够便宜的伪噪声；用于把球面揉出有机起伏 */
function organicRadius(x: number, y: number, z: number): number {
  return (
    Math.sin(x * 1.15 + 0.7) * Math.cos(y * 1.35 - 0.4) * Math.sin(z * 1.05 + 1.1) * 0.58 +
    Math.sin(x * 2.3 - 1.2) * Math.sin(y * 2.1 + 0.6) * 0.28 +
    Math.cos(x * 3.7 + y * 3.1 - z * 2.9) * 0.14
  );
}

export function LandingFluidOrb() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas: HTMLCanvasElement | null = canvasRef.current;
    if (!canvas) return;
    const canvasEl: HTMLCanvasElement = canvas;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvasEl, alpha: true, antialias: true });
    } catch {
      return;
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 6.4);

    // ---- 环境贴图：连续渐变 ----
    // 用纯色平面会让金属映出硬边色块、且未覆盖方向反射成死黑。
    // 改成一张 equirect 渐变贴图（上青 / 中深紫 / 下淡紫白），反射才柔和连续。
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envCanvas = document.createElement("canvas");
    envCanvas.width = 512;
    envCanvas.height = 256;
    const envCtx = envCanvas.getContext("2d");
    if (envCtx) {
      const grad = envCtx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, "#2dd4bf");
      grad.addColorStop(0.28, "#1d4ed8");
      grad.addColorStop(0.52, "#0b1120");
      grad.addColorStop(0.76, "#6d28d9");
      grad.addColorStop(1, "#c4b5fd");
      envCtx.fillStyle = grad;
      envCtx.fillRect(0, 0, 512, 256);
      // 几道柔和高光带，模拟真实摄影棚的灯箱
      const soft = envCtx.createLinearGradient(0, 0, 512, 0);
      soft.addColorStop(0, "rgba(255,255,255,0)");
      soft.addColorStop(0.46, "rgba(255,255,255,0.55)");
      soft.addColorStop(0.54, "rgba(255,255,255,0.55)");
      soft.addColorStop(1, "rgba(255,255,255,0)");
      envCtx.fillStyle = soft;
      envCtx.fillRect(0, 40, 512, 52);
    }
    const envSource = new THREE.CanvasTexture(envCanvas);
    envSource.mapping = THREE.EquirectangularReflectionMapping;
    envSource.colorSpace = THREE.SRGBColorSpace;
    const envTexture = pmrem.fromEquirectangular(envSource).texture;
    scene.environment = envTexture;
    envSource.dispose();
    pmrem.dispose();

    // ---- 主体：被噪声揉过的球 ----
    // 必须用 SphereGeometry 而不是 IcosahedronGeometry：
    // 后者的顶点按面独立，computeVertexNormals 只能得到平面法线，会整片变成低多边形刻面。
    const geometry = new THREE.SphereGeometry(1.42, 160, 110);
    const position = geometry.attributes.position as THREE.BufferAttribute;
    const vertex = new THREE.Vector3();
    for (let i = 0; i < position.count; i += 1) {
      vertex.fromBufferAttribute(position, i);
      const n = organicRadius(vertex.x, vertex.y, vertex.z);
      vertex.multiplyScalar(1 + n * 0.19);
      position.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();

    const material = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#cbd5e1"),
      metalness: 0.96,
      roughness: 0.16,
      envMapIntensity: 1.5,
      clearcoat: 0.6,
      clearcoatRoughness: 0.15,
    });
    const blob = new THREE.Mesh(geometry, material);
    blob.rotation.set(0.4, 0.9, 0.15);
    scene.add(blob);

    // 内部的紫色发光核，透过金属的缝隙边缘透出一点暖意
    const coreGeometry = new THREE.IcosahedronGeometry(1.02, 2);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#4c1d95"),
      transparent: true,
      opacity: 0.28,
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    core.rotation.copy(blob.rotation);
    scene.add(core);

    // ---- 光照 ----
    const teal = new THREE.PointLight(new THREE.Color("#2dd4bf"), 60, 26);
    teal.position.set(3.6, 2.6, 3.4);
    const violet = new THREE.PointLight(new THREE.Color("#a78bfa"), 52, 26);
    violet.position.set(-3.8, -1.8, 2.6);
    scene.add(teal, violet);
    scene.add(new THREE.AmbientLight(new THREE.Color("#64748b"), 0.4));

    function resize() {
      const rect = canvasEl.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvasEl);

    let frame = 0;
    const clock = new THREE.Clock();

    function tick() {
      const t = clock.getElapsedTime();
      if (!reduced) {
        blob.rotation.y += 0.0016;
        blob.rotation.x += 0.0005;
        core.rotation.copy(blob.rotation);
        // 极缓的呼吸，让它像液态而非固体
        const breathe = 1 + Math.sin(t * 0.42) * 0.022;
        blob.scale.setScalar(breathe);
        core.scale.setScalar(breathe);
        blob.position.y = Math.sin(t * 0.36) * 0.1;
        core.position.y = blob.position.y;
        teal.position.x = 3.6 + Math.sin(t * 0.26) * 0.9;
        violet.position.y = -1.8 + Math.cos(t * 0.22) * 0.9;
      }
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(tick);
    }
    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      geometry.dispose();
      material.dispose();
      coreGeometry.dispose();
      coreMaterial.dispose();
      envTexture.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="landing-fluid-orb" aria-hidden="true" />;
}
