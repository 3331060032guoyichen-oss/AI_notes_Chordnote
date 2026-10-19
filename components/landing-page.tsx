"use client";

import { useEffect, useRef } from "react";
import { LandingMotionStage } from "./landing-motion-stage";

type LandingPageProps = {
  onEnter: () => void;
};

const FEATURES = [
  ["01", "原始记录", "用户可改，AI 不可改。原话是第一手材料，任何整理都不能篡改它。"],
  ["02", "AI 提议，你确认", "AI 读已有知识页，提出归纳页与关系建议，落库与否由你决定。"],
  ["03", "双向链接", "知识页彼此引用，反向链接自动浮现，关系从真实内容里长出来。"],
  ["04", "看见网络", "图谱把跨学科的关联摊开，让知识缺口与下一步方向清晰可见。"],
] as const;

const STEPS = [
  ["1", "留下原话", "课上怎么记就怎么写，不需要先想好分类。"],
  ["2", "让 AI 整理", "它读你已有的库，提出归纳页与可能的关系。"],
  ["3", "你确认", "点下接受的那一刻，关系才真正成立。"],
] as const;

export function LandingPage({ onEnter }: LandingPageProps) {
  const pageRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    const update = () => page.style.setProperty("--scroll-progress", String(Math.min(1, window.scrollY / Math.max(1, window.innerHeight))));
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <main ref={pageRef} className="landing landing-architect">
      <div className="landing-architect-grid" aria-hidden="true" />
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <a className="landing-brand" href="#top" aria-label="Chordnote 首页">
            <span className="landing-brand-mark">C</span>
            <strong>Chordnote</strong>
          </a>
          <nav className="landing-links" aria-label="页面导航">
            <a href="#worktable">工作台</a>
            <a href="#method">方法</a>
            <a href="#principles">原则</a>
          </nav>
          <button className="landing-nav-cta" type="button" onClick={onEnter}>
            进入编辑室 <span aria-hidden="true">↗</span>
          </button>
        </div>
      </header>

      <section id="top" className="landing-architect-hero" aria-label="Chordnote 简介">
        <div className="landing-architect-copy">
          <p className="landing-kicker">01 / KNOWLEDGE ARCHITECTURE</p>
          <h1>Chordnote</h1>
          <p className="landing-subtitle">——让 AI 成为你的知识架构师</p>
          <p className="landing-lede">
            一条笔记是音符，连起来才是和弦。Chordnote 的核心使命是打破传统笔记“只存不连”与通用 AI“无记忆、易幻觉”的瓶颈，让 AI 扮演“知识架构师”——帮助大学生将零散的学习记录升维为贯穿大学四年的体系化知识网络。
          </p>
          <div className="landing-actions">
            <button className="landing-primary" type="button" onClick={onEnter}>进入编辑室 <span aria-hidden="true">→</span></button>
            <a className="landing-secondary" href="#worktable">查看工作台</a>
          </div>
        </div>
        <aside className="landing-architect-index" aria-label="产品架构">
          <span>LLM WIKI / OBSIDIAN</span>
          <strong>从零散学习记录，升维为跨学科体系化知识图谱。</strong>
          <div className="landing-architect-flow"><span>RAW</span><i>→</i><span>WIKI</span><i>→</i><span>GRAPH</span></div>
          <small>AI 只提议，你确认，才写入你的网络。</small>
        </aside>
      </section>

      <section id="worktable" className="landing-worktable-intro" aria-label="工作台介绍">
        <div>
          <p className="landing-kicker">02 / THE WORKTABLE</p>
          <h2>一条笔记是音符，<br />连起来才是和弦。</h2>
        </div>
        <p>基于 Andrej Karpathy 提出的 LLM Wiki 架构与 Obsidian 双向链接知识图谱，我们为 Chordnote 的 Agent 编写了一份专属《工作手册》。</p>
      </section>

      <LandingMotionStage src="/motion/worktable-pilot.mp4" poster="/motion/worktable-poster.png" />

      <section id="principles" className="landing-principles" aria-label="产品原则">
        <div className="landing-section-head">
          <p className="landing-kicker">03 / PRINCIPLES</p>
          <h2>知识不是堆积，<br />是关系的形状。</h2>
        </div>
        <div className="landing-principle-list">
          {FEATURES.map(([index, title, body]) => (
            <article key={index} className="landing-principle-row">
              <span>{index}</span><h3>{title}</h3><p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="method" className="landing-method" aria-label="工作方式">
        <div className="landing-section-head">
          <p className="landing-kicker">04 / METHOD</p>
          <h2>让网络慢慢<br />长出来。</h2>
        </div>
        <div className="landing-method-grid">
          {STEPS.map(([order, title, body]) => (
            <article key={order} className="landing-method-card"><span>{order}</span><h3>{title}</h3><p>{body}</p></article>
          ))}
        </div>
      </section>

      <section className="landing-closing" aria-label="开始使用">
        <p className="landing-kicker">05 / BEGIN</p>
        <h2>把四年的学习，<br />连成一张自己的网。</h2>
        <button className="landing-primary" type="button" onClick={onEnter}>进入编辑室 <span aria-hidden="true">→</span></button>
      </section>
      <footer className="landing-colophon"><span>© Chordnote · 和弦</span><span>设计灵感来自瑞士国际主义平面设计与苹果式产品克制。</span></footer>
    </main>
  );
}
