import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initProjectStorage } from "./utils/projectStorageClient";

async function bootstrap() {
  try {
    await initProjectStorage();
  } catch (err) {
    console.error("Storage bootstrap failed:", err);
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

void bootstrap();
