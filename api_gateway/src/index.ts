import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import { gatewayRoutes, routeTarget } from "./config/routes.js";
import {
  adminSummaryController,
  auditLogsController,
  collectGatewayMetrics,
  gatewayHealthController,
  gatewayMetricsController,
  gatewayRoutesController,
} from "./gatewayStatus.js";
import { handleProxyUpgrade, registerProxies } from "./proxy/proxyHandler.js";
import { assignRequestId } from "./utils/requestId.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.disable("x-powered-by");
app.use(assignRequestId);
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? true,
    credentials: true,
  }),
);
app.use(
  rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
    limit: Number(process.env.RATE_LIMIT_MAX ?? 600),
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.get("/health", (_req, res) => {
  res.json({
    service: "api_gateway",
    status: "ok",
    routes: gatewayRoutes.map((route) => ({
      name: route.name,
      prefix: route.prefix,
      target: routeTarget(route),
    })),
    time: new Date().toISOString(),
  });
});

app.get("/api/gateway/health", gatewayHealthController);
app.get("/api/gateway/routes", gatewayRoutesController);
app.get("/api/gateway/metrics", gatewayMetricsController);
app.get("/api/gateway/audit-logs", auditLogsController);
app.get("/api/gateway/admin-summary", adminSummaryController);
app.use(collectGatewayMetrics);

const registeredProxies = registerProxies(app);

app.use("/api", (req, res) => {
  res.status(404).json({
    error: {
      code: "GATEWAY_ROUTE_NOT_FOUND",
      message: `No upstream route for ${req.originalUrl}`,
      requestId: req.requestId,
    },
  });
});

const server = app.listen(port, () => {
  console.log(`[api_gateway] listening on ${port}`);
});

server.on("upgrade", (req, socket, head) => {
  const handled = handleProxyUpgrade(registeredProxies, req, socket, head);
  if (!handled) {
    socket.destroy();
  }
});
