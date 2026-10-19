"use client";

import { useEffect, useRef } from "react";
import { EditorState, StateField, StateEffect } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, keymap, type DecorationSet } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { autocompletion, startCompletion } from "@codemirror/autocomplete";
import { markdown } from "@codemirror/lang-markdown";
import { noteParser, noteSyntax, resolveReference, splitFrontmatter, type LinkCandidate } from "../lib/documents/markdown";

class LinkWidget extends WidgetType {
  constructor(readonly target: string, readonly label: string, readonly resolved: boolean, readonly open: (target: string) => void) { super(); }
  eq(other: LinkWidget) { return other.target === this.target && other.label === this.label && other.resolved === this.resolved; }
  toDOM() {
    const button = document.createElement("button");
    button.type = "button"; button.className = `wiki-link${this.resolved ? "" : " is-unresolved"}`;
    button.textContent = this.label; button.title = this.resolved ? this.target : `创建 ${this.target}`;
    button.addEventListener("mousedown", e => e.preventDefault());
    button.addEventListener("click", () => this.open(this.target));
    return button;
  }
  ignoreEvent() { return true; }
}
class TaskWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly from: number) { super(); }
  eq(other: TaskWidget) { return this.checked === other.checked && this.from === other.from; }
  toDOM(view: EditorView) {
    const input = document.createElement("input"); input.type = "checkbox"; input.checked = this.checked;
    input.disabled = view.state.readOnly;
    input.setAttribute("aria-label", "切换任务完成状态");
    input.addEventListener("change", () => view.dispatch({ changes: { from: this.from + 1, to: this.from + 2, insert: input.checked ? "x" : " " } }));
    return input;
  }
  ignoreEvent() { return true; }
}

const rebuildPreview = StateEffect.define<void>();
function preview(getLinks: () => readonly LinkCandidate[], open: (target: string) => void, focused:()=>boolean) {
  return StateField.define<DecorationSet>({
    create: build, update(value, tr) { return tr.docChanged || tr.selection || tr.effects.some(e => e.is(rebuildPreview)) ? build(tr.state) : value; },
    provide: field => EditorView.decorations.from(field),
  });
  function build(state: EditorState) {
    const text = state.doc.toString();
    const { body, offset } = splitFrontmatter(text);
    const decorations: { from: number; to: number; value: Decoration }[] = [];
    const add = (from: number, to: number, value: Decoration) => decorations.push({ from, to, value });
    if (offset) add(0, offset, Decoration.replace({ block: true, inclusive:false }));
    if (body.split("\n")[0] === "# ") {
      add(offset, offset + 2, Decoration.replace({}));
      add(offset, offset, Decoration.line({ class: "md-heading md-h1" }));
    }
    noteParser.parse(body).iterate({ enter(node) {
      const from = node.from + offset, to = node.to + offset;
      const source = text.slice(from, to);
      const selected = focused() && state.selection.ranges.some(r => r.from <= to && r.to >= from);
      if (/^ATXHeading[1-6]$/.test(node.name)) {
        add(state.doc.lineAt(from).from, state.doc.lineAt(from).from, Decoration.line({ class: `md-heading md-h${node.name.slice(-1)}` }));
        add(from,to,Decoration.mark({class:`md-heading-text md-h${node.name.slice(-1)}`}));
      }
      if (node.name === "HeaderMark" && (state.doc.lineAt(from).number === state.doc.lineAt(offset).number || !selected)) {
        add(from, Math.min(to + 1, state.doc.length), Decoration.replace({})); return false;
      }
      if (node.name === "WikiLink") {
        const [dest, ...aliases] = source.slice(2, -2).split("|");
        const target = dest.split("#")[0].trim();
        const reference = resolveReference(target, getLinks());
        const resolved = Boolean(reference);
        // Keep the stored syntax untouched, but display the destination's title in
        // Live Preview. An explicit alias still takes precedence.
        const label = aliases.join("|").trim() || reference?.title?.trim() || dest;
        if (!selected) add(from, to, Decoration.replace({ widget: new LinkWidget(target, label, resolved, open) }));
        else add(from, to, Decoration.mark({ class: `wiki-link-source${resolved ? "" : " is-unresolved"}` }));
        return false;
      }
      if (node.name === "TaskMarker" && !selected) { add(from, to, Decoration.replace({ widget: new TaskWidget(/x/i.test(source), from) })); return false; }
      if (node.name === "Hashtag") add(from, to, Decoration.mark({ class: "md-tag" }));
      const style = node.name === "StrongEmphasis" ? "md-bold" : node.name === "Emphasis" ? "md-italic" : node.name === "Highlight" ? "md-highlight" : null;
      if (style) {
        const width = node.name === "Emphasis" ? 1 : 2;
        add(from + width, to - width, Decoration.mark({ class: style }));
        if (!selected) { add(from, from + width, Decoration.replace({})); add(to - width, to, Decoration.replace({})); }
        return false;
      }
      if (node.name === "InlineCode") add(from, to, Decoration.mark({ class: "md-code" }));
    } });
    return Decoration.set(decorations.map(d => d.value.range(d.from, d.to)), true);
  }
}

