"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "chordnote:latex";
const CHANGE_EVENT = "chordnote:latex-change";

const listeners = new Set<() => void>();

export function isLatexEnabled() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setLatexEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    /* 隐私模式等场景下 localStorage 不可用，本次会话仍然生效 */
  }
  listeners.forEach((listener) => listener());
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function onLatexPreferenceChange(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLatexEnabled() {
  return useSyncExternalStore(subscribe, isLatexEnabled, () => true);
}
