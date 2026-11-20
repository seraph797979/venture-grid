// modules/venture-grid/ui/src/i18n/index.ts
/**
 * 极简 i18n：只覆盖 UI 文案。
 * 硬边界（PRD C2）：用户录入内容永远原样渲染，不经过这里。
 */
import { useSyncExternalStore } from "react";
import zh from "./zh.json";
import en from "./en.json";

export type Lang = "zh" | "en";

const DICTS: Record<Lang, unknown> = { zh, en };
const STORAGE_KEY = "vg_lang";
const listeners = new Set<() => void>();

function initialLang(): Lang {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "zh" || saved === "en") return saved;
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

let lang: Lang = initialLang();
document.documentElement.lang = lang;

function emit(): void {
  for (const listener of listeners) listener();
}

export function currentLang(): Lang {
  return lang;
}

export function setLang(next: Lang): void {
  if (next === lang) return;
  lang = next;
  localStorage.setItem(STORAGE_KEY, next);
  document.documentElement.lang = next;
  emit();
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => lang,
    () => lang,
  );
}

function lookup(dict: unknown, path: string): unknown {
  let node: unknown = dict;
  for (const part of path.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/** t("brief.failed")；缺失时回退 zh，再回退 key 本身。 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const value = lookup(DICTS[lang], key) ?? lookup(DICTS.zh, key);
  if (typeof value !== "string") {
    if (vars === undefined) return key;
    return key;
  }
  if (vars === undefined) return value;
  return value.replace(/\{(\w+)\}/g, (_match, name: string) => String(vars[name] ?? `{${name}}`));
}

/** 用于 kinds 这类有限枚举：kind 值本身不是 UI 文案。 */
export function tOptional(key: string): string | null {
  const value = lookup(DICTS[lang], key) ?? lookup(DICTS.zh, key);
  return typeof value === "string" ? value : null;
}