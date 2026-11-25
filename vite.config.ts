import { defineConfig } from "vite";
// Relative base works for GitHub Pages project sites regardless of repo-name casing.
export default defineConfig({ base: "./", build: { target: "es2022" } });
