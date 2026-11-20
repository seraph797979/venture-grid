// modules/venture-grid/ui/src/components/Layout.tsx
import type { ReactNode } from "react";
import { logout, useAuth } from "../auth";
import { BrandMark } from "./BrandMark";
import { setLang, t, useLang } from "../i18n";
import { Link, usePath } from "../router";
import { Spinner } from "./Bits";

const NAV = [
  { href: "/", key: "nav.home" },
  { href: "/graph", key: "nav.graph" },
  { href: "/timeline", key: "nav.timeline" },
  { href: "/brief", key: "nav.brief" },
  { href: "/search", key: "nav.search" },
  { href: "/docs", key: "nav.docs" },
  { href: "/about", key: "nav.about" },
  { href: "/admin", key: "nav.admin", adminOnly: true },
];

export function Layout({ children }: { children: ReactNode }) {
  const path = usePath();
  const lang = useLang();
  const auth = useAuth();

  const items = NAV.filter((item) => item.adminOnly !== true || auth.status === "admin");

  return (
    <div className="app">
      <header className="app-header">
        <div className="container bar">
          <Link to="/" className="brand">
            <BrandMark />
            <span>Venture-Grid</span>
          </Link>
          <nav className="nav">
            {items.map((item) => {
              const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
              return (
                <Link key={item.href} to={item.href} className={active ? "active" : ""}>
                  {t(item.key)}
                </Link>
              );
            })}
          </nav>

          {auth.status === "checking" && (
            <span className="flex muted tiny" style={{ gap: 6 }}>
              <Spinner /> {t("auth.checking")}
            </span>
          )}
          {auth.status === "anonymous" && (
            <Link to="/admin" className="btn btn-sm">{t("auth.login")}</Link>
          )}
          {auth.status === "admin" && (
            <span className="flex" style={{ gap: 8 }}>
              <span className="badge badge-ready">{t("auth.loggedIn")}</span>
              <button type="button" className="btn btn-sm" onClick={logout}>
                {t("auth.logout")}
              </button>
            </span>
          )}

          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setLang(lang === "zh" ? "en" : "zh")}
            title="UI language / 界面语言"
          >
            {lang === "zh" ? "EN" : "中文"}
          </button>
        </div>
      </header>

      <main className="page">{children}</main>

      <footer className="app-footer">
        <div className="container spread" style={{ alignItems: "flex-start" }}>
          <div>
            <div style={{ fontWeight: 600, color: "var(--ink-2)" }}>Venture-Grid</div>
            <div>{t("hero.slogan")}</div>
          </div>
          <div className="links">
            <Link to="/about">{t("footer.glossary")}</Link>
            <Link to="/about">{t("footer.about")}</Link>
            <Link to="/docs/guide">{t("footer.guide")}</Link>
            <Link to="/admin">{t("footer.export")}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}