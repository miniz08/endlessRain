import type { RouterConfig } from "@nuxt/schema";

export default {
  routes: (routes) =>
    routes.map((route) => {
      if (route.path === "/" || route.path.endsWith("/")) return route;
      const aliases = Array.isArray(route.alias) ? route.alias : route.alias ? [route.alias] : [];
      return {
        ...route,
        alias: [...aliases, `${route.path}/`],
      };
    }),
} satisfies RouterConfig;
