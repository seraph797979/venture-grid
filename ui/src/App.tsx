// modules/venture-grid/ui/src/App.tsx
import { useEffect } from "react";
import { bootstrapAuth } from "./auth";
import { Layout } from "./components/Layout";
import { AboutPage } from "./pages/AboutPage";
import { AdminPage } from "./pages/AdminPage";
import { BriefPage } from "./pages/BriefPage";
import { DocsPage } from "./pages/DocsPage";
import { GraphPage } from "./pages/GraphPage";
import { HomePage } from "./pages/HomePage";
import { SearchPage } from "./pages/SearchPage";
import { SubmitPage } from "./pages/SubmitPage";
import { TimelinePage } from "./pages/TimelinePage";
import { VenturePage } from "./pages/VenturePage";
import { Link, matchPrefix, usePath } from "./router";
import { t } from "./i18n";

function NotFound({ path }: { path: string }) {
  return (
    <div className="container">
      <h2>404</h2>
      <p className="muted mono break-all">{path}</p>
      <Link to="/" className="btn">{t("nav.home")}</Link>
    </div>
  );
}

export function App() {
  const path = usePath();

  // 有本地令牌时先验证再渲染“已登录”状态，避免菜单闪一下
  useEffect(() => {
    void bootstrapAuth();
  }, []);

  let page: React.ReactNode;
  if (path === "/" || path === "") {
    page = <HomePage />;
  } else if (path === "/graph") {
    page = <GraphPage />;
  } else if (path === "/timeline") {
    page = <TimelinePage />;
  } else if (path === "/brief") {
    page = <BriefPage />;
  } else if (path === "/search") {
    page = <SearchPage />;
  } else if (path === "/submit") {
    page = <SubmitPage />;
  } else if (path === "/about") {
    page = <AboutPage />;
  } else if (path === "/admin") {
    page = <AdminPage />;
  } else if (path === "/docs") {
    page = <DocsPage slug={null} />;
  } else if (matchPrefix(path, "/docs/") !== null) {
    page = <DocsPage slug={matchPrefix(path, "/docs/")} />;
  } else if (matchPrefix(path, "/venture/") !== null) {
    page = <VenturePage id={matchPrefix(path, "/venture/") as string} />;
  } else {
    page = <NotFound path={path} />;
  }

  return <Layout>{page}</Layout>;
}