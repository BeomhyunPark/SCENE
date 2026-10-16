import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "@fontsource/noto-sans-kr/korean-400.css";
import "@fontsource/noto-sans-kr/korean-500.css";
import "@fontsource/noto-sans-kr/korean-700.css";
import "@fontsource/noto-sans-kr/latin-400.css";
import "@fontsource/noto-sans-kr/latin-500.css";
import "@fontsource/noto-sans-kr/latin-700.css";
import "./styles/global.css";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) {
  throw new Error("root element is missing");
}

async function start(appRoot: HTMLElement): Promise<void> {
  if (import.meta.env.DEV && import.meta.env.VITE_API_MOCK === "1") {
    const { worker } = await import("./mocks/browser");
    await worker.start({ onUnhandledFrame: "bypass" });
  }

  createRoot(appRoot).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
}

void start(root);
