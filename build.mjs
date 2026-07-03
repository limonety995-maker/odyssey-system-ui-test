import { build } from "esbuild";

const shared = {
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  sourcemap: false,
  legalComments: "none",
  logLevel: "info",
  // Screen-scoped stylesheets are imported as text strings and injected at runtime,
  // keeping each slice's CSS isolated without emitting extra CSS assets.
  loader: { ".css": "text" },
};

await build({
  ...shared,
  entryPoints: ["main.js"],
  outfile: "assets/main.js",
});

await build({
  ...shared,
  entryPoints: ["gm-extension/main.js"],
  outfile: "gm-extension/assets/main.js",
});

await build({
  ...shared,
  entryPoints: ["character-sheet-extension/main.js"],
  outfile: "character-sheet-extension/assets/main.js",
});

await build({
  ...shared,
  entryPoints: ["background.js"],
  outfile: "assets/background.js",
});

await build({
  ...shared,
  entryPoints: ["hud/overlay/combatHudOverlayPage.js"],
  outfile: "assets/combat-hud-overlay.js",
});

await build({
  ...shared,
  entryPoints: ["hud/debug/debugConsolePage.js"],
  outfile: "assets/debug-console.js",
});
