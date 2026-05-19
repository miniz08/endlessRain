export default defineNuxtConfig({
  compatibilityDate: "2024-11-01",
  devtools: { enabled: false },
  css: ["katex/dist/katex.min.css", "~/assets/css/base.css"],
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE ?? "/api",
      wsBase: process.env.NUXT_PUBLIC_WS_BASE ?? "",
      frontendPort: process.env.NUXT_PUBLIC_FRONTEND_PORT ?? process.env.FRONTEND_HTTP_PORT ?? "800",
    },
  },
  typescript: {
    strict: true,
  },
  app: {
    pageTransition: { name: "page", mode: "out-in" },
    layoutTransition: { name: "layout", mode: "out-in" },
  },
});
