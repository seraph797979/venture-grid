// modules/venture-grid/ui/src/components/Markdown.tsx
/**
 * 运行期文档渲染：marked + xss 消毒（使用 xss 默认安全白名单）。
 * - `vg://venture/<id>` 先转成站内路径
 * - 站内链接点击不整页刷新
 */
import { marked } from "marked";
import { useMemo, type MouseEvent } from "react";
import xss from "xss";
import { navigate } from "../router";

marked.setOptions({ gfm: true, breaks: true });

const SANITIZE_OPTIONS = {
  stripIgnoreTag: true,
  stripIgnoreTagBody: ["script", "style"],
};

export function Markdown({ source, className = "" }: { source: string; className?: string }) {
  const html = useMemo(() => {
    const normalized = source.replace(/vg:\/\/venture\/([A-Za-z0-9_-]+)/g, "/venture/$1");
    const rendered = marked.parse(normalized) as string;
    return xss(rendered, SANITIZE_OPTIONS);
  }, [source]);

  const onClick = (event: MouseEvent<HTMLDivElement>): void => {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest("a");
    if (anchor === null || anchor === undefined) return;
    const href = anchor.getAttribute("href") ?? "";
    if (!href.startsWith("/")) return;
    event.preventDefault();
    navigate(href);
  };

  return (
    <div
      className={`markdown ${className}`}
      onClick={onClick}
      // 已通过 xss 白名单消毒
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}