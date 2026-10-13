"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import * as THREE from "three";

type LandingKnowledgeNetworkProps = {
  /** 揭示进度 0→1，用于让网络随进入逐渐亮起 */
  progressRef: RefObject<number>;
  className?: string;
};

const NODE_COUNT = 30;
const LINK_DISTANCE = 4.4;
const SPHERE_RADIUS = 5.2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * 线稿风格的三维知识网络（替换原来的碎裂水晶）。
 * 做法参考 illoca 一类站点的「细线勾勒 3D 形体」：
 * 只有线、点和极淡的面，靠缓慢旋转与视差制造纵深，而不是靠贴图与高光。
 */
export function LandingKnowledgeNetwork({ progressRef, className }: LandingKnowledgeNetworkProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const hostNode = hostRef.current;
    if (!hostNode) return;
    const host: HTMLDivElement = hostNode;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      return; // WebGL 不可用时静默降级，背景渐变仍在
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearAlpha(0);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 15.5);

    const group = new THREE.Group();
    scene.add(group);

    /* ---- 节点：斐波那契球面均匀分布，保证每次刷新一致 ---- */
    const positions: THREE.Vector3[] = [];
    for (let index = 0; index < NODE_COUNT; index += 1) {
      const y = 1 - (index / (NODE_COUNT - 1)) * 2;
      const ring = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = index * GOLDEN_ANGLE;
      // 用确定性抖动打破完全规则感
      const jitter = 1 + Math.sin(index * 12.9898) * 0.09;
      positions.push(
        new THREE.Vector3(
          Math.cos(theta) * ring * SPHERE_RADIUS * jitter,
          y * SPHERE_RADIUS * 0.82 * jitter,
          Math.sin(theta) * ring * SPHERE_RADIUS * jitter,
        ),
      );
    }

    /* ---- 连线：距离阈值内相连 ---- */
    const linkPoints: number[] = [];
    for (let i = 0; i < positions.length; i += 1) {
      for (let j = i + 1; j < positions.length; j += 1) {
        if (positions[i].distanceTo(positions[j]) <= LINK_DISTANCE) {
          linkPoints.push(
            positions[i].x, positions[i].y, positions[i].z,
            positions[j].x, positions[j].y, positions[j].z,
          );
        }
      }
    }

    const linkGeometry = new THREE.BufferGeometry();
    linkGeometry.setAttribute("position", new THREE.Float32BufferAttribute(linkPoints, 3));
    const linkMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color("#9fb2ff"),
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    const links = new THREE.LineSegments(linkGeometry, linkMaterial);
    group.add(links);

    /* ---- 节点：点精灵 + 少量稍大的球体做层次 ---- */
    const nodeGeometry = new THREE.BufferGeometry().setFromPoints(positions);
    const nodeMaterial = new THREE.PointsMaterial({
      color: new THREE.Color("#ffffff"),
      size: 0.16,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const nodes = new THREE.Points(nodeGeometry, nodeMaterial);
    group.add(nodes);

    const haloGeometry = new THREE.BufferGeometry().setFromPoints(positions.filter((_, i) => i % 5 === 0));
    const haloMaterial = new THREE.PointsMaterial({
      color: new THREE.Color("#7f8cff"),
      size: 0.44,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
    group.add(new THREE.Points(haloGeometry, haloMaterial));

    /* ---- 一个极淡的线框球，给网络一个"边界感" ---- */
    const shell = new THREE.LineSegments(
      new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(SPHERE_RADIUS * 0.94, 1)),
      new THREE.LineBasicMaterial({
        color: new THREE.Color("#5f6fd8"),
        transparent: true,
        opacity: 0.085,
        depthWrite: false,
      }),
    );
    group.add(shell);

    /* ---- 指针视差 ---- */
    const pointer = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };

    function onPointerMove(event: PointerEvent) {
      target.x = (event.clientX / window.innerWidth - 0.5) * 0.9;
      target.y = (event.clientY / window.innerHeight - 0.5) * 0.6;
    }
    function onPointerLeave() {
      target.x = 0;
      target.y = 0;
    }
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerleave", onPointerLeave);

    /* ---- 尺寸 ---- */
    function resize() {
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    /* ---- 渲染循环 ---- */
    let frame = 0;
    let growth = 0;
    const clock = new THREE.Clock();

    function render() {
      const elapsed = clock.getElapsedTime();
      const progress = Math.min(Math.max(progressRef.current ?? 0, 0), 1);
      growth += (progress - growth) * (reducedMotion ? 1 : 0.06);

      const idle = reducedMotion ? 0 : elapsed;
      pointer.x += (target.x - pointer.x) * 0.05;
      pointer.y += (target.y - pointer.y) * 0.05;

      group.rotation.y = idle * 0.055 + pointer.x * 0.5;
      group.rotation.x = Math.sin(idle * 0.17) * 0.1 - pointer.y * 0.32;

      const breathe = 1 + Math.sin(idle * 0.5) * 0.018;
      group.scale.setScalar(breathe * (1 + growth * 0.06));

      // 进入过程中网络逐渐亮起
      linkMaterial.opacity = 0.16 + growth * 0.3;
      nodeMaterial.opacity = 0.55 + growth * 0.4;
      haloMaterial.opacity = 0.22 + growth * 0.34;
      shell.rotation.y = -idle * 0.03;

      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(render);
    }
    frame = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      linkGeometry.dispose();
      linkMaterial.dispose();
      nodeGeometry.dispose();
      nodeMaterial.dispose();
      haloGeometry.dispose();
      haloMaterial.dispose();
      shell.geometry.dispose();
      (shell.material as THREE.Material).dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === host) {
        host.removeChild(renderer.domElement);
      }
    };
  }, [progressRef]);

  return <div ref={hostRef} className={className ?? "landing-network"} aria-hidden="true" />;
}
