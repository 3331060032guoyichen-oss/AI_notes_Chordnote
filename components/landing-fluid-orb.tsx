"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * 抽象 3D 流体琉璃体 —— Hero 右侧的视觉焦点
 *
 * 材质参数按规范：transmission 1 / roughness 0.1 / thickness 1.5 / ior 1.5
 * 光照不用白光：一盏极光青、一盏幻彩紫，让表面反射出页面现有的极光色。
 * 不引入 @react-three/fiber，直接用项目已有的 three@0.186.0。
 */
export function LandingFluidOrb() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas: HTMLCanvasElement | null = canvasRef.current;
    if (!canvas) return;
    // 固定为不可空的别名，供闭包内使用（TS 不会把收窄带进闭包）
    const canvasEl: HTMLCanvasElement = canvas;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvasEl,
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      // WebGL 不可用：静默降级，CSS 光斑仍然撑住画面
      return;
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 6.2);

    // ---- 环境贴图：transmission 靠采样环境做折射 ----
    // 没有环境时，透明 canvas 会采样到空背景，玻璃边缘出现黑边/脏斑。
    // 这里用一个自建的极光色小场景烘焙环境：青 + 紫 + 蓝三块发光面。
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envGeo = new THREE.PlaneGeometry(8, 8);
    const envFaces: Array<[string, [number, number, number]]> = [
      ["#2dd4bf", [5, 2, -3]],
      ["#c4b5fd", [-5, -1, 2]],
      ["#3b82f6", [0, 5, 1]],
      ["#f8fafc", [0, -5, -1]],
    ];
    for (const [color, pos] of envFaces) {
      const face = new THREE.Mesh(envGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color) }));
      face.position.set(pos[0], pos[1], pos[2]);
      face.lookAt(0, 0, 0);
      envScene.add(face);
    }
    const envTexture = pmrem.fromScene(envScene, 0.02).texture;
    scene.environment = envTexture;
    envGeo.dispose();
    envScene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        (obj.material as THREE.Material).dispose();
      }
    });

    // ---- 主体：扭曲环面（液态琉璃感）----
    // 管径 0.44 -> 0.34、分段 180x28 -> 288x48：
    // 细管 + 高分段消除自交处的穿插与自转时的高光跳变。
    const geometry = new THREE.TorusKnotGeometry(1.34, 0.34, 288, 48, 2, 3);
    const material = new THREE.MeshPhysicalMaterial({
      transmission: 1,
      roughness: 0.1,
      thickness: 1.5,
      ior: 1.5,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      color: new THREE.Color("#dbeafe"),
      attenuationColor: new THREE.Color("#2dd4bf"),
      attenuationDistance: 2.2,
      envMapIntensity: 1.35,
      transparent: true,
      side: THREE.FrontSide,
      depthWrite: false,
    });
    const knot = new THREE.Mesh(geometry, material);
    scene.add(knot);

    // 内层核：让玻璃里透出一点紫。缩到 0.5 并关掉透明，
    // 避免它穿过外面那层玻璃时产生半透明排序的闪烁。
    const coreGeometry = new THREE.IcosahedronGeometry(0.5, 3);
    const coreMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#7c3aed"),
      emissive: new THREE.Color("#4f46e5"),
      emissiveIntensity: 0.6,
      roughness: 0.4,
      metalness: 0.3,
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    scene.add(core);

    // ---- 光照：不用白光 ----
    const teal = new THREE.PointLight(new THREE.Color("#2dd4bf"), 90, 24);
    teal.position.set(3.4, 2.4, 3.2);
    const violet = new THREE.PointLight(new THREE.Color("#c4b5fd"), 80, 24);
    violet.position.set(-3.6, -1.6, 2.4);
    const rim = new THREE.PointLight(new THREE.Color("#3b82f6"), 45, 20);
    rim.position.set(0, 3.4, -3);
    scene.add(teal, violet, rim);
    scene.add(new THREE.AmbientLight(new THREE.Color("#94a3b8"), 0.5));

    // ---- 尺寸 ----
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

    // ---- 动画：极慢自转 + 轻微浮动 ----
    let frame = 0;
    const clock = new THREE.Clock();

    function tick() {
      const t = clock.getElapsedTime();
      if (!reduced) {
        knot.rotation.y += 0.002;
        knot.rotation.x += 0.0007;
        core.rotation.y -= 0.0035;
        core.rotation.z += 0.0016;
        const float = Math.sin(t * 0.5) * 0.14;
        knot.position.y = float;
        core.position.y = float;
        teal.position.x = 3.4 + Math.sin(t * 0.28) * 0.8;
        violet.position.y = -1.6 + Math.cos(t * 0.24) * 0.8;
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
      pmrem.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="landing-fluid-orb" aria-hidden="true" />;
}
