"use client";

import { useEffect, useRef } from "react";

/**
 * 抚琴司天监 · Zhiyin
 *
 * 前景 SVG + 背景 Canvas 的双层结构，规范见 docs/AGENT_VISUAL_SPEC.md。
 * 只分两态：工作中（拨弦引星）与静息中（抚琴守望）。
 * Canvas 只在右栏挂载期间运行；prefers-reduced-motion 下只画一帧静态画面。
 */

export type AgentStageMode = "work" | "rest";

type Cloud = {
  rx: number;
  ry: number;
  radius: number;
  color: [number, number, number];
  alpha: number;
  speed: number;
  phase: number;
};

type StarNode = { rx: number; ry: number; r: number; color: string; phase: number };
type Particle = { t: number; speed: number; branch: number; offset: number; size: number; color: string; alpha: number };
type QuietStar = { rx: number; ry: number; r: number; phase: number };

const CLOUDS: Cloud[] = [
  { rx: 0.15, ry: 0.28, radius: 0.36, color: [235, 185, 85], alpha: 0.22, speed: 0.7, phase: 0.2 },
  { rx: 0.32, ry: 0.18, radius: 0.38, color: [255, 210, 110], alpha: 0.2, speed: 0.9, phase: 1.4 },
  { rx: 0.52, ry: 0.22, radius: 0.42, color: [230, 175, 80], alpha: 0.19, speed: 0.6, phase: 2.5 },
  { rx: 0.78, ry: 0.24, radius: 0.38, color: [245, 195, 95], alpha: 0.22, speed: 0.8, phase: 3.8 },
  { rx: 0.88, ry: 0.45, radius: 0.32, color: [230, 180, 85], alpha: 0.16, speed: 1.1, phase: 4.5 },
  { rx: 0.12, ry: 0.55, radius: 0.32, color: [235, 185, 90], alpha: 0.17, speed: 0.85, phase: 5.2 },
  { rx: 0.24, ry: 0.38, radius: 0.35, color: [70, 130, 255], alpha: 0.18, speed: 0.75, phase: 0.9 },
  { rx: 0.66, ry: 0.16, radius: 0.4, color: [85, 155, 255], alpha: 0.2, speed: 0.65, phase: 2.1 },
  { rx: 0.82, ry: 0.34, radius: 0.34, color: [65, 190, 255], alpha: 0.16, speed: 0.95, phase: 3.3 },
  { rx: 0.42, ry: 0.46, radius: 0.36, color: [80, 115, 240], alpha: 0.15, speed: 0.8, phase: 4.8 },
  { rx: 0.38, ry: 0.28, radius: 0.28, color: [225, 75, 65], alpha: 0.14, speed: 1, phase: 1.7 },
  { rx: 0.62, ry: 0.36, radius: 0.3, color: [210, 80, 140], alpha: 0.13, speed: 0.85, phase: 2.9 },
  { rx: 0.18, ry: 0.14, radius: 0.26, color: [165, 95, 245], alpha: 0.14, speed: 0.7, phase: 4.1 },
  { rx: 0.48, ry: 0.68, radius: 0.28, color: [255, 215, 125], alpha: 0.24, speed: 1.3, phase: 0 },
];

