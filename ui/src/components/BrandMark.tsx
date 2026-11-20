// modules/venture-grid/ui/src/components/BrandMark.tsx
/** 站点主图标：直接使用用户提供的 logo 原文件（原样复制，未重绘、未裁剪、未压缩）。 */
export function BrandMark({ className = "" }: { className?: string }) {
  return <img className={`brand-logo ${className}`} src="/logo-original.png" alt="" aria-hidden="true" />;
}