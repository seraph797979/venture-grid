import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "@xyflow/react/dist/style.css";

const root = document.getElementById("root");
if (root === null) throw new Error("缺少 #root");
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);