"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * 发光粒子场 —— Hero 右侧的视觉焦点
 *
 * 四层结构叠出"炫"的观感（单一几何体做不到）：
 *   1. 粒子球壳    —— 3200 个发光点，Fibonacci 均匀分布，青→紫渐变，呼吸闪烁
 *   2. 嵌套线框    —— 两层二十面体线框，反向旋转，营造结构感
 *   3. 内核 + 光晕 —— 加法混合的发光球，整个球体的光心
 *   4. 倾斜光环    —— 一圈粒子，像行星环，参与缓慢进动
 *
 * 全程 AdditiveBlending：在深色底上自然发光，不需要后处理。
 */

const SHELL_COUNT = 4200;
const RING_COUNT = 1200;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** 球面均匀分布，避免两极堆积 */
function fibonacciSphere(i: number, total: number): [number, number, number] {
  const y = 1 - (i / (total - 1)) * 2;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = GOLDEN_ANGLE * i;
  return [Math.cos(theta) * radius, y, Math.sin(theta) * radius];
}

const TEAL = new THREE.Color("#2dd4bf");
const BLUE = new THREE.Color("#3b82f6");
const VIOLET = new THREE.Color("#a78bfa");

function pickColor(t: number): THREE.Color {
  if (t < 0.5) return TEAL.clone().lerp(BLUE, t * 2);
  return BLUE.clone().lerp(VIOLET, (t - 0.5) * 2);
}

