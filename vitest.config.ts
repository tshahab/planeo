import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({ test: { environment: "node", sequence: { concurrent: false }, fileParallelism: false }, resolve: { alias: { "@": path.resolve(__dirname, "src") } } });
