"use client";

import { useEffect, useRef } from "react";
import { LandingKnowledgeNetwork } from "./landing-knowledge-network";

type LandingPageProps = {
  onEnter: () => void;
};

const FEATURES = [
  {
    index: "01",
    title: "原始记录",
    body: "用户可改，AI 不可改。你的原话永远是第一手材料，任何整理都不能篡改它。",
  },
  {
    index: "02",
    title: "AI 提议，你确认",
    body: "AI 只产出草稿与关联建议，落库与否由你决定 —— 网络里不会出现你没点头的东西。",
  },
  {
    index: "03",
    title: "双向链接",
    body: "知识页彼此引用，反向链接自动浮现。谁引用过它，一眼就看见。",
  },
  {
    index: "04",
    title: "看见网络",
    body: "图谱从真实的关联里长出来，节点大小跟着被引用次数走，缺口一眼看得到。",
  },
] as const;

const STEPS = [
  { order: "1", title: "留下原话", body: "课上怎么记就怎么写，不需要先想好分类。" },
  { order: "2", title: "让 AI 整理", body: "它读你已有的库，提出归纳页与可能的关系。" },
  { order: "3", title: "你确认", body: "点下接受的那一刻，关系才真正成立。" },
] as const;

export function LandingPage({ onEnter }: LandingPageProps) {
  const pageRef = useRef<HTMLElement | null>(null);
  const progressRef = useRef(0);

  // 用滚动进度驱动 3D 网络的亮度：越往下读，网络越亮
  useEffect(() => {
    function onScroll() {
      const span = Math.max(1, window.innerHeight * 0.9);
      const progress = Math.min(window.scrollY / span, 1);
      progressRef.current = progress;
      pageRef.current?.style.setProperty("--scroll-progress", progress.toFixed(3));
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // 区块进入视口时淡入上移，让长页读起来有节奏
  useEffect(() => {
    const targets = pageRef.current?.querySelectorAll<HTMLElement>(".landing-reveal");
    if (!targets || targets.length === 0) return;

    if (!("IntersectionObserver" in window)) {
      targets.forEach((element) => element.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" },
    );

    targets.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  return (
    <main ref={pageRef} className="landing" data-reveal-progress="0.00">
      <div className="landing-backdrop" aria-hidden="true" />
      <LandingKnowledgeNetwork progressRef={progressRef} className="landing-network" />

      <div className="landing-content">
        <header className="landing-masthead">
          <div className="landing-masthead-inner">
            <div className="landing-brand">
              <span className="landing-brand-mark">AN</span>
              <strong>AI Notes</strong>
            </div>
            <p className="landing-edition">概念验证 · 第 001 期</p>
            <div className="landing-status">
              <span className="landing-status-dot" aria-hidden="true" />
              <span>本地编辑台</span>
              <strong>就绪</strong>
            </div>
          </div>
        </header>

        <section className="landing-hero" aria-label="AI Notes 简介">
          <p className="landing-eyebrow">面向大学生的 AI 学习知识系统</p>
          <h1 className="landing-title">
            笔记不该是
            <br />
            一座<em>孤岛</em>。
          </h1>
          <p className="landing-lede">
            课堂上的原话先落进「原始记录」，AI 负责整理与提议，
            <br className="landing-br-wide" />
            你点头之后，它才成为知识网络里的一页。
          </p>
          <div className="landing-cta">
            <button className="landing-enter" type="button" data-sound="press" onClick={onEnter}>
              进入编辑室
              <span aria-hidden="true">→</span>
            </button>
            <a className="landing-ghost" href="#how">
              看它如何生长
              <span aria-hidden="true">↓</span>
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

        <section className="landing-section" id="how" aria-label="四个特点">
          <div className="landing-section-head landing-reveal">
            <h2>
              四个特点，
              <br />
              笔记自成体系。
            </h2>
            <p className="landing-section-label">02 — 特点</p>
          </div>
          <div className="landing-features landing-reveal">
            {FEATURES.map((feature) => (
              <article className="landing-feature" key={feature.index}>
                <span className="landing-feature-index">{feature.index}</span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section landing-section-steps" aria-label="工作方式">
          <div className="landing-section-head landing-reveal">
            <h2>
              三步，
              <br />
              让网络慢慢长出来。
            </h2>
            <p className="landing-section-label">03 — 工作方式</p>
          </div>
          <div className="landing-steps landing-reveal">
            {STEPS.map((step, index) => (
              <div
                className={`landing-step${index === STEPS.length - 1 ? " is-accent" : ""}`}
                key={step.order}
              >
                <span className="landing-step-order">{step.order}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-closing landing-reveal" aria-label="开始使用">
          <h2>
            下一次考试前，
            <br />
            你的笔记已经连成网。
          </h2>
          <button className="landing-enter is-inverse" type="button" data-sound="press" onClick={onEnter}>
            进入编辑室
            <span aria-hidden="true">→</span>
          </button>
          <p className="landing-note">目前为概念验证版本，功能与界面随测试反馈持续调整。</p>
        </section>

        <footer className="landing-colophon">
          <span>© AI Notes · 概念验证</span>
          <span>AI 只提议，你确认，才写入你的网络</span>
        </footer>
      </div>
    </main>
  );
}
