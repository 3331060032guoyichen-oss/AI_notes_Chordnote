"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Particles, { ParticlesProvider, useParticlesProvider } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import type { Engine, ISourceOptions } from "@tsparticles/engine";

/**
 * 五彩星尘 —— 基于 tsParticles 的工作台背景层。
 *
 * 规范要点：
 *   - 颜色只用极光色系，绝无纯红/纯绿
 *   - 粒子 1–3px，透明度 0.2–0.8 缓慢闪烁（眨眼）
 *   - 总数压在 80 以内，粒子多了就成了"下雪"，不是星尘
 *   - detectsOn: "window"，canvas 自身 pointer-events: none，不挡按钮
 *
 * 工作台（`APP_TUNING`）关掉鼠标交互（那边一直在写字、拖图谱，
 * 光点跟着光标反而是干扰），粒子更少、更暗、更慢 —— 它是背景，不是主角。
 */

const AURORA_COLORS = ["#2DD4BF", "#A5F3FC", "#C4B5FD", "#6EE7B7", "#FFFFFF"];

type StardustTuning = {
  /** 鼠标引力 + 连线。工作台关掉。 */
  interactive: boolean;
  count: number;
  opacity: [number, number];
  /** 连线透明度；`null` = 不画连线（窄屏省算力）。 */
  linkOpacity: number | null;
  speed: [number, number];
  fps: number;
};

const APP_TUNING: StardustTuning = {
  interactive: false,
  count: 46,
  opacity: [0.12, 0.5],
  linkOpacity: 0.05,
  speed: [0.1, 0.3],
  fps: 45,
};

const APP_MOBILE_TUNING: StardustTuning = {
  interactive: false,
  count: 20,
  opacity: [0.12, 0.5],
  linkOpacity: null,
  speed: [0.1, 0.3],
  fps: 45,
};

function buildOptions(tuning: StardustTuning): ISourceOptions {
  return {
    fullScreen: { enable: false },
    fpsLimit: tuning.fps,
    detectRetina: true,
    background: { color: { value: "transparent" } },
    interactivity: {
      detectsOn: "window",
      events: {
        onHover: { enable: tuning.interactive, mode: ["grab"] },
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
      number: { value: tuning.count, density: { enable: true, width: 1600, height: 1000 } },
      color: { value: AURORA_COLORS },
      shape: { type: "circle" },
      opacity: {
        value: { min: tuning.opacity[0], max: tuning.opacity[1] },
        animation: { enable: true, speed: 0.35, sync: false },
      },
      size: {
        value: { min: 1, max: 3 },
        animation: { enable: true, speed: 1.2, sync: false },
      },
      links: {
        enable: tuning.linkOpacity !== null,
        distance: 130,
        color: "#A5F3FC",
        opacity: tuning.linkOpacity ?? 0,
        width: 0.6,
      },
      move: {
        enable: true,
        speed: { min: tuning.speed[0], max: tuning.speed[1] },
        direction: "none",
        random: true,
        straight: false,
        outModes: { default: "out" },
      },
    },
  };
}

/** 只有引擎就绪后才挂载 canvas，避免首帧空转 */
function StardustCanvas({ id, className, options }: { id: string; className: string; options: ISourceOptions }) {
  const { loaded } = useParticlesProvider();
  if (!loaded) return null;
  return <Particles id={id} className={className} options={options} />;
}

/** 窄屏减量：粒子更少、不连线。两个入口共用这一套判断。 */
function useNarrowViewport() {
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 820px)");
    const sync = () => setIsNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return isNarrow;
}

function registerEngine(engine: Engine) {
  return loadSlim(engine);
}

/** 工作台背景的星尘（`app/globals.css` 的 `.app-stardust` 定位）。 */
export function AppStardust() {
  const register = useCallback(registerEngine, []);
  const isNarrow = useNarrowViewport();
  const options = useMemo(() => buildOptions(APP_TUNING), []);
  const mobileOptions = useMemo(() => buildOptions(APP_MOBILE_TUNING), []);

  return (
    <ParticlesProvider init={register}>
      <StardustCanvas
        id="app-stardust"
        className="app-stardust"
        options={isNarrow ? mobileOptions : options}
      />
    </ParticlesProvider>
  );
}
