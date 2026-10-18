"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type ForceCenter,
  type ForceLink,
  type ForceManyBody,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

import type { GraphEdge, GraphNode } from "../types/graph";

export interface GraphParams {
  /** 节点大小缩放 */
  nodeSize: number;
  /** 连线粗细缩放 */
  lineWidth: number;
  /** 中心引力 */
  centerForce: number;
  /** 节点斥力（取正值，内部转负） */
  repelForce: number;
  /** 连线弹簧力 */
  linkForce: number;
  /** 理想连线长度 */
  linkDist: number;
}

const DEFAULT_PARAMS: GraphParams = {
  nodeSize: 1,
  lineWidth: 1,
  centerForce: 0.5,
  repelForce: 330,
  linkForce: 0.5,
  linkDist: 104,
};

interface GraphViewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** 力场与显示参数；缺省用 DEFAULT_PARAMS。变化时重建仿真。 */
  params?: GraphParams;
  /** 点击节点时打开对应知识页。 */
  onOpenNote: (noteId: string) => void;
  /**
   * 被固定的节点数量变化时回调（拖动会让节点固定在落点）。
   * 拖动固定数量由工作区显示。
   */
  onPinnedChange?: (count: number) => void;
}

/** 力学计算用的节点：在 API 返回的基础上补上画图需要的字段。 */
interface SimNode extends SimulationNodeDatum {
  id: string;
  title: string;
  degree: number;
  radius: number;
  /** 光晕呼吸的相位偏移，避免所有节点整齐划一地闪。 */
  phase: number;
  /** d3 会在初始化时写入，这里显式声明为非可选，方便绘制时直接取用。 */
  x: number;
  y: number;
}

type SimLink = SimulationLinkDatum<SimNode> & { id: string };

const LABEL_FONT =
  '600 11.5px "Geist","Noto Sans SC","Microsoft YaHei",ui-sans-serif,system-ui,sans-serif';

/** 拖完那一下焦点脉冲的时长（毫秒）。用来代替"松手弹一张大卡片"。 */
const PULSE_MS = 900;

/** 从 :root 读设计令牌，让 Canvas 跟着主题走（换主题不必改这里）。 */
function readToken(el: Element, name: string, fallback: string): string {
  const value = getComputedStyle(el).getPropertyValue(name).trim();
  return value || fallback;
}

/** 度数越高节点越大 —— 一眼能看出哪几个知识页是枢纽。 */
function radiusFor(degree: number): number {
  return 5 + Math.min(degree, 6) * 1.9;
}

/** 只影响布局的四个参数。改这四个才需要给仿真升温；节点大小/连线粗细是纯视觉的。 */
function physicsKeyOf(p: GraphParams): string {
  return `${p.centerForce}|${p.repelForce}|${p.linkForce}|${p.linkDist}`;
}

/**
 * 知识网络：d3-force 做力学计算，自绘 Canvas 做渲染。
 *
 * 分工的理由（见 AGENTS.md 2026-10-10 决策）：力学与渲染解耦，
 * 不引入把布局/渲染/交互绑在一起的图谱组件库。
 *
 * 两层动效：
 *   1）力学收敛 —— 前 ~2 秒节点从初始位置散开到稳定布局，之后停下（标签才读得住）；
 *   2）常驻流动 —— 连线呼吸 + 沿边行进的脉冲点，独立于力学，靠 rAF 一直在跑。
 *      布局静止不等于画面静止，这是"网络是活的"那部分观感。
 */
