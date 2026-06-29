// Browser IIFE bundle (global `PyretTS`): the lowering + Value->runtime-AST converter.
// Build: npx esbuild src-ts/bundle-entry-browser.ts --bundle --format=iife --global-name=PyretTS --outfile=browser-proof/pyret-ts-lowering.js
export { Lowering } from "./lower.ts";
export { toRuntime } from "./to-runtime.ts";
