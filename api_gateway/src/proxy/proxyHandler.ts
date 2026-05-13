import type { Express } from "express";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { createProxyMiddleware } from "http-proxy-middleware";
import { type GatewayRoute, gatewayRoutes, routeTarget } from "../config/routes.js";

type ProxyMiddlewareWithUpgrade = ReturnType<typeof createGatewayProxy> & {
  upgrade?: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
};

export type RegisteredProxy = {
  route: GatewayRoute;
  proxy: ProxyMiddlewareWithUpgrade;
};

export function registerProxies(app: Express): RegisteredProxy[] {
  const registered: RegisteredProxy[] = [];
  for (const route of gatewayRoutes) {
    const proxy = createGatewayProxy(route) as ProxyMiddlewareWithUpgrade;
    registered.push({ route, proxy });
    app.use(route.prefix, proxy);
  }
  return registered;
}

export function handleProxyUpgrade(
  registered: RegisteredProxy[],
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): boolean {
  const path = req.url ?? "/";
  const pathname = new URL(path, `http://${req.headers.host ?? "localhost"}`).pathname;
  const match = registered.find(({ route }) => route.supportsWebSocket && matchesRoutePrefix(pathname, route.prefix));
  if (!match?.proxy.upgrade) return false;

  req.url = rewritePath(req, match.route);
  match.proxy.upgrade(req, socket, head);
  return true;
}

function createGatewayProxy(route: GatewayRoute) {
  const target = routeTarget(route);
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    xfwd: true,
    ws: route.supportsWebSocket === true,
    pathRewrite: (_path, req) => rewritePath(req, route),
    on: {
      proxyReq(proxyReq, req) {
        const requestId = readRequestId(req);
        if (requestId) {
          proxyReq.setHeader("x-request-id", requestId);
        }
        proxyReq.setHeader("x-gateway-route", route.name);
      },
      proxyReqWs(proxyReq, req) {
        const requestId = readRequestId(req);
        if (requestId) {
          proxyReq.setHeader("x-request-id", requestId);
        }
        proxyReq.setHeader("x-gateway-route", route.name);
      },
      error(err, req, res) {
        console.error(`[api_gateway] proxy ${route.name} failed`, err);
        const response = res as ServerResponse;
        if (!response.headersSent) {
          response.writeHead(502, { "content-type": "application/json" });
        }
        response.end(
          JSON.stringify({
            error: {
              code: "BAD_GATEWAY",
              message: `Gateway failed to reach ${route.name}`,
              requestId: readRequestId(req),
            },
          }),
        );
      },
    },
  });
}

function rewritePath(req: IncomingMessage, route: GatewayRoute): string {
  const path = (req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url ?? "/";
  if (!route.stripPrefix) return path;
  return path.startsWith(route.stripPrefix) ? path.slice(route.stripPrefix.length) || "/" : path;
}

function readRequestId(req: IncomingMessage): string | undefined {
  return (req as IncomingMessage & { requestId?: string }).requestId;
}

function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  const pathParts = pathname.split("/").filter(Boolean);
  const prefixParts = prefix.split("/").filter(Boolean);
  if (prefixParts.length > pathParts.length) return false;

  return prefixParts.every((part, index) => {
    return part.startsWith(":") || part === pathParts[index];
  });
}