export function MarkdownEditor({ value, onChange, candidates, onOpenLink, readOnly = false, label = "笔记正文" }: {
  value: string; onChange?: (markdown: string) => void; candidates: readonly LinkCandidate[];
  onOpenLink: (target: string) => void; readOnly?: boolean; label?: string;
}) {
  const host = useRef<HTMLDivElement>(null), view = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onOpenLink }); callbacks.current = { onChange, onOpenLink };
  const linkCandidates = useRef(candidates); linkCandidates.current = candidates;
  const externalUpdate = useRef(false);
  const initial = useRef(value);
  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({ parent: host.current, state: EditorState.create({ doc: initial.current, extensions: [
      markdown({ extensions: [noteSyntax] }), history(), keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping, EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly),
      EditorView.contentAttributes.of({ "aria-label": label, spellcheck: "true" }),
      autocompletion({ override: [context => {
        const match = context.matchBefore(/\[\[[^\]\n]*/);
        if (!match) return null;
        return { from: match.from + 2, options: linkCandidates.current.map(note => ({ label: note.title ?? note.id, detail: note.path ?? "", type: "text", apply: (v: EditorView, _c: unknown, from: number, to: number) => {
          const target = linkCandidates.current.filter(c => c.title === note.title).length > 1 ? note.path ?? note.id : note.title ?? note.id;
          const suffix = v.state.sliceDoc(to, to + 2) === "]]" ? "" : "]]";
          v.dispatch({ changes: { from, to, insert: target + suffix }, selection: { anchor: from + target.length + 2 } });
        } })) };
      }] }),
      preview(() => linkCandidates.current, target => callbacks.current.onOpenLink(target),()=>Boolean(view.current?.hasFocus)),
      EditorState.transactionFilter.of(tr => {
        if (!tr.docChanged || readOnly || externalUpdate.current) return tr;
        const offset = splitFrontmatter(tr.newDoc.toString()).offset;
        if (tr.newDoc.lineAt(offset).text.startsWith("# ")) return tr;
        return [tr, { changes: { from: offset, insert: "# " }, sequential: true }];
      }),
      EditorView.updateListener.of(update => {
        if(update.focusChanged)queueMicrotask(()=>{if(view.current===update.view)update.view.dispatch({effects:rebuildPreview.of()});});
        if (!update.docChanged || externalUpdate.current) return;
        callbacks.current.onChange?.(update.state.doc.toString());
        const cursor=update.state.selection.main.head;
        if (!readOnly && update.state.sliceDoc(Math.max(0,cursor-2),cursor)==="[[") queueMicrotask(()=>{
          if(view.current===update.view)startCompletion(update.view);
        });
      }),
    ] }) });
    view.current = editor;
    return () => { editor.destroy(); view.current = null; };
  }, [readOnly, label]);
  useEffect(() => { view.current?.dispatch({ effects: rebuildPreview.of() }); }, [candidates]);
  useEffect(() => {
    initial.current = value;
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value) {
      externalUpdate.current = true;
      try { editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } }); }
      finally { externalUpdate.current = false; }
    }
  }, [value]);
  return <div className="markdown-editor" ref={host} />;
}
