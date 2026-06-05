import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Composer } from "./Composer";
import { registerServiceWorker } from "./registerServiceWorker";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Composer />
  </StrictMode>,
);

registerServiceWorker();
