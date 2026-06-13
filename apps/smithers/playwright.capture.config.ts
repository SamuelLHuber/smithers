import { defineConfig } from "@playwright/test";
import realConfig from "./playwright.real.config";

export default defineConfig({
  ...realConfig,
  outputDir: "capture-results",
  reporter: [["json", { outputFile: "capture-report/report.json" }], ["line"]],
  workers: 1,
  use: {
    ...realConfig.use,
    viewport: { width: 1280, height: 720 },
    video: { mode: "on", size: { width: 1280, height: 720 } },
  },
  webServer: realConfig.webServer,
});
