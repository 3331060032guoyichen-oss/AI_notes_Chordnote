"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type SoundCue =
  | "press"
  | "select"
  | "success"
  | "destructive"
  | "toggle-on"
  | "toggle-off";

type SoundPreference = "loading" | "unknown" | "enabled" | "muted" | "unsupported";

type SoundContextValue = {
  enabled: boolean;
  preference: SoundPreference;
  play: (cue: SoundCue) => void;
  enable: () => void;
  mute: () => void;
  toggle: () => void;
};

type AudioGraph = {
  context: AudioContext;
  master: GainNode;
};

const STORAGE_KEY = "ai-notes:sound-preference";
const MIN_CUE_INTERVAL_MS = 60;
const SoundContext = createContext<SoundContextValue | null>(null);

function audioContextConstructor() {
  if (typeof window === "undefined") return null;
  const audioWindow = window as Window & typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };
  return window.AudioContext ?? audioWindow.webkitAudioContext ?? null;
}

function createAudioGraph(): AudioGraph | null {
  const AudioContextClass = audioContextConstructor();
  if (!AudioContextClass) return null;

  const context = new AudioContextClass();
  const master = context.createGain();
  const compressor = context.createDynamicsCompressor();
  master.gain.value = 0.035;
  compressor.threshold.value = -24;
  compressor.knee.value = 18;
  compressor.ratio.value = 5;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.12;
  master.connect(compressor);
  compressor.connect(context.destination);

  return { context, master };
}

function tone(
  graph: AudioGraph,
  start: number,
  duration: number,
  frequency: number,
  endFrequency: number,
  peak: number,
  type: OscillatorType = "sine",
) {
  const oscillator = graph.context.createOscillator();
  const gain = graph.context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(endFrequency, 1), start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.008, duration / 3));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(graph.master);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.01);
}

function noiseTap(graph: AudioGraph, start: number, duration: number, peak: number) {
  const frameCount = Math.max(1, Math.floor(graph.context.sampleRate * duration));
  const buffer = graph.context.createBuffer(1, frameCount, graph.context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < frameCount; index += 1) {
    const envelope = 1 - index / frameCount;
    samples[index] = (Math.random() * 2 - 1) * envelope;
  }

  const source = graph.context.createBufferSource();
  const filter = graph.context.createBiquadFilter();
  const gain = graph.context.createGain();
  filter.type = "bandpass";
  filter.frequency.value = 1450;
  filter.Q.value = 0.75;
  gain.gain.setValueAtTime(peak, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.buffer = buffer;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(graph.master);
  source.start(start);
}

function renderCue(graph: AudioGraph, cue: SoundCue) {
  const start = graph.context.currentTime + 0.005;

  switch (cue) {
    case "press":
      noiseTap(graph, start, 0.028, 0.42);
      tone(graph, start, 0.034, 190, 128, 0.34, "triangle");
      break;
    case "select":
      tone(graph, start, 0.035, 760, 525, 0.24, "sine");
      break;
    case "success":
      tone(graph, start, 0.06, 440, 470, 0.28, "sine");
      tone(graph, start + 0.035, 0.065, 660, 700, 0.24, "sine");
      break;
    case "destructive":
      noiseTap(graph, start, 0.035, 0.32);
      tone(graph, start, 0.055, 155, 98, 0.34, "triangle");
      break;
    case "toggle-on":
      tone(graph, start, 0.055, 470, 520, 0.23, "sine");
      tone(graph, start + 0.04, 0.065, 650, 710, 0.22, "sine");
      break;
    case "toggle-off":
      tone(graph, start, 0.05, 610, 540, 0.21, "sine");
      tone(graph, start + 0.035, 0.06, 420, 330, 0.2, "sine");
      break;
  }
}

export function InterfaceSoundProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<SoundPreference>("loading");
  const graphRef = useRef<AudioGraph | null>(null);
  const lastCueAtRef = useRef(0);
  const preferenceRef = useRef<SoundPreference>("loading");

  const updatePreference = useCallback((next: SoundPreference) => {
    preferenceRef.current = next;
    setPreference(next);
  }, []);

  const ensureGraph = useCallback(() => {
    if (!graphRef.current) graphRef.current = createAudioGraph();
    const graph = graphRef.current;
    if (graph?.context.state === "suspended") void graph.context.resume();
    return graph;
  }, []);

  const playImmediately = useCallback((cue: SoundCue) => {
    const now = performance.now();
    if (now - lastCueAtRef.current < MIN_CUE_INTERVAL_MS) return;
    const graph = ensureGraph();
    if (!graph) return;
    lastCueAtRef.current = now;
    renderCue(graph, cue);
  }, [ensureGraph]);

  const play = useCallback((cue: SoundCue) => {
    if (preferenceRef.current !== "enabled") return;
    playImmediately(cue);
  }, [playImmediately]);

  const enable = useCallback(() => {
    if (!audioContextConstructor()) {
      updatePreference("unsupported");
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, "enabled");
    updatePreference("enabled");
    playImmediately("toggle-on");
  }, [playImmediately, updatePreference]);

  const mute = useCallback(() => {
    if (preferenceRef.current === "enabled") playImmediately("toggle-off");
    window.localStorage.setItem(STORAGE_KEY, "muted");
    updatePreference("muted");
  }, [playImmediately, updatePreference]);

  const toggle = useCallback(() => {
    if (preferenceRef.current === "enabled") mute();
    else enable();
  }, [enable, mute]);

  useEffect(() => {
    if (!audioContextConstructor()) {
      updatePreference("unsupported");
      return;
    }
    const stored = window.localStorage.getItem(STORAGE_KEY);
    updatePreference(stored === "enabled" || stored === "muted" ? stored : "unknown");
  }, [updatePreference]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (preferenceRef.current !== "enabled") return;
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-sound]") : null;
      if (!target || target.matches(":disabled") || target.getAttribute("aria-disabled") === "true") return;
      const cue = target.dataset.sound as SoundCue | undefined;
      if (cue) play(cue);
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [play]);

  useEffect(() => () => {
    if (graphRef.current && graphRef.current.context.state !== "closed") {
      void graphRef.current.context.close();
    }
  }, []);

  const value = useMemo<SoundContextValue>(() => ({
    enabled: preference === "enabled",
    preference,
    play,
    enable,
    mute,
    toggle,
  }), [enable, mute, play, preference, toggle]);

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useInterfaceSound() {
  const value = useContext(SoundContext);
  if (!value) throw new Error("useInterfaceSound must be used inside InterfaceSoundProvider");
  return value;
}

export function SoundToggle({ className = "" }: { className?: string }) {
  const { enabled, preference, toggle } = useInterfaceSound();
  if (preference === "loading") return null;

  if (preference === "unsupported") {
    return <button className={`sound-toggle ${className}`.trim()} type="button" disabled>声音不可用</button>;
  }

  return (
    <button
      className={`sound-toggle${enabled ? " is-on" : ""} ${className}`.trim()}
      type="button"
      aria-pressed={enabled}
      aria-label={enabled ? "关闭界面声音" : "开启界面声音"}
      onClick={toggle}
    >
      <span>声音</span>
      <strong>{enabled ? "开" : preference === "unknown" ? "开启" : "关"}</strong>
    </button>
  );
}
