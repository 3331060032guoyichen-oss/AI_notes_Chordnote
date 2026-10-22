"use client";

import { useEffect, useRef, useState } from "react";
import { LandingKnowledgeScene } from "./landing-knowledge-scene";

type LandingPageProps = {
  onEnter: () => void;
};

const CHAPTERS = [
  {
    eyebrow: "01 / LONG-TERM MEMORY",
    title: "从记录开始。",
    subtitle: "和理解一起生长。",
    body: "让零散记录不再停在文件夹里，而是逐渐长成一张能陪你四年的知识网络。",
  },
  {
    eyebrow: "02 / FROM NOTE TO CHORD",
    title: "一条笔记是音符，\n连起来才是和弦。",
    body: "课堂笔记、阅读摘录、突然冒出的灵感。知音帮你提炼其中的概念，找到跨越课程的联系，让每一次记录都成为下一次理解的起点。",
  },
  {
    eyebrow: "03 / LLM WIKI × OBSIDIAN",
    title: "工作流有规则，\n知识网络有记忆。",
    body: "原始记录始终保留。知音依据你的整理规则提出知识页与关联，默认由你审阅后收录；双向链接让每一份理解都有迹可循。",
  },
  {
    eyebrow: "04 / DESIGN ORIGIN",
    title: "清晰，克制，\n让内容成为主角。",
    body: "把空间留给思考，把层次交给文字。用熟悉的文档、清晰的目录和安静的反馈，让注意力回到正在写下的这一行。",
  },
] as const;

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smoothstep = (value: number) => {
  const x = clamp(value);
  return x * x * (3 - 2 * x);
};

export function LandingPage({ onEnter }: LandingPageProps) {
  const pageRef = useRef<HTMLElement | null>(null);
  const storyRef = useRef<HTMLElement | null>(null);
  const [activeChapter, setActiveChapter] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const page = pageRef.current;
    const story = storyRef.current;
    if (!page || !story) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReducedMotion(reduceMotion);

    const paint = () => {
      const rect = story.getBoundingClientRect();
      const travel = Math.max(1, rect.height - window.innerHeight);
      const progress = clamp(-rect.top / travel);
      const night = smoothstep((progress - 0.5) / 0.45);
      const graph = smoothstep((progress - 0.38) / 0.34);
      const closeUp = smoothstep(progress / 0.44) * (1 - smoothstep((progress - 0.58) / 0.32));
      const sceneScale = 1 + closeUp * 0.29 + graph * 0.04;
      const sceneX = (-7 * closeUp + 3 * graph).toFixed(3);
      const sceneY = (-5 * closeUp + 1.5 * graph).toFixed(3);

      page.style.setProperty("--story-progress", progress.toFixed(4));
      page.style.setProperty("--night-progress", night.toFixed(4));
      page.style.setProperty("--graph-progress", graph.toFixed(4));
      page.style.setProperty("--scene-scale", sceneScale.toFixed(4));
      page.style.setProperty("--scene-x", `${sceneX}vw`);
      page.style.setProperty("--scene-y", `${sceneY}vh`);
      page.style.setProperty("--graph-offset", `${(1 - graph) * 1180}px`);

      const nextChapter = Math.min(CHAPTERS.length - 1, Math.floor(clamp(progress * CHAPTERS.length, 0, 3.999)));
      setActiveChapter((previous) => previous === nextChapter ? previous : nextChapter);
    };

    paint();
    window.addEventListener("scroll", paint, { passive: true });
    window.addEventListener("resize", paint);
    return () => {
      window.removeEventListener("scroll", paint);
      window.removeEventListener("resize", paint);
    };
  }, []);

  return (
    <main ref={pageRef} className="landing landing-film">
      <a className="landing-film-skip" href="#landing-story">跳到介绍内容</a>

      <header className="landing-film-nav">
        <a className="landing-film-brand" href="#landing-top" aria-label="Chordnote 首页">
          <span className="landing-film-brand-grid" aria-hidden="true"><i /><i /><i /><i /></span>
          <strong>Chordnote</strong>
        </a>
        <nav aria-label="入口页章节">
          <a href="#landing-idea">理念</a>
          <a href="#landing-architecture">架构</a>
          <a href="#landing-design">设计</a>
        </nav>
        <button type="button" onClick={onEnter}>进入工作台 <span aria-hidden="true">↗</span></button>
      </header>

      <section id="landing-top" className="landing-film-opening" aria-label="Chordnote 入口">
        <p className="landing-film-coordinate" aria-hidden="true">记录 / 理解 / 连接</p>
        <p className="landing-film-hand landing-film-hand--left" aria-hidden="true">NOTES BECOME CHORDS</p>
        <h1 className="landing-film-opening-title">
          <span>Chordnote<span className="landing-film-title-dot">.</span></span>
          <strong>你的长期 AI<br />知识架构师</strong>
        </h1>
        <a className="landing-film-scroll-cue" href="#landing-story">
          <span>向下滚动</span><i aria-hidden="true">↓</i>
        </a>
      </section>

      <section
        ref={storyRef}
        id="landing-story"
        className="landing-film-story"
        data-active-chapter={activeChapter}
        aria-label="Chordnote 连续滚动介绍"
      >
        <span id="landing-idea" className="landing-film-marker landing-film-marker--idea" aria-hidden="true" />
        <span id="landing-architecture" className="landing-film-marker landing-film-marker--architecture" aria-hidden="true" />
        <span id="landing-design" className="landing-film-marker landing-film-marker--design" aria-hidden="true" />
        <div className="landing-film-sticky">
          <div className="landing-film-sky" aria-hidden="true">
            <span className="landing-film-sun" />
            <span className="landing-film-moon" />
            <span className="landing-film-stars" />
          </div>

          <div className="landing-film-scene" aria-hidden="true">
            <LandingKnowledgeScene />
          </div>

          <div className="landing-film-chapters">
            {CHAPTERS.map((chapter, index) => (
              <article
                key={chapter.eyebrow}
                className={`landing-film-chapter landing-film-chapter--${index + 1}`}
                aria-hidden={!reducedMotion && activeChapter !== index}
              >
                <p>{chapter.eyebrow}</p>
                <h2>{chapter.title}</h2>
                {"subtitle" in chapter && <h3>{chapter.subtitle}</h3>}
                <div>{chapter.body}</div>
              </article>
            ))}
          </div>

          <ol className="landing-film-progress" aria-label="介绍进度">
            {CHAPTERS.map((chapter, index) => (
              <li key={chapter.eyebrow} className={index === activeChapter ? "is-active" : ""}>
                <span>{String(index + 1).padStart(2, "0")}</span>
              </li>
            ))}
          </ol>

          <p className="landing-film-direction" aria-hidden="true">SCROLL TO CONNECT <span>↓</span></p>
        </div>
      </section>

      <section className="landing-film-closing" aria-label="开始使用 Chordnote">
        <p>RAW → DRAFT → KNOWLEDGE → GRAPH</p>
        <h2>把四年的学习，<br />连成自己的和弦。</h2>
        <button type="button" onClick={onEnter}>进入工作台 <span aria-hidden="true">↗</span></button>
      </section>

      <footer className="landing-film-footer">
        <span>Chordnote · 和弦</span>
        <span>原话始终保留，知识由你做主。</span>
      </footer>
    </main>
  );
}
