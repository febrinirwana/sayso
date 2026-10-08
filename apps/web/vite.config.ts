import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const paper = "#FDFBF4";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon.png", "sfx/*.mp3"],
      // three.js only serves S0/S5; keep it out of the install-time precache (DESIGN section 7).
      workbox: {
        globIgnores: [
          "**/voxels-*.js",
          "**/Lights-*.js",
          "**/Stage-*.js",
          "**/HeroScene-*.js",
          "**/WinBurst-*.js",
        ],
      },
      manifest: {
        name: "SAYSO",
        short_name: "SAYSO",
        description: "Bet on the words before they're spoken. Monad testnet.",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        background_color: paper,
        theme_color: paper,
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  server: { port: 5173 },
});
