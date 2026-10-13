"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Particles, { ParticlesProvider, useParticlesProvider } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { Engine, ISourceOptions } from "@tsparticles/engine";

/**
 * 五彩星尘 —— 基于 tsParticles 的背景交互层
 *
 * 规范要点：
 *   - 颜色只用极光色系，绝无纯红/纯绿
 *   - 粒子 1–3px，透明度 0.2–0.8 缓慢闪烁（眨眼）
 *   - 鼠标 150px 半径引力（grab）+ 极淡连线（0.1）
 *   - 总数压在 80 以内，fpsLimit 60，移动端减量并关闭鼠标交互
 *   - detectsOn: "window"，canvas 自身 pointer-events: none，不挡按钮
 */

const AURORA_COLORS = ["#2DD4BF", "#A5F3FC", "#C4B5FD", "#6EE7B7", "#FFFFFF"];

function buildOptions(): ISourceOptions {
  return {
    fullScreen: { enable: false },
    fpsLimit: 60,
    detectRetina: true,
    background: { color: { value: "transparent" } },
    interactivity: {
      detectsOn: "window",
      events: {
        onHover: { enable: true, mode: ["grab"] },
        onClick: { enable: false },
        resize: { enable: true },
      },
      modes: {
        grab: {
          distance: 150,
          links: { opacity: 0.1, color: "#A5F3FC" },
        },
      },
    },
    particles: {
      number: { value: 70, density: { enable: true, width: 1600, height: 1000 } },
      color: { value: AURORA_COLORS },
      shape: { type: "circle" },
      opacity: {
        value: { min: 0.2, max: 0.8 },
        animation: { enable: true, speed: 0.35, sync: false },
      },
      size: {
        value: { min: 1, max: 3 },
        animation: { enable: true, speed: 1.2, sync: false },
      },
      links: {
        enable: true,
        distance: 130,
        color: "#A5F3FC",
        opacity: 0.06,
        width: 0.6,
      },
      move: {
        enable: true,
        speed: { min: 0.15, max: 0.5 },
        direction: "none",
        random: true,
        straight: false,
        outModes: { default: "out" },
      },
    },
  };
}

function buildMobileOptions(base: ISourceOptions): ISourceOptions {
  return {
    ...base,
    interactivity: {
      detectsOn: "window",
      events: { onHover: { enable: false }, resize: { enable: true } },
    },
    particles: {
      ...base.particles,
      number: { value: 28 },
      links: { enable: false },
      move: { enable: true, speed: 0.25, direction: "none", outModes: { default: "out" } },
    },
  };
}

/** 只有引擎就绪后才挂载 canvas，避免首帧空转 */
function StardustCanvas({ options }: { options: ISourceOptions }) {
  const { loaded } = useParticlesProvider();
  if (!loaded) return null;
  return <Particles id="landing-stardust" className="landing-stardust" options={options} />;
}

export function LandingStardust() {
  const register = useCallback(async (engine: Engine) => {
    await loadSlim(engine);
  }, []);

  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 820px)");
    const sync = () => setIsNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const options = useMemo(() => buildOptions(), []);
  const mobileOptions = useMemo(() => buildMobileOptions(buildOptions()), []);

  return (
    <ParticlesProvider init={register}>
      <StardustCanvas options={isNarrow ? mobileOptions : options} />
    </ParticlesProvider>
  );
}