const NODES: StarNode[] = [
  { rx: 0.06, ry: 0.56, r: 4.2, color: "#e6b85c", phase: 0.1 },
  { rx: 0.09, ry: 0.34, r: 5, color: "#6ea2ff", phase: 0.8 },
  { rx: 0.16, ry: 0.16, r: 5.8, color: "#ffd97d", phase: 1.5 },
  { rx: 0.25, ry: 0.28, r: 6.2, color: "#f5c869", phase: 2.1 },
  { rx: 0.22, ry: 0.46, r: 4.8, color: "#5c85ff", phase: 2.9 },
  { rx: 0.34, ry: 0.12, r: 6.8, color: "#5271ff", phase: 0.4 },
  { rx: 0.38, ry: 0.36, r: 5.2, color: "#e04836", phase: 1.9 },
  { rx: 0.48, ry: 0.18, r: 6, color: "#e04836", phase: 0.7 },
  { rx: 0.53, ry: 0.08, r: 5, color: "#ffd97d", phase: 2.6 },
  { rx: 0.6, ry: 0.26, r: 6.5, color: "#5c85ff", phase: 1.8 },
  { rx: 0.54, ry: 0.4, r: 5.2, color: "#e04836", phase: 2.7 },
  { rx: 0.72, ry: 0.12, r: 6.2, color: "#ffd97d", phase: 0.5 },
  { rx: 0.75, ry: 0.28, r: 5.5, color: "#8ab4ff", phase: 1.4 },
  { rx: 0.66, ry: 0.46, r: 4.8, color: "#e6b85c", phase: 3.1 },
  { rx: 0.86, ry: 0.16, r: 5.6, color: "#6ea2ff", phase: 1.6 },
  { rx: 0.92, ry: 0.32, r: 5, color: "#ffd97d", phase: 2.3 },
  { rx: 0.85, ry: 0.5, r: 4.5, color: "#e04836", phase: 3.6 },
  { rx: 0.94, ry: 0.62, r: 4, color: "#e6b85c", phase: 0.9 },
];

const EDGES: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [1, 3],
  [2, 5], [3, 5], [3, 6], [4, 6], [5, 7], [6, 7],
  [5, 8], [7, 8], [7, 9], [6, 10], [7, 10], [9, 10],
  [8, 11], [9, 11], [9, 12], [10, 12], [10, 13], [12, 13],
  [11, 14], [12, 14], [12, 15], [14, 15], [13, 16], [15, 16], [16, 17],
];

const METEORS = [
  { x: 0.48, y: 0.14, len: 65, delay: 0 },
  { x: 0.82, y: 0.08, len: 78, delay: 1.4 },
  { x: 0.25, y: 0.18, len: 55, delay: 2.6 },
];

const PARTICLE_COLORS = ["#ffd875", "#75afff", "#ff6a52"];

