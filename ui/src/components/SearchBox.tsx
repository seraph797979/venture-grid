// modules/venture-grid/ui/src/components/SearchBox.tsx
import { useState } from "react";
import { t } from "../i18n";
import { navigate } from "../router";

export function SearchBox({ initial = "", autoFocus = false }: { initial?: string; autoFocus?: boolean }) {
  const [value, setValue] = useState(initial);
  return (
    <form
      className="search-bar"
      onSubmit={(event) => {
        event.preventDefault();
        const query = value.trim();
        navigate(query === "" ? "/search" : `/search?q=${encodeURIComponent(query)}`);
      }}
      role="search"
    >
      <input
        className="input grow"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t("search.placeholder")}
        autoFocus={autoFocus}
        aria-label={t("search.placeholder")}
      />
      <button type="submit" className="btn">
        {t("nav.search")}
      </button>
    </form>
  );
}