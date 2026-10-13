"use client";

import { useEffect, useRef } from "react";
import { LandingConstellation } from "./landing-constellation";

type LandingPageProps = {
  onEnter: () => void;
};

const FEATURES = [
  {
    index: "01",
    title: "原始记录",
    body: "用户可改，AI 不可改。你的原话永远是第一手材料，任何整理都不能篡改它。",
    glyph: "✎",
  },
  {
    index: "02",
    title: "AI 提议，你确认",
    body: "AI 只产出草稿与关联建议，落库与否由你决定 —— 网络里不会出现你没点头的东西。",
    glyph: "◈",
  },
  {
    index: "03",
    title: "双向链接",
    body: "知识页彼此引用，反向链接自动浮现。谁引用过它，一眼就看见。",
    glyph: "⇄",
  },
  {
    index: "04",
    title: "看见网络",
    body: "图谱从真实的关联里长出来，节点大小跟着被引用次数走，缺口一眼看得到。",
    glyph: "◉",
  },
] as const;

const STEPS = [
  { order: "1", title: "留下原话", body: "课上怎么记就怎么写，不需要先想好分类。" },
  { order: "2", title: "让 AI 整理", body: "它读你已有的库，提出归纳页与可能的关系。" },
  { order: "3", title: "你确认", body: "点下接受的那一刻，关系才真正成立。" },
] as const;

export function LandingPage({ onEnter }: LandingPageProps) {
  const pageRef = useRef<HTMLElement | null>(null);

  // 滚动进度：驱动玻璃卡的浮起与光斑位移
  useEffect(() => {
    function onScroll() {
      const span = Math.max(1, window.innerHeight);
      const progress = Math.min(window.scrollY / span, 1);
      pageRef.current?.style.setProperty("--scroll-progress", progress.toFixed(3));
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <main ref={pageRef} className="landing">
      <div className="landing-blobs" aria-hidden="true">
        <span className="blob blob-1" />
        <span className="blob blob-2" />
        <span className="blob blob-3" />
        <span className="blob blob-4" />
        <span className="blob blob-5" />
        <span className="blob blob-6" />
      </div>
      <div className="landing-grain" aria-hidden="true" />
      <LandingConstellation />

      <div className="landing-content">
        <header className="landing-nav">
          <div className="landing-nav-inner">
            <div className="landing-brand">
              <span className="landing-brand-mark">C</span>
              <strong>Chordnote</strong>
            </div>
            <nav className="landing-links" aria-label="页面导航">
              <a href="#features">特点</a>
              <a href="#flow">工作方式</a>
            </nav>
            <button className="landing-nav-cta" type="button" data-sound="press" onClick={onEnter}>
              进入编辑室
            </button>
          </div>
        </header>

        <section className="landing-hero" aria-label="Chordnote 简介">
          {/* 悬浮 UI 碎片：全息投影式装饰，pointer-events 关闭，不遮挡文字与按钮 */}
          <div className="landing-shards" aria-hidden="true">
            <div className="shard shard-note">
              <span className="shard-head">
                <span className="shard-icon">✏️</span>
                <span className="shard-label">原始记录</span>
              </span>
              <span className="shard-skeleton">
                <i style={{ width: "88%" }} />
                <i style={{ width: "64%" }} />
                <i style={{ width: "76%" }} />
              </span>
            </div>

            <div className="shard shard-ai">
              <span className="shard-head">
                <span className="shard-icon shard-icon-spark">✨</span>
                <span className="shard-label">AI 提炼</span>
              </span>
              <span className="shard-highlight" />
              <span className="shard-skeleton">
                <i style={{ width: "72%" }} />
                <i style={{ width: "52%" }} />
              </span>
            </div>

            <div className="shard shard-graph">
              <svg viewBox="0 0 72 54" role="presentation" focusable="false">
                <line x1="16" y1="14" x2="52" y2="20" />
                <line x1="52" y1="20" x2="30" y2="42" />
                <line x1="16" y1="14" x2="30" y2="42" />
                <circle cx="16" cy="14" r="4.5" />
                <circle cx="52" cy="20" r="4.5" />
                <circle cx="30" cy="42" r="4.5" />
              </svg>
            </div>
          </div>

          <p className="landing-eyebrow">
            <span className="landing-eyebrow-dot" aria-hidden="true" />
            面向大学生的 AI 学习知识系统
          </p>
          <h1 className="landing-title">
            笔记不该是
            <br />
            <span className="landing-title-gradient">一座孤岛</span>
            <span className="landing-title-period">。</span>
          </h1>
          <p className="landing-slogan">Notes become chords.<span>一条笔记是音符，连起来才是和弦</span></p>
          <p className="landing-lede">
            课堂上的原话先落进「原始记录」，AI 负责整理与提议，
            <br className="landing-br-wide" />
            你点头之后，它才成为知识网络里的一页。
          </p>
          <div className="landing-actions">
            <button className="landing-primary" type="button" data-sound="press" onClick={onEnter}>
              进入编辑室
              <span aria-hidden="true">→</span>
            </button>
            <a className="landing-secondary" href="#features">
              看它如何生长
            </a>
          </div>
          <ul className="landing-facts">
            <li>
              <b>Raw</b>
              <span>原始记录</span>
            </li>
            <li>
              <b>Knowledge</b>
              <span>知识页</span>
            </li>
            <li>
              <b>Relation</b>
              <span>关联</span>
            </li>
            <li>
              <b>Graph</b>
              <span>图谱</span>
            </li>
          </ul>
        </section>

        <section className="landing-section" id="features" aria-label="四个特点">
          <div className="landing-section-head">
            <h2>
              四个特点，
              <br />
              笔记自成体系。
            </h2>
            <p className="landing-section-label">02 — 特点</p>
          </div>
          <div className="landing-cards">
            {FEATURES.map((feature) => (
              <article className="landing-card" key={feature.index}>
                <span className="landing-card-glyph" aria-hidden="true">
                  {feature.glyph}
                </span>
                <span className="landing-card-index">{feature.index}</span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section" id="flow" aria-label="工作方式">
          <div className="landing-section-head">
            <h2>
              三步，
              <br />
              让网络慢慢长出来。
            </h2>
            <p className="landing-section-label">03 — 工作方式</p>
          </div>
          <div className="landing-steps">
            {STEPS.map((step) => (
              <div className="landing-step-card" key={step.order}>
                <span className="landing-step-order">{step.order}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-closing" aria-label="开始使用">
          <div className="landing-closing-card">
            <h2>
              下一次考试前，
              <br />
              你的笔记已经连成网。
            </h2>
            <button className="landing-primary" type="button" data-sound="press" onClick={onEnter}>
              进入编辑室
              <span aria-hidden="true">→</span>
            </button>
            <p className="landing-note">概念验证版本，功能与界面随测试反馈持续调整。</p>
          </div>
        </section>

        <footer className="landing-colophon">
          <span>© Chordnote · 和弦 · 概念验证</span>
          <span>AI 只提议，你确认，才写入你的网络</span>
        </footer>
      </div>
    </main>
  );
}
