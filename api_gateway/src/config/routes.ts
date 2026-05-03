export type GatewayRoute = {
  name: string;
  prefix: string;
  targetEnv: string;
  defaultTarget: string;
  stripPrefix?: string;
};

export const gatewayRoutes: GatewayRoute[] = [
  {
    name: "user-auth",
    prefix: "/api/auth",
    targetEnv: "USER_SERVICE_URL",
    defaultTarget: "http://127.0.0.1:3003",
    stripPrefix: "/api",
  },
  {
    name: "blog-user-follow",
    prefix: "/api/users/:userId/follow",
    targetEnv: "BLOG_SERVICE_URL",
    defaultTarget: "http://127.0.0.1:3002",
    stripPrefix: "/api",
  },
  {
    name: "blog-user-follow-summary",
    prefix: "/api/users/:userId/follow-summary",
    targetEnv: "BLOG_SERVICE_URL",
    defaultTarget: "http://127.0.0.1:3002",
    stripPrefix: "/api",
  },
  {
    name: "user-public",
    prefix: "/api/users",
    targetEnv: "USER_SERVICE_URL",
    defaultTarget: "http://127.0.0.1:3003",
    stripPrefix: "/api",
  },
  {
    name: "blog-content",
    prefix: "/api/articles",
    targetEnv: "BLOG_SERVICE_URL",
    defaultTarget: "http://127.0.0.1:3002",
    stripPrefix: "/api",
  },
  {
    name: "blog-comments",
    prefix: "/api/comments",
    targetEnv: "BLOG_SERVICE_URL",
    defaultTarget: "http://127.0.0.1:3002",
    stripPrefix: "/api",
  },
  {
    name: "blog-following",
    prefix: "/api/following",
    targetEnv: "BLOG_SERVICE_URL",
    defaultTarget: "http://127.0.0.1:3002",
    stripPrefix: "/api",
  },
  {
    name: "blog-followers",
    prefix: "/api/followers",
    targetEnv: "BLOG_SERVICE_URL",
    defaultTarget: "http://127.0.0.1:3002",
    stripPrefix: "/api",
  },
  {
    name: "blog-feeds",
    prefix: "/api/feeds",
    targetEnv: "BLOG_SERVICE_URL",
    defaultTarget: "http://127.0.0.1:3002",
    stripPrefix: "/api",
  },
  {
    name: "blog-reco",
    prefix: "/api/reco",
    targetEnv: "BLOG_SERVICE_URL",
    defaultTarget: "http://127.0.0.1:3002",
    stripPrefix: "/api",
  },
  {
    name: "ai-analysis",
    prefix: "/api/analysis",
    targetEnv: "AI_SERVICE_URL",
    defaultTarget: "http://127.0.0.1:3004",
    stripPrefix: "/api",
  },
  {
    name: "chat",
    prefix: "/api/chat",
    targetEnv: "CHAT_SERVICE_URL",
    defaultTarget: "http://127.0.0.1:3005",
    stripPrefix: "/api",
  },
];

export function routeTarget(route: GatewayRoute): string {
  return process.env[route.targetEnv] ?? route.defaultTarget;
}
