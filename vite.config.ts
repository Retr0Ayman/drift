import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Without this, Rollup's own chunk-naming heuristic attributes
        // shared vendor code (confirmed live: mostly motion/react) to
        // whichever route chunk happens to import it "first" in the
        // dependency graph -- e.g. PublishersDirectory-*.js and
        // usePageMeta-*.js were both 130-180kB despite neither containing
        // that much of their own code, and neither name meant anything
        // real to a reader. Splitting these into their own honestly-named,
        // shared chunks also means they're cached once across every route
        // that uses them, instead of being duplicated into whichever
        // lazy-loaded route chunk first pulled them in.
        manualChunks(id: string) {
          if (id.includes("node_modules")) {
            if (id.includes("/motion/") || id.includes("/framer-motion/")) return "vendor-motion";
            if (id.includes("@radix-ui")) return "vendor-radix";
            if (id.includes("/react-dom/") || id.includes("/react-router") || id.includes("/react/")) return "vendor-react";
            // The world map on Publishers/franchise pages -- a real, large
            // TopoJSON dataset, not something that shrinks by moving it,
            // but honestly named and cached once instead of inflating
            // PublishersDirectory's own chunk under its name.
            if (id.includes("d3-geo") || id.includes("topojson-client") || id.includes("world-atlas")) return "vendor-worldmap";
          }
        },
      },
    },
  },
})
