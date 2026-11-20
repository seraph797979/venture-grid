// modules/venture-grid/ui/src/router.tsx
/** 极简 history 路由：服务端已做 SPA fallback，这里只负责路径订阅与跳转。 */
import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";

const listeners = new Set<() => void>();
let currentUrl = window.location.pathname + window.location.search;

function emit(): void {
  currentUrl = window.location.pathname + window.location.search;
  for (const listener of listeners) listener();
}

window.addEventListener("popstate", emit);

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 带 query 的完整位置；/search?q=x 的变化也会触发重渲染。 */
export function useLocationString(): string {
  return useSyncExternalStore(
    subscribe,
    () => currentUrl,
    () => currentUrl,
  );
}

export function usePath(): string {
  return useLocationString().split("?")[0] ?? "/";
}

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  if (to === currentUrl) return;
  if (options.replace === true) window.history.replaceState(null, "", to);
  else window.history.pushState(null, "", to);
  emit();
  window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string };

export function Link({ to, onClick, ...rest }: LinkProps) {
  const handle = (event: MouseEvent<HTMLAnchorElement>): void => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (event.button !== 0) return;
    event.preventDefault();
    navigate(to);
  };
  return <a href={to} {...rest} onClick={handle} />;
}

/** 路由参数解析：/venture/:id → "id" */
export function matchPrefix(path: string, prefix: string): string | null {
  if (!path.startsWith(prefix)) return null;
  const rest = path.slice(prefix.length);
  if (rest === "" || rest.includes("/")) return null;
  return decodeURIComponent(rest);
}

export function queryParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

export function setQuery(name: string, value: string): void {
  const url = new URL(window.location.href);
  if (value === "") url.searchParams.delete(name);
  else url.searchParams.set(name, value);
  navigate(`${url.pathname}${url.search}`);
}