export function GraphView({ nodes, edges, params, onOpenNote, onPinnedChange }: GraphViewProps) {
  const P = params ?? DEFAULT_PARAMS;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [zoomLabel, setZoomLabel] = useState(100);
  /** 被单击选中的节点（画布上那张小卡片的内容）。null 表示没有选中。 */
  const [selectedNode, setSelectedNode] = useState<{ id: string; title: string; degree: number } | null>(null);
  /**
   * 被拖到落点后固定住的节点 id。
   *
   * 拖动是用户明确的重排意图：松手时如果放开 `fx/fy`，力场会沿连线把它拉回原位，
   * 拖动就等于白拖（实测拖出 275px、4 秒后回到出发坐标）。
   * 所以拖动过就钉住，出口由右栏的「重新布局」与卡片上的「解除固定」提供。
   */
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  // 交互状态放 ref：鼠标移动每帧都在变，不能触发 React 重渲染。
  const viewRef = useRef({ k: 1, x: 0, y: 0 });
  const hoverRef = useRef<SimNode | null>(null);
  /**
   * 选中的节点。
   *
   * 与 hover 分开：hover 是"路过看一眼"，选中是"我要停在这看"。选中后高亮会**保持**，
   * 不像 hover 那样移开就散 —— 这才让"单击查看、双击打开"成立。
   */
  const selectedRef = useRef<SimNode | null>(null);
  const dragRef = useRef<SimNode | null>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  /** 「适应视图」的执行体，由 effect 在拿到 simNodes 后填充。 */
  const fitNowRef = useRef<() => void>(() => {});

  // 参数与仿真句柄放 ref。
  // 关键：力场参数**不能**并进下面那个 effect 的依赖。否则每拖动一次滑块都会
  // 销毁重建仿真、节点从螺旋初始位置重新散开，看起来就是"节点不停闪"。
  // 改成参数变化时原地改力（见下面第二个 effect），布局不重来。
  const paramsRef = useRef(P);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const simNodesRef = useRef<SimNode[]>([]);
  const drawRef = useRef<() => void>(() => {});
  const prevPhysicsRef = useRef<string>("");
  /** 上一次的节点坐标。数据变化重建仿真时沿用它，避免整个图重排。 */
  const posRef = useRef(new Map<string, { x: number; y: number }>());
  /** 只在「节点集合变了」的时候把视图归位到 100%，调参数不该重置用户的缩放。 */
  const viewKeyRef = useRef<string>("");

  // 回调放 ref：调用方不必为"稳定引用"操心，力学仿真也不会因为父组件重渲染而重建。
  const onOpenNoteRef = useRef(onOpenNote);
  useEffect(() => {
    onOpenNoteRef.current = onOpenNote;
  });

  const onPinnedChangeRef = useRef(onPinnedChange);
  useEffect(() => {
    onPinnedChangeRef.current = onPinnedChange;
  });

  /** 与 `pinnedIds`（给界面用）同步的即时集合：拖拽回调里不经过 React 状态也能查。 */
  const pinnedRef = useRef<Set<string>>(new Set());

  /**
   * 拖完那一下的焦点脉冲：`{ id, startedAt }`，由绘制循环按时间淡出。
   * 用脉冲代替"松手弹卡片"——拖动的意图是腾出空间，弹卡片正好挡住刚整理好的地方。
   */
  const pulseRef = useRef<{ id: string; startedAt: number } | null>(null);

  /** 全局斥力句柄：拖拽期间要临时压低它，避免几跳以外的节点被一起唤醒。 */
  const chargeForceRef = useRef<ForceManyBody<SimNode> | null>(null);

  // 让长驻的绘制循环与交互回调读到最新的参数，而不必重建仿真
  useEffect(() => {
    paramsRef.current = P;
  });

  const reducedMotion = useMemo(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const applyView = useCallback((k: number, x: number, y: number) => {
    viewRef.current = { k, x, y };
    setZoomLabel(Math.round(k * 100));
  }, []);

  const fitToContent = useCallback(
    (simNodes: SimNode[]) => {
      const { w, h } = sizeRef.current;
      if (!w || !h || simNodes.length === 0) return;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const n of simNodes) {
        minX = Math.min(minX, n.x - n.radius);
        maxX = Math.max(maxX, n.x + n.radius);
        minY = Math.min(minY, n.y - n.radius);
        maxY = Math.max(maxY, n.y + n.radius);
      }
      // 标签在节点下方，底部留多一点，免得贴到边框
      const pad = 58;
      const cw = Math.max(1, maxX - minX) + pad * 2;
      const ch = Math.max(1, maxY - minY) + pad * 2 + 18;
      const k = Math.max(0.35, Math.min(2.2, Math.min(w / cw, h / ch)));
      applyView(k, w / 2 - ((minX + maxX) / 2) * k, h / 2 - ((minY + maxY) / 2) * k - 9);
    },
    [applyView],
  );

  /** 把 ref 里的固定集合同步给界面，并通知父组件（右栏要显示数量）。 */
  const syncPinned = useCallback(() => {
    setPinnedIds([...pinnedRef.current]);
    onPinnedChangeRef.current?.(pinnedRef.current.size);
  }, []);

  /** 解除单个节点的固定，并给仿真一点温度让它重新落位。 */
  const releasePin = useCallback((id: string) => {
    const node = simNodesRef.current.find((item) => item.id === id);
    if (node) {
      node.fx = null;
      node.fy = null;
    }
    pinnedRef.current.delete(id);
    setPinnedIds([...pinnedRef.current]);
    onPinnedChangeRef.current?.(pinnedRef.current.size);
    simRef.current?.alpha(0.3).restart();
    if (reducedMotion) drawRef.current();
  }, [reducedMotion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 本 effect 只在数据/主题变化时跑，所以从 ref 取一次参数快照即可
    const P0 = paramsRef.current;

    // ---- 数据 -> 力学节点 ----
    const degreeById = new Map<string, number>();
    for (const n of nodes) degreeById.set(n.id, 0);
    for (const e of edges) {
      if (degreeById.has(e.source)) degreeById.set(e.source, (degreeById.get(e.source) ?? 0) + 1);
      if (degreeById.has(e.target)) degreeById.set(e.target, (degreeById.get(e.target) ?? 0) + 1);
    }

    const { w, h } = sizeRef.current;
    const cx = w / 2 || 400;
    const cy = h / 2 || 300;

    const previous = posRef.current;

    const simNodes: SimNode[] = nodes.map((n, i) => {
      const degree = degreeById.get(n.id) ?? 0;
      // 初始位置沿螺旋散开，避免全部叠在原点导致第一步力学爆炸。
      // 但已经画过的节点沿用上次坐标——数据变化（比如新建了一条关联）时布局才不会整体重排。
      const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2;
      const ring = 40 + (i % 4) * 34;
      const kept = previous.get(n.id);
      return {
        id: n.id,
        title: n.title,
        degree,
        radius: radiusFor(degree) * P0.nodeSize,
        phase: (i * 0.8) % (Math.PI * 2),
        x: kept?.x ?? cx + Math.cos(angle) * ring,
        y: kept?.y ?? cy + Math.sin(angle) * ring,
      };
    });
    const byId = new Map(simNodes.map((n) => [n.id, n]));

    const simLinks: SimLink[] = edges
      .filter((e) => byId.has(e.source) && byId.has(e.target))
      .map((e) => ({ id: e.id, source: e.source, target: e.target }));
    // 每条连线一个固定的相位偏移，让脉冲不要整齐划一
    const phaseSeed = simLinks.map((_, i) => (i * 0.37) % 1);

    // ---- 主题令牌（Canvas 不会自动继承 CSS 变量，得自己读）----
    const token = (name: string, fallback: string) => readToken(canvas, name, fallback);
    const tokens = () => ({
      ink: token("--ink", "#e8edf7"),
      line: token("--line-strong", "rgb(148 163 184 / 32%)"),
      accent: token("--accent", "#7c3aed"),
    });

    // ---- 绘制 ----
    const draw = () => {
      const { w, h, dpr } = sizeRef.current;
      if (!w || !h) return;
      const t = tokens();
      // 常驻动画的时间源。静态布局下取 0，画面就完全定格。
      const now = reducedMotion ? 0 : performance.now() / 1000;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const { k, x: tx, y: ty } = viewRef.current;
      ctx.save();
      ctx.translate(tx, ty);
      ctx.scale(k, k);

      // 选中优先于悬停：选中的节点在鼠标移开之后仍然保持高亮与邻居强调。
      const hovered = hoverRef.current ?? selectedRef.current;
      let neighbors: Set<string> | null = null;
      if (hovered) {
        neighbors = new Set([hovered.id]);
        for (const l of simLinks) {
          const s = l.source as SimNode;
          const g = l.target as SimNode;
          if (s.id === hovered.id) neighbors.add(g.id);
          if (g.id === hovered.id) neighbors.add(s.id);
        }
      }

      // 1) 连线：呼吸的透明度
      simLinks.forEach((l, i) => {
        const s = l.source as SimNode;
        const g = l.target as SimNode;
        const hot = neighbors !== null && neighbors.has(s.id) && neighbors.has(g.id);
        const dim = neighbors !== null && !hot;
        const breathe = 0.62 + 0.16 * Math.sin(now * 0.9 + i * 0.7);
        const color = hot ? t.accent : t.line;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(g.x, g.y);
        ctx.strokeStyle = color;
        ctx.globalAlpha = hot ? 0.95 : dim ? 0.22 : breathe;
        // 从 ref 读：绘制循环是长驻的，闭包里的 P 会是第一次渲染的旧值
        ctx.lineWidth = (hot ? 1.8 : 1) * paramsRef.current.lineWidth / k;
        ctx.stroke();
      });

      // 2) 沿边行进的脉冲：这是"网络活着"的主要信号
      if (!reducedMotion) {
        simLinks.forEach((l, i) => {
          const s = l.source as SimNode;
          const g = l.target as SimNode;
          const hot = neighbors !== null && neighbors.has(s.id) && neighbors.has(g.id);
          if (neighbors !== null && !hot) return; // 聚焦时只在邻近连线上流动
          const dx = g.x - s.x;
          const dy = g.y - s.y;
          for (let tail = 0; tail < 4; tail += 1) {
            const phase = (now * 0.3 + phaseSeed[i] - tail * 0.035) % 1;
            if (phase < 0) continue;
            const fade = Math.sin(phase * Math.PI) * (1 - tail * 0.22);
            if (fade <= 0) continue;
            ctx.globalAlpha = fade * 0.9;
            ctx.fillStyle = hot ? t.accent : t.ink;
            ctx.beginPath();
            ctx.arc(s.x + dx * phase, s.y + dy * phase, 1.9 - tail * 0.3, 0, Math.PI * 2);
            ctx.fill();
          }
        });
        ctx.globalAlpha = 1;
      }

      // 3) 节点
      for (const n of simNodes) {
        const dim = neighbors !== null && !neighbors.has(n.id);
        ctx.globalAlpha = dim ? 0.28 : 1;

        // 光晕：让节点在深色底上有"发亮"的层次；静置时有极轻的呼吸
        const halo = reducedMotion ? 1 : 1 + 0.06 * Math.sin(now * 1.1 + n.phase);
        const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.radius * 3.4 * halo);
        glow.addColorStop(0, `${t.accent}55`);
        glow.addColorStop(1, `${t.accent}00`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius * 3.4 * halo, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = t.accent;
        ctx.fill();

        if (hovered && hovered.id === n.id) {
          ctx.lineWidth = 2 / k;
          ctx.strokeStyle = t.ink;
          ctx.stroke();
        }

        // 固定住的节点：外圈一道极细的环，说明"它现在钉在这里"。
        if (pinnedRef.current.has(n.id)) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius + 4 + 1.5 / k, 0, Math.PI * 2);
          ctx.lineWidth = 1 / k;
          ctx.strokeStyle = t.accent;
          ctx.globalAlpha = dim ? 0.22 : 0.8;
          ctx.stroke();
          ctx.globalAlpha = dim ? 0.28 : 1;
        }

        // 刚拖完那一下的焦点脉冲：一圈扩散又淡出的光，代替弹卡片。
        const pulse = pulseRef.current;
        if (pulse && pulse.id === n.id) {
          const elapsed = performance.now() - pulse.startedAt;
          if (elapsed < PULSE_MS) {
            const progress = elapsed / PULSE_MS;
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.radius + 6 + progress * 16, 0, Math.PI * 2);
            ctx.lineWidth = 1.6 / k;
            ctx.strokeStyle = t.accent;
            ctx.globalAlpha = (1 - progress) * 0.85;
            ctx.stroke();
            ctx.globalAlpha = dim ? 0.28 : 1;
          } else {
            pulseRef.current = null;
          }
        }

        const showLabel =
          !dim && (k > 0.62 || n.degree >= 3 || (neighbors !== null && neighbors.has(n.id)));
        if (showLabel) {
          ctx.font = LABEL_FONT;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = t.ink;
          ctx.globalAlpha = dim ? 0.12 : Math.max(0, Math.min(1, (k - 0.5) * 2.2));
          ctx.fillText(n.title, n.x, n.y + n.radius + 12);
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    };

    // ---- 尺寸 ----
    const resize = () => {
      const box = wrap.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { w: box.width, h: box.height, dpr };
      const nextW = Math.round(box.width * dpr);
      const nextH = Math.round(box.height * dpr);
      // 尺寸没变就直接返回：否则 ResizeObserver → 改 canvas 尺寸 → 再触发自身，会自激
      if (nextW === canvas.width && nextH === canvas.height) return;
      canvas.width = nextW;
      canvas.height = nextH;
      canvas.style.width = `${box.width}px`;
      canvas.style.height = `${box.height}px`;
    };

    resize();

    // ---- 力学 ----
    // 斥力留个句柄：拖拽期间要把它压到 25%，让位移只影响直接相连的邻居。
    const chargeForce = forceManyBody<SimNode>()
      .strength(-P0.repelForce)
      .distanceMin(30)
      .theta(0.9);
    chargeForceRef.current = chargeForce;

    const simulation: Simulation<SimNode, SimLink> = forceSimulation<SimNode>(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(P0.linkDist)
          .strength(P0.linkForce),
      )
      .force("charge", chargeForce)
      .force("center", forceCenter(cx, cy).strength(P0.centerForce))
      // 往画布中心轻拉：没有连线的孤立知识页否则会被斥力推到天边，整个图散掉
      .force("x", forceX<SimNode>(cx).strength(0.07))
      .force("y", forceY<SimNode>(cy).strength(0.07))
      .force(
        "collide",
        forceCollide<SimNode>()
          .radius((d) => d.radius + 20)
          .strength(0.7)
          .iterations(2),
      )
      .alphaDecay(0.03)
      .velocityDecay(0.4);

    // 渲染不挂在力学 tick 上：力学停下之后画面还要继续流动。
    let rafId = 0;
    const frame = () => {
      draw();
      rafId = window.requestAnimationFrame(frame);
    };

    // 视图一律 100% 起步，由用户自己缩放。
    // 之前这里在 900ms 时自动 fitToContent()，会把缩放从 100% 一下跳到适应值，
    // 看起来就是"每次进来缩放都突变"。适应视图改成按需触发。
    //
    // 另外：只在「节点集合真的变了」时归位。否则调一次图谱参数就把用户
    // 辛苦调好的缩放重置回 100%，也是那个"闪"的一部分。
    const viewKey = nodes.map((n) => n.id).sort().join("|");

    if (viewKeyRef.current !== viewKey) {
      viewKeyRef.current = viewKey;
      applyView(1, 0, 0);
    }
    if (reducedMotion) {
      // 减少动态效果：同步跑完布局，画一次，之后只在交互时重绘。
      simulation.stop();
      for (let i = 0; i < 300; i += 1) simulation.tick();
      draw();
    } else {
      rafId = window.requestAnimationFrame(frame);
    }

    // 给「适应视图」按钮用：需要在画布置尺寸之后再算，所以放在这里而不是 React 侧
    fitNowRef.current = () => {
      fitToContent(simNodes);
      draw();
    };

    // 暴露给「参数变化」那个 effect，让它原地改力而不是重建仿真
    simRef.current = simulation;
    simNodesRef.current = simNodes;
    drawRef.current = draw;
    prevPhysicsRef.current = physicsKeyOf(P0);

    // ---- 交互 ----
    // 浏览器在 pointerup 之后还会补发一次 click，哪怕中间拖了很远。
    // 不挡住它，每挪一次节点就会触发一次"打开知识页"。
    let dragMoved = false;
    let dragStartX = 0;
    let dragStartY = 0;
    const DRAG_MOVE_THRESHOLD = 4;

    const toWorld = (clientX: number, clientY: number) => {
      const box = canvas.getBoundingClientRect();
      const { k, x, y } = viewRef.current;
      return { x: (clientX - box.left - x) / k, y: (clientY - box.top - y) / k };
    };

    const pick = (clientX: number, clientY: number): SimNode | null => {
      const p = toWorld(clientX, clientY);
      let best: SimNode | null = null;
      let bestDist = Infinity;
      for (const n of simNodes) {
        const d = (p.x - n.x) ** 2 + (p.y - n.y) ** 2;
        const reach = (n.radius + 9) ** 2;
        if (d < reach && d < bestDist) {
          best = n;
          bestDist = d;
        }
      }
      return best;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (dragRef.current) {
        if (
          !dragMoved &&
          Math.hypot(event.clientX - dragStartX, event.clientY - dragStartY) > DRAG_MOVE_THRESHOLD
        ) {
          dragMoved = true;
        }
        const p = toWorld(event.clientX, event.clientY);
        dragRef.current.fx = p.x;
        dragRef.current.fy = p.y;
        if (reducedMotion) {
          // 静态模式下力学已停，没人会把 fx/fy 落到 x/y 上，得自己挪，否则节点不跟手
          dragRef.current.x = p.x;
          dragRef.current.y = p.y;
          draw();
        }
        // 动态模式不需要在这里加温：拖拽开始时已经把 alphaTarget 设成一个小值，
        // 仿真会一直维持那一档温度，直到松手把它归零。
        return;
      }
      const hit = pick(event.clientX, event.clientY);
      if (hit !== hoverRef.current) {
        hoverRef.current = hit;
        canvas.style.cursor = hit ? "pointer" : "grab";
        if (reducedMotion) draw();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      // 只认主键。中键/右键不进入拖拽，否则右键菜单一弹，pointerup 收不到，
      // dragRef 就留在原地，节点会一直黏着光标。
      if (event.button !== 0) return;
      const hit = pick(event.clientX, event.clientY);
      if (!hit) return;
      dragRef.current = hit;
      dragMoved = false;
      // 拖拽期间维持一档很低的温度（用 alphaTarget，不是每次移动都 alpha(...)）：
      // 刚够让直接相连的弹簧把邻居带过来。原来每次移动都 alpha(0.35)，等于把整张图
      // 反复重新加热，几跳以外的节点也被唤醒，松手后还要自己颤两三秒。
      simulation.alphaTarget(0.05).restart();
      // 同时把全局斥力压到 25%：位移能量因此被限制在邻域内，远端节点几乎无感。
      chargeForce.strength(-Math.abs(paramsRef.current.repelForce) * 0.25);
      dragStartX = event.clientX;
      dragStartY = event.clientY;
      hit.fx = hit.x;
      hit.fy = hit.y;
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = "grabbing";
    };

    /** 结束拖拽。松手位置可能在画布外，所以监听挂在 window 上。 */
    const endDrag = (event: PointerEvent) => {
      const node = dragRef.current;
      if (!node) return;
      if (dragMoved) {
        // 真拖动过 → 留在落点：继续钉住并记进固定名单。
        // 只按一下（没越过拖动阈值）不算重排，保持自由，避免误钉。
        pinnedRef.current.add(node.id);
        syncPinned();
        // 只给一圈脉冲，不弹卡片：拖动的意图是腾出空间，卡片正好盖住刚理好的地方。
        // 解除固定的入口有三条：节点上的细环（说明它是固定的）、单击它弹出的卡片、
        // 以及右栏的「重新布局」。
        pulseRef.current = { id: node.id, startedAt: performance.now() };
      } else {
        node.fx = null;
        node.fy = null;
      }
      // 松手：温度归零 + 斥力还原，让扰动尽快静止。
      simulation.alphaTarget(0);
      chargeForce.strength(-Math.abs(paramsRef.current.repelForce));
      dragRef.current = null;
      canvas.style.cursor = "grab";
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (reducedMotion) draw();
    };

    /** 指针捕获意外丢失时的兜底，避免节点永远黏在光标上。 */
    const onLostCapture = () => {
      const node = dragRef.current;
      if (!node) return;
      // 被意外打断时同样保留当前位置，免得它当着用户的面弹回原处。
      if (dragMoved) {
        pinnedRef.current.add(node.id);
        syncPinned();
        pulseRef.current = { id: node.id, startedAt: performance.now() };
      } else {
        node.fx = null;
        node.fy = null;
      }
      simulation.alphaTarget(0);
      chargeForce.strength(-Math.abs(paramsRef.current.repelForce));
      dragRef.current = null;
      canvas.style.cursor = "grab";
      if (reducedMotion) draw();
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = canvas.getBoundingClientRect();
      const mx = event.clientX - box.left;
      const my = event.clientY - box.top;
      const { k, x, y } = viewRef.current;
      const next = Math.max(0.3, Math.min(3, k * (event.deltaY < 0 ? 1.08 : 0.925)));
      applyView(next, mx - (mx - x) * (next / k), my - (my - y) * (next / k));
      if (reducedMotion) draw();
    };

    const onClick = (event: MouseEvent) => {
      // 拖拽结束时浏览器仍会补发一次 click；不挡掉就会"挪一下节点就被弹去知识页"
      if (dragMoved) {
        dragMoved = false;
        return;
      }
      const hit = pick(event.clientX, event.clientY);

      // 单击不打开页面：先选中、弹出节点卡片，让人"停在这看一眼"。
      // 打开知识页是双击（或卡片上的按钮）—— 与界面预览稿的交互一致。
      if (!hit) {
        if (selectedRef.current) {
          selectedRef.current = null;
          setSelectedNode(null);
          draw();
        }
        return;
      }

      selectedRef.current = hit;
      setSelectedNode({ id: hit.id, title: hit.title, degree: hit.degree });
      draw();
    };

    const onDoubleClick = (event: MouseEvent) => {
      const hit = pick(event.clientX, event.clientY);
      if (hit) onOpenNoteRef.current(hit.id);
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    // 松手监听放 window：拖到画布外、或指针离开窗口松手，也能收到，不会卡在拖拽态
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("lostpointercapture", onLostCapture);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("click", onClick);
    canvas.addEventListener("dblclick", onDoubleClick);
    const observer = new ResizeObserver(() => {
      // 改 canvas 尺寸会清空位图，必须紧跟一次重绘——
      // 否则在「减少动态效果」模式下没有 rAF 循环兜底，画面会直接变空白。
      resize();
      draw();
    });
    observer.observe(wrap);

    return () => {
      // 记住这一轮的坐标：下次数据变化重建仿真时沿用它，布局不会整体重排
      for (const n of simNodes) previous.set(n.id, { x: n.x, y: n.y });

      simulation.stop();
      window.cancelAnimationFrame(rafId);
      fitNowRef.current = () => {};
      simRef.current = null;
      simNodesRef.current = [];
      drawRef.current = () => {};
      observer.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      canvas.removeEventListener("lostpointercapture", onLostCapture);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("dblclick", onDoubleClick);
    };
    // nodes/edges 变了就整块重建（数据规模小，够用且行为可预测）。
    // 依赖里**故意没有 P**：力场参数由下面那个 effect 原地更新，不重建仿真。
  }, [nodes, edges, reducedMotion, applyView, fitToContent, syncPinned]);

  // ---- 力场参数原地更新 ----
  // 不把参数并进上面那个 effect 的依赖，是因为那会让每次拖动滑块都销毁重建仿真：
  // 节点从螺旋初始位置重新散开、缩放被重置回 100%，画面就是"节点不停闪"。
  // 这里只改力，布局保持不动。
  useEffect(() => {
    const simulation = simRef.current;
    if (!simulation) return;

    const current = paramsRef.current;

    // 半径是纯视觉的：改完重绘即可，不需要动布局
    for (const node of simNodesRef.current) {
      node.radius = radiusFor(node.degree) * current.nodeSize;
    }

    const link = simulation.force("link") as ForceLink<SimNode, SimLink> | undefined;
    link?.distance(current.linkDist).strength(current.linkForce);

    const charge = simulation.force("charge") as ForceManyBody<SimNode> | undefined;
    charge?.strength(-current.repelForce);

    const center = simulation.force("center") as ForceCenter<SimNode> | undefined;
    center?.strength(current.centerForce);

    // 只有物理参数变了才升温。只调节点大小 / 连线粗细时布局完全不动。
    // 升温幅度给得很小：布局本来已经收敛，这样看起来是"顺滑微调"而不是"重排"。
    const nextPhysicsKey = physicsKeyOf(current);

    if (prevPhysicsRef.current !== nextPhysicsKey) {
      prevPhysicsRef.current = nextPhysicsKey;

      if (reducedMotion) {
        // 静态模式下没有 rAF 循环，得自己把布局推到收敛再重绘
        simulation.stop();
        for (let i = 0; i < 120; i += 1) simulation.tick();
      } else {
        simulation.alpha(0.2).restart();
      }
    }

    drawRef.current();
  }, [
    P.nodeSize,
    P.lineWidth,
    P.centerForce,
    P.repelForce,
    P.linkForce,
    P.linkDist,
    reducedMotion,
  ]);

  const zoomBy = useCallback(
    (factor: number) => {
      const { w, h } = sizeRef.current;
      const { k, x, y } = viewRef.current;
      const next = Math.max(0.3, Math.min(3, k * factor));
      applyView(next, w / 2 - (w / 2 - x) * (next / k), h / 2 - (h / 2 - y) * (next / k));
    },
    [applyView],
  );

  return (
    <div className="graph-view" ref={wrapRef}>
      <canvas className="graph-canvas" ref={canvasRef} aria-label="知识页网络图" role="img" />
      {selectedNode ? <div className="node-inspector" role="status">
        <span className="node-inspector-title">{selectedNode.title}</span>
        <span className="node-inspector-meta">已关联 {selectedNode.degree} 篇笔记{pinnedIds.includes(selectedNode.id) ? " · 已固定" : ""}</span>
        <span className="node-inspector-actions">
          <button className="node-inspector-open" type="button" onClick={() => onOpenNoteRef.current(selectedNode.id)}>阅读这篇知识页 →</button>
          {pinnedIds.includes(selectedNode.id) ? <button className="node-inspector-release" type="button" onClick={() => releasePin(selectedNode.id)}>解除固定</button> : null}
        </span>
      </div> : null}
      <div className="graph-hud">
        <span className="graph-hud-hint">
          {reducedMotion
            ? "已按「减少动态效果」显示静态布局 · 仍可拖拽与缩放"
            : "100% 起步 · 滚轮缩放 · 单击查看、双击打开 · 拖动节点会把它固定在落点"}
        </span>
        <div className="graph-zoom">
          <button type="button" aria-label="缩小" onClick={() => zoomBy(1 / 1.2)}>
            −
          </button>
          <span className="graph-zoom-value">{zoomLabel}%</span>
          <button type="button" aria-label="放大" onClick={() => zoomBy(1.2)}>
            ＋
          </button>
          <button
            type="button"
            className="graph-zoom-fit"
            aria-label="适应视图"
            onClick={() => fitNowRef.current()}
          >
            适应
          </button>
        </div>
      </div>
    </div>
  );
}
