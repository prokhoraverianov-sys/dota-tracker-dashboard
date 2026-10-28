import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
export default defineConfig({
  plugins: [react()],
  base: "/dota-tracker-dashboard/",
  server: { port: 5173 },
  preview: { port: 4173 },
})
