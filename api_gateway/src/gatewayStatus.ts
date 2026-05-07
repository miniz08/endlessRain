import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { audit_log } from "@prisma/client";
import { gatewayRoutes, routeTarget, type GatewayRoute } from "./config/routes.js";
import { prisma } from "./lib/prisma.js";

type JwtUser = {
  sub?: string;
  username?: string;
  email?: string;
  role?: string;
};

type RouteMetric = {
  routeName: string;
  prefix: string;
  target: string;
  requestCount: number;
  errorCount: number;
  methods: Record<string, number>;
  lastStatusCode?: number;
  lastLatencyMs?: number;
  lastSeenAt?: string;
};

const routeMetrics = new Map<string, RouteMetric>();

export function collectGatewayMetrics(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith("/api") || req.path.startsWith("/api/gateway")) {
    next();
    return;
  }

  const route = matchGatewayRoute(req.path);
  if (!route) {
    next();
    return;
  }

  const started = process.hrtime.bigint();
  res.on("finish", () => {
    const latencyMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    const metric = routeMetrics.get(route.name) ?? {
      routeName: route.name,
      prefix: route.prefix,
      target: routeTarget(route),
      requestCount: 0,
      errorCount: 0,
      methods: {},
    };

    metric.requestCount += 1;
    metric.methods[req.method] = (metric.methods[req.method] ?? 0) + 1;
    if (res.statusCode >= 500) metric.errorCount += 1;
    metric.lastStatusCode = res.statusCode;
    metric.lastLatencyMs = Math.round(latencyMs * 100) / 100;
    metric.lastSeenAt = new Date().toISOString();
    routeMetrics.set(route.name, metric);
  });

  next();
}

export function gatewayRoutesController(_req: Request, res: Response): void {
  res.json({
    items: gatewayRoutes.map((route) => ({
      name: route.name,
      prefix: route.prefix,
      targetEnv: route.targetEnv,
      target: routeTarget(route),
      stripPrefix: route.stripPrefix,
    })),
  });
}

export function gatewayMetricsController(_req: Request, res: Response): void {
  res.json({
    items: [...routeMetrics.values()].sort((a, b) => a.routeName.localeCompare(b.routeName)),
    uptimeSeconds: Math.round(process.uptime()),
    time: new Date().toISOString(),
  });
}

export async function gatewayHealthController(_req: Request, res: Response): Promise<void> {
  const services = groupUpstreamServices();
  const upstreams = await Promise.all(services.map(checkUpstreamHealth));
  const healthyCount = upstreams.filter((item) => item.status === "ok").length;
  const status = healthyCount === upstreams.length ? "ok" : healthyCount === 0 ? "down" : "degraded";

  res.status(status === "down" ? 503 : 200).json({
    service: "api_gateway",
    status,
    upstreams,
    uptimeSeconds: Math.round(process.uptime()),
    time: new Date().toISOString(),
  });
}

