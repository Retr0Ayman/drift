import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import SmoothScroll from "./components/layout/SmoothScroll";
import "./styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <SmoothScroll>
        <App />
      </SmoothScroll>
    </HashRouter>
  </StrictMode>,
);
