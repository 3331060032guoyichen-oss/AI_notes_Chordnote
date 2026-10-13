"use client";

import { useEffect, useRef } from "react";

/**
 * AI 知识星丛 —— 全屏 Canvas 动态背景
 *
 * 数据结构感优先：节点不是随机撒的，而是围绕 4 个「簇心」聚集，
 * 模拟「若干个知识分类，各自有若干条笔记」。
 * 跨簇之间也会连少量长线，读起来像分类之间的交叉引用。
 */

const NODE_COUNT = 48;
const LINK_DISTANCE = 0.17; // 归一化距离阈值
const CROSS_LINK_DISTANCE = 0.3; // 跨簇长线阈值
const COLORS = ["#2dd4bf", "#a5f3fc", "#c4b5fd"] as const;

/** 簇心（归一化坐标）+ 半径，模拟 4 个知识分类 */
const CLUSTERS = [
  { x: 0.2, y: 0.26, r: 0.15 },
  { x: 0.74, y: 0.22, r: 0.13 },
  { x: 0.3, y: 0.72, r: 0.14 },
  { x: 0.8, y: 0.7, r: 0.12 },
];

type StarNode = {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  cluster: number;
  radius: number;
  color: string;
  phase: number;
  speed: number;
  driftX: number;
  driftY: number;
  offsetX: number;
  offsetY: number;
};

function makeNodes(): StarNode[] {
  const nodes: StarNode[] = [];
  for (let i = 0; i < NODE_COUNT; i += 1) {
    const cluster = i % CLUSTERS.length;
    const center = CLUSTERS[cluster];
    const angle = Math.random() * Math.PI * 2;
    // 平方根分布，避免全部堆在簇心
    const dist = Math.sqrt(Math.random()) * center.r;
    const x = center.x + Math.cos(angle) * dist;
    const y = center.y + Math.sin(angle) * dist;
    nodes.push({
      x,
      y,
      baseX: x,
      baseY: y,
      cluster,
      radius: 0.9 + Math.random() * 1.5,
      color: COLORS[i % COLORS.length],
      phase: Math.random() * Math.PI * 2,
      speed: 0.25 + Math.random() * 0.5,
      driftX: (Math.random() - 0.5) * 0.012,
      driftY: (Math.random() - 0.5) * 0.012,
      offsetX: 0,
      offsetY: 0,
    });
  }
  return nodes;
}

export function LandingConstellation() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvasNode = canvasRef.current;
    if (!canvasNode) return;
    const canvas: HTMLCanvasElement = canvasNode;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ctx: CanvasRenderingContext2D = context;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let nodes = makeNodes();
    let frame = 0;
    const pointer = { x: -1, y: -1, active: false };

    function resize() {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      nodes = makeNodes();
    }

    function onPointerMove(event: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      pointer.x = (event.clientX - rect.left) / width;
      pointer.y = (event.clientY - rect.top) / height;
      pointer.active = true;
    }

    function onPointerLeave() {
      pointer.active = false;
    }

    function draw(time: number) {
      const t = reduced ? 0 : time / 1000;
      ctx.clearRect(0, 0, width, height);

      // 整体缓慢漂浮
      const globalX = Math.sin(t * 0.12) * 0.012;
      const globalY = Math.cos(t * 0.1) * 0.014;

      // 更新位置 + 鼠标视差排斥
      for (const node of nodes) {
        if (!reduced) {
          node.baseX += node.driftX * 0.0016;
          node.baseY += node.driftY * 0.0016;
          if (node.baseX < 0.04 || node.baseX > 0.96) node.driftX *= -1;
          if (node.baseY < 0.04 || node.baseY > 0.96) node.driftY *= -1;
        }

        const px = node.baseX + globalX;
        const py = node.baseY + globalY;

        if (pointer.active) {
          const dx = px - pointer.x;
          const dy = py - pointer.y;
          const d2 = dx * dx + dy * dy;
          const range = 0.16;
          if (d2 < range * range && d2 > 0.000001) {
            const d = Math.sqrt(d2);
            const push = (1 - d / range) * 0.026;
            node.offsetX += ((dx / d) * push - node.offsetX) * 0.12;
            node.offsetY += ((dy / d) * push - node.offsetY) * 0.12;
          } else {
            node.offsetX *= 0.94;
            node.offsetY *= 0.94;
          }
        } else {
          node.offsetX *= 0.95;
          node.offsetY *= 0.95;
        }

        node.x = px + node.offsetX;
        node.y = py + node.offsetY;
      }

      // 连线：细、白、低透明
      ctx.lineWidth = 0.6;
      for (let i = 0; i < nodes.length; i += 1) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j += 1) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const sameCluster = a.cluster === b.cluster;
          const limit = sameCluster ? LINK_DISTANCE : CROSS_LINK_DISTANCE;
          if (dist > limit) continue;
          const fade = 1 - dist / limit;
          // 跨簇的线更弱，读起来像「弱关联」
          const alpha = (sameCluster ? 0.1 : 0.045) * fade;
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a.x * width, a.y * height);
          ctx.lineTo(b.x * width, b.y * height);
          ctx.stroke();
        }
      }

      // 节点：呼吸闪烁
      for (const node of nodes) {
        const breathe = reduced
          ? 0.55
          : 0.3 + 0.25 * (1 + Math.sin(t * node.speed + node.phase));
        const cx = node.x * width;
        const cy = node.y * height;

        // 外光晕
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, node.radius * 5);
        glow.addColorStop(0, `${node.color}${Math.round(breathe * 160).toString(16).padStart(2, "0")}`);
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, node.radius * 5, 0, Math.PI * 2);
        ctx.fill();

        // 核心
        ctx.globalAlpha = Math.min(1, breathe + 0.2);
        ctx.fillStyle = node.color;
        ctx.beginPath();
        ctx.arc(cx, cy, node.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      frame = window.requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave);
    frame = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className="landing-constellation" aria-hidden="true" />;
}