export async function auditLogsController(req: Request, res: Response): Promise<void> {
  const auth = readAuth(req);
  if (!auth) {
    res.status(401).json({ error: { code: "AUTH_REQUIRED", message: "Authentication required" } });
    return;
  }

  if (!isReviewerRole(auth.role)) {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "Reviewer or admin role required" } });
    return;
  }

  const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 100);
  const userId = req.query.userId ? Number(req.query.userId) : undefined;
  const result = typeof req.query.result === "string" ? req.query.result : undefined;
  const action = typeof req.query.action === "string" ? req.query.action : undefined;

  try {
    const rows: audit_log[] = await prisma.audit_log.findMany({
      where: {
        ...(Number.isInteger(userId) && userId! > 0 ? { userId } : {}),
        ...(result ? { result } : {}),
        ...(action ? { action: { contains: action } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    res.json({
      items: rows.map((row) => ({
        ...row,
        id: row.id.toString(),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Audit query failed";
    res.status(503).json({
      error: {
        code: "AUDIT_LOG_UNAVAILABLE",
        message,
      },
    });
  }
}

export async function adminSummaryController(req: Request, res: Response): Promise<void> {
  const auth = readAuth(req);
  if (!auth) {
    res.status(401).json({ error: { code: "AUTH_REQUIRED", message: "Authentication required" } });
    return;
  }

  if (!isReviewerRole(auth.role)) {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "Reviewer or admin role required" } });
    return;
  }

  const windowHours = Math.min(Math.max(Number(req.query.hours ?? 24), 1), 168);
  const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  try {
    const rows = await prisma.audit_log.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });

    const failures = rows.filter((row) => row.result === "failure");
    const topActions = topBy(rows.map((row) => row.action), 8);
    const topRoutes = topBy(rows.map((row) => routeGroup(row.route)), 8);

    res.json({
      windowHours,
      since: since.toISOString(),
      totals: {
        auditEvents: rows.length,
        success: rows.length - failures.length,
        failure: failures.length,
        failureRate: rows.length ? Math.round((failures.length / rows.length) * 10000) / 100 : 0,
      },
      topActions,
      topRoutes,
      recentFailures: failures.slice(0, 8).map((row) => ({
        id: row.id.toString(),
        action: row.action,
        route: row.route,
        statusCode: row.statusCode,
        detail: row.detail,
        createdAt: row.createdAt,
      })),
      gatewayMetrics: [...routeMetrics.values()].sort((a, b) => b.requestCount - a.requestCount),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Admin summary query failed";
    res.status(503).json({
      error: {
        code: "ADMIN_SUMMARY_UNAVAILABLE",
        message,
      },
    });
  }
}

function groupUpstreamServices() {
  const map = new Map<
    string,
    {
      key: string;
      target: string;
      targetEnv: string;
      routes: string[];
    }
  >();

  for (const route of gatewayRoutes) {
    const target = routeTarget(route);
    const key = `${route.targetEnv}:${target}`;
    const current = map.get(key) ?? {
      key: serviceName(route.targetEnv),
      target,
      targetEnv: route.targetEnv,
      routes: [],
    };
    current.routes.push(route.name);
    map.set(key, current);
  }

  return [...map.values()];
}

async function checkUpstreamHealth(service: ReturnType<typeof groupUpstreamServices>[number]) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.UPSTREAM_HEALTH_TIMEOUT_MS ?? 1500));

  try {
    const healthUrl = new URL("/health", service.target);
    const response = await fetch(healthUrl, {
      signal: controller.signal,
      headers: { "x-gateway-health-check": "true" },
    });
    const text = await response.text();

    return {
      ...service,
      status: response.ok ? "ok" : "error",
      httpStatus: response.status,
      latencyMs: Date.now() - started,
      body: parseJson(text),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Health check failed";
    return {
      ...service,
      status: "error",
      latencyMs: Date.now() - started,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function readAuth(req: Request): JwtUser | null {
  const token = extractAccessToken(req);
  if (!token) return null;

  try {
    return jwt.verify(token, process.env.ACCESS_TOKEN_SECRET ?? process.env.JWT_SECRET ?? "dev-access-token-secret") as JwtUser;
  } catch {
    return null;
  }
}

function extractAccessToken(req: Request): string | undefined {
  const authorization = req.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length).trim();
  }
  return parseCookie(req.headers.cookie ?? "")["ls_access_token"];
}

function parseCookie(header: string): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const pair of header.split(";")) {
    const index = pair.indexOf("=");
    if (index <= 0) continue;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    result[key] = decodeURIComponent(value);
  }
  return result;
}

function isReviewerRole(role?: string): boolean {
  const normalized = role?.toLowerCase();
  return normalized === "admin" || normalized === "reviewer";
}

function matchGatewayRoute(pathname: string): GatewayRoute | undefined {
  return gatewayRoutes.find((route) => matchesRoutePrefix(pathname, route.prefix));
}

function matchesRoutePrefix(pathname: string, prefix: string): boolean {
  const pathParts = pathname.split("/").filter(Boolean);
  const prefixParts = prefix.split("/").filter(Boolean);
  if (prefixParts.length > pathParts.length) return false;

  return prefixParts.every((part, index) => part.startsWith(":") || part === pathParts[index]);
}

function serviceName(targetEnv: string): string {
  return targetEnv.toLowerCase().replace(/_url$/, "");
}

function topBy(values: string[], limit: number) {
  const map = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    map.set(value, (map.get(value) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

function routeGroup(route: string) {
  const parts = route.split("/").filter(Boolean);
  return parts.length >= 2 ? `/${parts[0]}/${parts[1]}` : route || "/";
}

function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 300);
  }
}
