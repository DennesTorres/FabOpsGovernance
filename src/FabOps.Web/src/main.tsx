import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/layers.css"; // declares cascade-layer order first — must precede the others
import "@copilotkit/react-core/v2/styles.css";
import "./styles/app.css";
import "./styles/fabops-additions.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
