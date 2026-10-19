"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

type LandingMotionStageProps = {
  src: string;
  poster: string;
  label?: string;
};

/**
 * Scroll-scrubbed pilot stage. The video element stays mounted for the whole
 * story; scroll events only update a target and a single animation frame seeks
 * to the latest decoded time.
 */
export function LandingMotionStage({ src, poster, label = "从原始记录到知识结构" }: LandingMotionStageProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const targetProgress = useRef(0);
  const frameRef = useRef<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    const video = videoRef.current;
    if (!section || !video) return;

    const updateTarget = () => {
      const rect = section.getBoundingClientRect();
      const travel = Math.max(1, rect.height - window.innerHeight);
      targetProgress.current = Math.min(1, Math.max(0, -rect.top / travel));
      if (frameRef.current === null) {
        frameRef.current = window.requestAnimationFrame(() => {
          frameRef.current = null;
          if (video.duration && Number.isFinite(video.duration)) {
            video.currentTime = targetProgress.current * video.duration;
          }
        });
      }
    };

    const onMetadata = () => {
      setReady(true);
      updateTarget();
    };
    const onScroll = () => updateTarget();
    video.addEventListener("loadedmetadata", onMetadata);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    updateTarget();

    return () => {
      video.removeEventListener("loadedmetadata", onMetadata);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  return (
    <section ref={sectionRef} className="landing-motion-story" aria-label={`${label}滚动动画`}>
      <div className="landing-motion-sticky">
        <div className="landing-motion-frame">
          <video
            ref={videoRef}
            className="landing-motion-video"
            src={src}
            poster={poster}
            muted
            playsInline
            preload="metadata"
            aria-label={label}
          />
          {!ready && <Image className="landing-motion-poster" src={poster} alt="" aria-hidden="true" fill sizes="(max-width: 760px) calc(100vw - 24px), min(1280px, 100vw)" priority />}
          <div className="landing-motion-caption">
            <span>01 — 工作台</span>
            <strong>{label}</strong>
            <small>向下滚动，逐帧观察纸页如何连成体系</small>
          </div>
        </div>
      </div>
    </section>
  );
}
