import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/app.css";
import "./styles/simple.css";
import { App } from "./App";
import { applyDemoParams } from "./state/demo";
import { actions, getState } from "./state/store";

// Dev server only: ?demo&mode=simple&view=shop opens the starter filter on a given screen
// (used for checking layouts and capturing the guide's screenshots).
if (import.meta.env.DEV) {
  applyDemoParams(new URLSearchParams(location.search));
  // The app's live store, for the UI stress test (scripts can't import the same module instance).
  (window as unknown as { __ff: unknown }).__ff = { getState, actions };
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
