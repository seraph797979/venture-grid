// modules/venture-grid/ui/src/pages/SubmitPage.tsx
/** 独立页仍保留，表单与首页内嵌版本共用。 */
import { SubmitForm } from "../components/SubmitForm";
import { t } from "../i18n";

export function SubmitPage() {
  return (
    <div className="container" style={{ maxWidth: 680 }}>
      <h2>{t("submit.title")}</h2>
      <p className="muted small">{t("submit.intro")}</p>
      <SubmitForm />
    </div>
  );
}