export function LandingParticleField() {
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
    renderer.toneMappingExposure = 1.32;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 6.6);

    const group = new THREE.Group();
    scene.add(group);

    // ---- 1) 粒子球壳 ----
    const shellPositions = new Float32Array(SHELL_COUNT * 3);
    const shellColors = new Float32Array(SHELL_COUNT * 3);
    const shellPhase = new Float32Array(SHELL_COUNT);
    const shellBase: number[] = [];
    for (let i = 0; i < SHELL_COUNT; i += 1) {
      const [x, y, z] = fibonacciSphere(i, SHELL_COUNT);
      // 轻微半径抖动，让球壳有厚度而不是一张贴皮
      const r = 1.5 + (Math.random() - 0.5) * 0.1;
      shellBase.push(x * r, y * r, z * r);
      shellPositions[i * 3] = x * r;
      shellPositions[i * 3 + 1] = y * r;
      shellPositions[i * 3 + 2] = z * r;
      const c = pickColor(i / SHELL_COUNT);
      shellColors[i * 3] = c.r;
      shellColors[i * 3 + 1] = c.g;
      shellColors[i * 3 + 2] = c.b;
      shellPhase[i] = Math.random() * Math.PI * 2;
    }
    const shellGeometry = new THREE.BufferGeometry();
    shellGeometry.setAttribute("position", new THREE.BufferAttribute(shellPositions, 3));
    shellGeometry.setAttribute("color", new THREE.BufferAttribute(shellColors, 3));
    const shellMaterial = new THREE.PointsMaterial({
      size: 0.058,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const shell = new THREE.Points(shellGeometry, shellMaterial);
    group.add(shell);

    // ---- 2) 嵌套线框 ----
    const wireGroup = new THREE.Group();
    group.add(wireGroup);
    const wireGeometries: THREE.BufferGeometry[] = [];
    const wireMaterials: THREE.LineBasicMaterial[] = [];
    const wireSpecs: Array<{ r: number; color: string; opacity: number }> = [
      { r: 1.3, color: "#a5f3fc", opacity: 0.55 },
      { r: 1.02, color: "#2dd4bf", opacity: 0.42 },
      { r: 0.74, color: "#c4b5fd", opacity: 0.5 },
    ];
    for (const spec of wireSpecs) {
      const base = new THREE.IcosahedronGeometry(spec.r, 1);
      const wire = new THREE.WireframeGeometry(base);
      const wireMaterial = new THREE.LineBasicMaterial({
        color: new THREE.Color(spec.color),
        transparent: true,
        opacity: spec.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const lines = new THREE.LineSegments(wire, wireMaterial);
      wireGroup.add(lines);
      wireGeometries.push(wire);
      wireMaterials.push(wireMaterial);
      base.dispose();
    }

    // ---- 3) 内核 + 双层光晕 + 外层辉光 ----
    const coreGeometry = new THREE.SphereGeometry(0.36, 44, 30);
    const coreMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#7c3aed"),
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const core = new THREE.Mesh(coreGeometry, coreMaterial);
    group.add(core);

    const haloGeometry = new THREE.SphereGeometry(0.74, 36, 24);
    const haloMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#6d28d9"),
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const halo = new THREE.Mesh(haloGeometry, haloMaterial);
    group.add(halo);

    // 再套一层巨大的极淡辉光，把整个结构"点亮"，避免整体发灰
    const glowGeometry = new THREE.SphereGeometry(1.9, 40, 28);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color("#2dd4bf"),
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    group.add(glow);

    // ---- 4) 倾斜光环 ----
    const ringPositions = new Float32Array(RING_COUNT * 3);
    const ringColors = new Float32Array(RING_COUNT * 3);
    for (let i = 0; i < RING_COUNT; i += 1) {
      const angle = (i / RING_COUNT) * Math.PI * 2;
      const r = 1.95 + (Math.random() - 0.5) * 0.16;
      ringPositions[i * 3] = Math.cos(angle) * r;
      ringPositions[i * 3 + 1] = (Math.random() - 0.5) * 0.05;
      ringPositions[i * 3 + 2] = Math.sin(angle) * r;
      const c = i % 3 === 0 ? new THREE.Color("#a5f3fc") : pickColor(i / RING_COUNT);
      ringColors[i * 3] = c.r;
      ringColors[i * 3 + 1] = c.g;
      ringColors[i * 3 + 2] = c.b;
    }
    const ringGeometry = new THREE.BufferGeometry();
    ringGeometry.setAttribute("position", new THREE.BufferAttribute(ringPositions, 3));
    ringGeometry.setAttribute("color", new THREE.BufferAttribute(ringColors, 3));
    const ringMaterial = new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const ring = new THREE.Points(ringGeometry, ringMaterial);
    ring.rotation.set(0.62, 0, 0.24);
    group.add(ring);

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

    const positionAttr = shellGeometry.attributes.position as THREE.BufferAttribute;
    let frame = 0;
    const clock = new THREE.Clock();

    function tick() {
      const t = clock.getElapsedTime();

      if (!reduced) {
        group.rotation.y += 0.0022;
        group.rotation.x = Math.sin(t * 0.16) * 0.14;

        const breathe = 1 + Math.sin(t * 0.6) * 0.028;
        shell.scale.setScalar(breathe);
        core.scale.setScalar(1 + Math.sin(t * 1.5) * 0.09);
        halo.scale.setScalar(1 + Math.sin(t * 0.9 + 1) * 0.07);
        glow.scale.setScalar(1 + Math.sin(t * 0.5 + 2) * 0.05);
        haloMaterial.opacity = 0.26 + Math.sin(t * 0.9 + 1) * 0.1;
        coreMaterial.opacity = 0.72 + Math.sin(t * 1.5) * 0.14;

        // 分批做轻微径向扰动，产生"呼吸的星云"感，避免每帧全量重算
        const step = 7;
        const offset = Math.floor(t * 24) % step;
        for (let i = offset; i < SHELL_COUNT; i += step) {
          const j = i * 3;
          const k = 1 + Math.sin(t * 1.1 + shellPhase[i]) * 0.05;
          positionAttr.setXYZ(i, shellBase[j] * k, shellBase[j + 1] * k, shellBase[j + 2] * k);
        }
        positionAttr.needsUpdate = true;

        wireGroup.rotation.y -= 0.0032;
        wireGroup.rotation.z += 0.0014;
        ring.rotation.z += 0.0018;
        ring.rotation.y += 0.0009;
        shellMaterial.opacity = 0.8 + Math.sin(t * 0.8) * 0.15;
      }

      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(tick);
    }
    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      shellGeometry.dispose();
      shellMaterial.dispose();
      ringGeometry.dispose();
      ringMaterial.dispose();
      coreGeometry.dispose();
      coreMaterial.dispose();
      haloGeometry.dispose();
      haloMaterial.dispose();
      glowGeometry.dispose();
      glowMaterial.dispose();
      for (const g of wireGeometries) g.dispose();
      for (const m of wireMaterials) m.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="landing-fluid-orb" aria-hidden="true" />;
}