function cubicBezier(p0: number, p1: number, p2: number, p3: number, t: number) {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** 五路贝塞尔发散的起点与终点（相对画布）。 */
function branchHead(branch: number, w: number, h: number, t: number): [number, number] {
  switch (branch) {
    case 0: return [cubicBezier(w * 0.4, w * 0.22, w * 0.1, w * 0.02, t), cubicBezier(h * 0.7, h * 0.64, h * 0.5, h * 0.32, t)];
    case 1: return [cubicBezier(w * 0.44, w * 0.28, w * 0.2, w * 0.12, t), cubicBezier(h * 0.68, h * 0.48, h * 0.26, h * 0.06, t)];
    case 2: return [cubicBezier(w * 0.5, w * 0.38, w * 0.62, w * 0.48, t), cubicBezier(h * 0.66, h * 0.42, h * 0.22, h * 0.04, t)];
    case 3: return [cubicBezier(w * 0.58, w * 0.68, w * 0.78, w * 0.88, t), cubicBezier(h * 0.66, h * 0.44, h * 0.24, h * 0.06, t)];
    default: return [cubicBezier(w * 0.62, w * 0.76, w * 0.88, w * 0.98, t), cubicBezier(h * 0.68, h * 0.58, h * 0.46, h * 0.28, t)];
  }
}

function createParticle(randomProgress: boolean): Particle {
  return {
    t: randomProgress ? Math.random() : 0,
    speed: 0.16 + Math.random() * 0.22,
    branch: Math.floor(Math.random() * 5),
    offset: (Math.random() - 0.5) * 95,
    size: 1 + Math.random() * 3,
    color: PARTICLE_COLORS[Math.random() > 0.62 ? (Math.random() > 0.5 ? 1 : 2) : 0],
    alpha: 0.35 + Math.random() * 0.65,
  };
}

export function AgentStage({ mode }: { mode: AgentStageMode }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const burstRef = useRef(0);
  const work = mode === "work";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const particles: Particle[] = [];
    const quietStars: QuietStar[] = [];
    if (work) for (let i = 0; i < 145; i += 1) particles.push(createParticle(true));
    for (let i = 0; i < 36; i += 1) {
      quietStars.push({ rx: 0.1 + Math.random() * 0.8, ry: 0.08 + Math.random() * 0.65, r: 0.8 + Math.random() * 1.5, phase: Math.random() * Math.PI * 2 });
    }

    let width = 0;
    let height = 0;
    let raf = 0;
    let last = 0;
    let time = 0;
    let burstAt = -10;
    let seenBurst = burstRef.current;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduced) drawStatic();
    };

    const drawClouds = (t: number) => {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      CLOUDS.forEach((cloud) => {
        const cx = cloud.rx * width + Math.sin(t * cloud.speed + cloud.phase) * 28;
        const cy = cloud.ry * height + Math.cos(t * cloud.speed * 0.8 + cloud.phase) * 22;
        const radius = Math.max(width, height) * cloud.radius * (0.9 + 0.15 * Math.sin(t * 1.1 + cloud.phase));
        const [r, g, b] = cloud.color;
        const alpha = cloud.alpha * (0.8 + 0.25 * Math.sin(t * 1.3 + cloud.phase));
        const gradient = ctx.createRadialGradient(cx, cy, radius * 0.05, cx, cy, radius);
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
        gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${alpha * 0.45})`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    };

    const drawRibbons = (t: number) => {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.lineCap = "round";
      for (let i = 0; i < 4; i += 1) {
        const wave = Math.sin(t * 1.3 + i * 0.9) * 18;
        const gradient = ctx.createLinearGradient(width * 0.45, height * 0.7, width * 0.02, height * (0.12 + i * 0.1));
        gradient.addColorStop(0, "rgba(255, 220, 125, 0.06)");
        gradient.addColorStop(0.45, i === 2 ? "rgba(95, 160, 255, 0.18)" : `rgba(235, 188, 92, ${0.22 - i * 0.035})`);
        gradient.addColorStop(1, "rgba(230, 184, 92, 0)");
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 38 - i * 6;
        ctx.beginPath();
        ctx.moveTo(width * 0.42, height * 0.7);
        ctx.bezierCurveTo(width * 0.22, height * (0.62 - i * 0.05) + wave, width * 0.14, height * (0.36 - i * 0.04) - wave, width * 0.02, height * (0.14 + i * 0.11) + wave * 0.6);
        ctx.stroke();
      }
      for (let i = 0; i < 4; i += 1) {
        const wave = Math.cos(t * 1.2 + i * 0.8) * 20;
        const gradient = ctx.createLinearGradient(width * 0.58, height * 0.68, width * 0.98, height * (0.1 + i * 0.11));
        gradient.addColorStop(0, "rgba(255, 220, 125, 0.08)");
        gradient.addColorStop(0.5, i % 2 === 1 ? "rgba(90, 165, 255, 0.2)" : `rgba(240, 192, 95, ${0.24 - i * 0.04})`);
        gradient.addColorStop(1, "rgba(230, 184, 92, 0)");
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 40 - i * 6;
        ctx.beginPath();
        ctx.moveTo(width * 0.58, height * 0.68);
        ctx.bezierCurveTo(width * 0.72, height * (0.5 - i * 0.04) - wave, width * 0.82, height * (0.3 - i * 0.03) + wave, width * 0.98, height * (0.1 + i * 0.12) - wave * 0.5);
        ctx.stroke();
      }
      const archWave = Math.sin(t * 0.9) * 16;
      const arch = ctx.createLinearGradient(width * 0.08, height * 0.28, width * 0.92, height * 0.22);
      arch.addColorStop(0, "rgba(230, 184, 92, 0)");
      arch.addColorStop(0.3, "rgba(235, 190, 95, 0.16)");
      arch.addColorStop(0.55, "rgba(105, 165, 255, 0.18)");
      arch.addColorStop(0.8, "rgba(245, 200, 105, 0.16)");
      arch.addColorStop(1, "rgba(230, 184, 92, 0)");
      ctx.strokeStyle = arch;
      ctx.lineWidth = 46;
      ctx.beginPath();
      ctx.moveTo(width * 0.06, height * 0.32);
      ctx.bezierCurveTo(width * 0.32, height * 0.06 + archWave, width * 0.68, height * 0.06 - archWave, width * 0.94, height * 0.28);
      ctx.stroke();
      ctx.restore();
    };

    const drawStardust = (t: number) => {
      for (let i = 0; i < 95; i += 1) {
        const x = ((i * 0.618 + t * 0.006) % 1) * width;
        const y = ((i * 0.377 - t * 0.009) % 1 + 1) % 1 * height;
        const alpha = 0.12 + 0.3 * (0.5 + 0.5 * Math.sin(t * 2.2 + i));
        ctx.fillStyle = i % 4 === 0 ? "#99c2ff" : "#ffe299";
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(x, y, 0.7 + (i % 5) * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const drawNetwork = (t: number) => {
      const points = NODES.map((node) => ({
        x: node.rx * width + Math.sin(t * 1.2 + node.phase) * 7,
        y: node.ry * height + Math.cos(t + node.phase) * 7,
        r: node.r,
        color: node.color,
        phase: node.phase,
      }));

      EDGES.forEach(([a, b], index) => {
        const from = points[a];
        const to = points[b];
        const pulse = 0.22 + 0.38 * (0.5 + 0.5 * Math.sin(t * 1.5 + index * 0.6));
        ctx.save();
        ctx.strokeStyle = `rgba(235, 192, 105, ${pulse})`;
        ctx.lineWidth = 1.1;
        if (index % 2 === 0) ctx.setLineDash([4, 5]);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.restore();
      });

      points.forEach((point) => {
        const scale = 0.85 + 0.3 * Math.sin(t * 2.1 + point.phase);
        const glow = ctx.createRadialGradient(point.x, point.y, 1, point.x, point.y, point.r * 3.6);
        glow.addColorStop(0, point.color);
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(point.x, point.y, point.r * 3.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = point.color;
        ctx.beginPath();
        ctx.arc(point.x, point.y, point.r * scale, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    const drawParticles = (dt: number, t: number) => {
      particles.forEach((particle) => {
        particle.t += particle.speed * dt;
        if (particle.t > 1) particle.t = 0;
        const [x, y] = branchHead(particle.branch, width, height, particle.t);
        const px = x + particle.offset * particle.t;
        const py = y + Math.sin(particle.t * 7 + t) * 11;
        const fade = Math.sin(particle.t * Math.PI);
        ctx.save();
        ctx.globalAlpha = particle.alpha * fade;
        ctx.fillStyle = particle.color;
        ctx.shadowColor = particle.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(px, py, particle.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    };

    const drawMeteors = (t: number) => {
      METEORS.forEach((meteor) => {
        const cycle = (t * 0.45 + meteor.delay) % 3.6;
        if (cycle >= 1.2) return;
        const progress = cycle / 1.2;
        const x = (meteor.x - progress * 0.24) * width;
        const y = (meteor.y + progress * 0.19) * height;
        const tailX = x + meteor.len;
        const tailY = y - meteor.len * 0.75;
        const gradient = ctx.createLinearGradient(x, y, tailX, tailY);
        gradient.addColorStop(0, "rgba(255, 240, 185, 0.95)");
        gradient.addColorStop(1, "rgba(230, 184, 92, 0)");
        ctx.save();
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();
        ctx.fillStyle = "#fff5d6";
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    };

    const drawQuietStars = (t: number) => {
      quietStars.forEach((star) => {
        const alpha = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(t * 0.7 + star.phase));
        ctx.fillStyle = `rgba(230, 198, 130, ${alpha})`;
        ctx.beginPath();
        ctx.arc(star.rx * width, star.ry * height, star.r, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    const drawBurst = (t: number) => {
      const age = t - burstAt;
      if (age < 0 || age > 0.9) return;
      const progress = age / 0.9;
      const radius = Math.max(width, height) * (0.18 + progress * 0.6);
      const gradient = ctx.createRadialGradient(width * 0.5, height * 0.62, 1, width * 0.5, height * 0.62, radius);
      gradient.addColorStop(0, `rgba(255, 235, 170, ${0.5 * (1 - progress)})`);
      gradient.addColorStop(0.45, `rgba(120, 165, 255, ${0.22 * (1 - progress)})`);
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(width * 0.5, height * 0.62, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const drawRest = (t: number) => {
      ctx.clearRect(0, 0, width, height);
      drawQuietStars(t);
    };

    const drawWork = (dt: number, t: number) => {
      ctx.clearRect(0, 0, width, height);
      drawClouds(t);
      drawRibbons(t);
      drawStardust(t);
      drawNetwork(t);
      drawParticles(dt, t);
      drawMeteors(t);
      drawBurst(t);
    };

    const drawStatic = () => {
      ctx.clearRect(0, 0, width, height);
      if (work) {
        drawClouds(0);
        drawRibbons(0);
        drawNetwork(0);
      } else {
        drawQuietStars(0);
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000) || 0.016;
      last = now;
      time += dt;
      if (burstRef.current !== seenBurst) {
        seenBurst = burstRef.current;
        burstAt = time;
        for (let i = 0; i < 45; i += 1) {
          const particle = createParticle(false);
          particle.speed *= 1.7;
          particle.size *= 1.35;
          particles.push(particle);
        }
        if (particles.length > 230) particles.splice(0, particles.length - 230);
      }
      if (work) drawWork(dt, time);
      else drawRest(time);
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (raf || reduced) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      if (!raf) return;
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    // 长对话里舞台会被滚出视口；滚出去就停掉绘制，回来再继续。
    const visibility = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) start();
      else stop();
    }, { threshold: 0.05 });
    visibility.observe(canvas);
    resize();
    if (!reduced) start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      observer.disconnect();
      visibility.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [work]);

  return (
    <div className={`agent-stage${work ? " is-work" : " is-rest"}`}>
      <header className="agent-stage-title">
        <b>{work ? "工作中 · 拨弦引星" : "静息中 · 抚琴守望"}</b>
        <small>{work ? "ZHIYIN IN OPERATION" : "ZHIYIN AT REST"}</small>
      </header>

      <div className="agent-stage-frame">
        <canvas ref={canvasRef} className="agent-stage-canvas" aria-hidden="true" />
        {work ? (
          <button
            type="button"
            className="agent-stage-hit"
            aria-label="点击星图，激起更强的星云流光"
            onClick={() => { burstRef.current += 1; }}
          />
        ) : null}
        <svg className="agent-stage-art" viewBox="0 0 500 460" aria-hidden="true" focusable="false">
          <defs>
            <radialGradient id="agent-stage-lantern" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fff3c4" stopOpacity="1" />
              <stop offset="55%" stopColor="#f2b84b" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#e69020" stopOpacity="0" />
            </radialGradient>
          </defs>

          <circle className="agent-stage-orbit" cx="250" cy="255" r="195" />
          <circle className="agent-stage-orbit is-inner" cx="250" cy="255" r="165" />

          <g className="agent-stage-watermark" transform="translate(38 325) rotate(-22)">
            <rect x="0" y="6" width="8" height="68" rx="2" />
            <rect x="8" y="10" width="54" height="60" />
            <rect x="62" y="6" width="8" height="68" rx="2" />
            <line x1="22" y1="22" x2="22" y2="58" />
            <line x1="35" y1="22" x2="35" y2="58" />
            <line x1="48" y1="22" x2="48" y2="58" />
          </g>
          <g className="agent-stage-watermark" transform="translate(380 330)">
            <circle cx="38" cy="38" r="32" />
            <circle cx="38" cy="38" r="24" />
            <line x1="14" y1="14" x2="62" y2="62" />
            <line x1="62" y1="14" x2="14" y2="62" />
            <line x1="12" y1="76" x2="64" y2="76" />
          </g>

          <g transform="translate(328 130)">
            <g className="agent-stage-lantern">
              <circle className="agent-stage-lantern-glow" cx="36" cy="52" r="52" fill="url(#agent-stage-lantern)" />
              <circle cx="36" cy="6" r="4" fill="none" stroke="var(--zhiyin-gold)" strokeWidth="1.8" />
              <path d="M 4 28 Q 22 22 36 10 Q 50 22 68 28 L 58 31 L 14 31 Z" fill="var(--zhiyin-lantern-frame)" stroke="var(--zhiyin-gold)" strokeWidth="1.8" />
              <rect x="16" y="31" width="40" height="44" fill="var(--zhiyin-lantern-fill)" fillOpacity="0.9" stroke="var(--zhiyin-gold)" strokeWidth="2" />
              <line x1="28" y1="31" x2="28" y2="75" stroke="var(--zhiyin-lantern-rib)" strokeWidth="1.5" />
              <line x1="44" y1="31" x2="44" y2="75" stroke="var(--zhiyin-lantern-rib)" strokeWidth="1.5" />
              <rect x="13" y="75" width="46" height="5" fill="var(--zhiyin-lantern-frame)" stroke="var(--zhiyin-gold)" strokeWidth="1.6" />
            </g>
          </g>

          <g className="agent-stage-body">
            <polygon points="235,202 145,420 265,420" fill="var(--zhiyin-blue-robe)" stroke="var(--zhiyin-blue-border)" strokeWidth="2.5" strokeLinejoin="round" />
            <polygon points="235,202 302,228 345,420 265,420" fill="var(--zhiyin-red-robe)" stroke="#151926" strokeWidth="2" strokeLinejoin="round" />
          </g>

          <g className="agent-stage-head">
            <rect x="220" y="116" width="30" height="26" fill="var(--zhiyin-hat)" stroke="var(--zhiyin-gold)" strokeWidth="2.2" />
            <line x1="208" y1="130" x2="262" y2="130" stroke="var(--zhiyin-gold)" strokeWidth="3.2" strokeLinecap="round" />
            <circle cx="235" cy="168" r="26" fill="var(--zhiyin-skin)" />
            <line x1="228" y1="164" x2="237" y2="164" stroke="#151821" strokeWidth="3" strokeLinecap="round" />
            <line x1="243" y1="164" x2="252" y2="164" stroke="#151821" strokeWidth="3" strokeLinecap="round" />
          </g>

          <g className="agent-stage-qin">
            <polygon points="118,325 362,310 372,352 128,365" fill="#131826" stroke="var(--zhiyin-gold)" strokeWidth="3" strokeLinejoin="round" />
            <line className="agent-stage-string" x1="135" y1="336" x2="352" y2="322" stroke="#4a68d8" strokeWidth="2" strokeLinecap="round" />
            <line className="agent-stage-string" x1="137" y1="346" x2="355" y2="332" stroke="#d93829" strokeWidth="2" strokeLinecap="round" />
            <line className="agent-stage-string" x1="139" y1="355" x2="358" y2="342" stroke="#e6b85c" strokeWidth="2" strokeLinecap="round" />
          </g>

          <g className="agent-stage-ripples">
            <circle className="agent-stage-ripple" cx="182" cy="340" r="10" />
            <circle className="agent-stage-ripple is-delay-1" cx="182" cy="340" r="10" />
            <circle className="agent-stage-ripple is-delay-2" cx="182" cy="340" r="10" />
            <circle className="agent-stage-ripple is-delay-1" cx="305" cy="328" r="10" />
            <circle className="agent-stage-ripple is-delay-2" cx="305" cy="328" r="10" />
            <circle className="agent-stage-ripple is-delay-3" cx="305" cy="328" r="10" />
          </g>

          <g className="agent-stage-hands is-work">
            <polygon className="agent-stage-hand is-left" points="165,305 182,302 195,342 180,346" fill="var(--zhiyin-skin)" />
            <polygon className="agent-stage-hand is-right" points="315,288 330,295 312,334 297,328" fill="var(--zhiyin-skin)" />
          </g>
          <g className="agent-stage-hands is-rest">
            <polygon points="170,326 205,321 212,333 177,340" fill="var(--zhiyin-skin)" />
            <polygon points="286,316 320,311 327,323 293,330" fill="var(--zhiyin-skin)" />
          </g>
        </svg>
      </div>

      <div className="agent-stage-footer">
        <span className="agent-stage-state"><i aria-hidden="true" />{work ? "Agent 运行中" : "Agent 待命中"}</span>
        {work ? (
          <button type="button" className="agent-stage-burst" onClick={() => { burstRef.current += 1; }}>点击星图 · 激起星云</button>
        ) : (
          <span className="agent-stage-note">星云隐去 · 归于静谧</span>
        )}
      </div>
    </div>
  );
}
