<template>
  <div class="page ops-page">
    <section class="stack">
      <div class="panel">
        <div class="row" style="justify-content: space-between">
          <h2 style="margin: 0">运维控制台</h2>
          <button class="ghost" :disabled="loading" @click="loadOps">{{ loading ? "刷新中" : "刷新" }}</button>
        </div>
      </div>

      <div class="ops-top-grid">
        <div class="panel">
          <div class="row" style="justify-content: space-between">
            <h3 style="margin: 0">服务状态</h3>
            <span v-if="health" class="status-pill" :class="statusClass(health.status)">{{ health.status }}</span>
          </div>
          <div v-if="health" class="ops-service-grid">
            <div v-for="item in health.upstreams" :key="`${item.key}-${item.target}`" class="metric-card compact">
              <div class="row" style="justify-content: space-between">
                <strong>{{ item.key }}</strong>
                <span class="status-dot" :class="statusClass(item.status)"></span>
              </div>
              <p class="muted">{{ item.target }}</p>
              <p>{{ item.httpStatus || "-" }} · {{ item.latencyMs }}ms</p>
            </div>
          </div>
          <div v-else class="empty">暂无状态数据</div>
        </div>

        <div class="panel">
          <h3 style="margin-top: 0">标签库</h3>
          <p v-if="taxonomy">{{ taxonomy.count }} 个标签 · {{ taxonomy.categories.length }} 个大类</p>
          <p v-else-if="taxonomyError" class="error">{{ taxonomyError }}</p>
          <p v-else class="muted">{{ canAdmin ? "加载中" : "需要 admin" }}</p>
        </div>
      </div>

      <div class="panel">
        <div class="row" style="justify-content: space-between">
          <h3 style="margin: 0">管理员监控</h3>
          <span class="muted">最近 {{ adminSummary?.windowHours ?? 24 }} 小时</span>
        </div>
        <p v-if="summaryError" class="error">{{ summaryError }}</p>
        <div v-if="adminSummary" class="ops-summary-grid">
          <div class="metric-card compact">
            <strong>审计事件</strong>
            <p>{{ adminSummary.totals.auditEvents }}</p>
          </div>
          <div class="metric-card compact">
            <strong>成功</strong>
            <p>{{ adminSummary.totals.success }}</p>
          </div>
          <div class="metric-card compact">
            <strong>失败</strong>
            <p>{{ adminSummary.totals.failure }}</p>
          </div>
          <div class="metric-card compact">
            <strong>失败率</strong>
            <p>{{ adminSummary.totals.failureRate }}%</p>
          </div>
        </div>
        <div v-if="adminSummary" class="ops-split-grid">
          <div class="metric-card compact">
            <strong>Top 动作</strong>
            <div class="tags" style="margin-top: 8px">
              <span v-for="item in adminSummary.topActions" :key="item.name" class="tag">{{ item.name }} · {{ item.count }}</span>
            </div>
          </div>
          <div class="metric-card compact">
            <strong>Top 路由</strong>
            <div class="tags" style="margin-top: 8px">
              <span v-for="item in adminSummary.topRoutes" :key="item.name" class="tag">{{ item.name }} · {{ item.count }}</span>
            </div>
          </div>
        </div>
        <table v-if="adminSummary?.recentFailures.length" class="data-table compact-table" style="margin-top: 12px">
          <thead>
            <tr>
              <th>时间</th>
              <th>动作</th>
              <th>状态</th>
              <th>详情</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in adminSummary.recentFailures" :key="item.id">
              <td>{{ formatTime(item.createdAt) }}</td>
              <td>{{ item.action }}</td>
              <td>{{ item.statusCode }}</td>
              <td>{{ item.detail || item.route }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else-if="canAdmin && !summaryError" class="empty">暂无失败记录</div>
        <div v-else-if="!canAdmin" class="empty">需要 admin 权限</div>
      </div>

      <div class="panel">
        <h3 style="margin-top: 0">路由与流量</h3>
        <table class="data-table compact-table">
          <thead>
            <tr>
              <th>路由</th>
              <th>前缀</th>
              <th>目标</th>
              <th>请求</th>
              <th>最近状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="route in routes" :key="route.name">
              <td>{{ route.name }}</td>
              <td>{{ route.prefix }}</td>
              <td>{{ route.target }}</td>
              <td>{{ metricMap.get(route.name)?.requestCount ?? 0 }}</td>
              <td>
                {{ metricMap.get(route.name)?.lastStatusCode ?? "-" }}
                <span v-if="metricMap.get(route.name)?.lastLatencyMs" class="muted">
                  · {{ metricMap.get(route.name)?.lastLatencyMs }}ms
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="panel">
        <div class="row" style="justify-content: space-between">
          <h3 style="margin: 0">内容分析查询</h3>
          <span class="muted">{{ canAdmin ? "admin" : "需要权限" }}</span>
        </div>
        <form class="inline-form" @submit.prevent="loadAnalysis">
          <input v-model.number="articleId" type="number" min="1" placeholder="文章 ID" />
          <button :disabled="!canAdmin || !articleId">查询</button>
          <button class="primary" :disabled="!canAdmin || !articleId" @click.prevent="reanalyzeArticle">重新分析</button>
        </form>
        <p v-if="analysisError" class="error">{{ analysisError }}</p>
        <div v-if="analysis" class="stack">
          <ContentProfilePanel :analysis="analysis" :tags="analysis.tags" />
          <pre class="json-block">{{ analysis }}</pre>
        </div>
      </div>

      <div class="panel">
        <div class="row" style="justify-content: space-between">
          <h3 style="margin: 0">审计日志</h3>
          <div class="row">
            <span v-if="auditLogs.length" class="muted">第 {{ auditPage }} / {{ auditTotalPages }} 页 · 共 {{ auditLogs.length }} 条</span>
            <button class="ghost" :disabled="!canAdmin" @click="loadAuditLogs">刷新日志</button>
          </div>
        </div>
        <p v-if="auditError" class="error">{{ auditError }}</p>
        <table v-if="pagedAuditLogs.length" class="data-table compact-table">
          <thead>
            <tr>
              <th>时间</th>
              <th>用户</th>
              <th>动作</th>
              <th>结果</th>
              <th>路由</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in pagedAuditLogs" :key="log.id">
              <td>{{ formatTime(log.createdAt) }}</td>
              <td>{{ log.username || log.userId || "-" }}</td>
              <td>{{ log.action }}</td>
              <td>{{ log.result }} · {{ log.statusCode }}</td>
              <td>{{ log.route }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty">暂无日志</div>
        <div v-if="auditTotalPages > 1" class="pagination">
          <button :disabled="auditPage <= 1" @click="auditPage -= 1">上一页</button>
          <button :disabled="auditPage >= auditTotalPages" @click="auditPage += 1">下一页</button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { AiAnalysis } from "~/types/social";

type GatewayHealth = {
  status: string;
  upstreams: Array<{
    key: string;
    target: string;
    routes: string[];
    status: string;
    httpStatus?: number;
    latencyMs: number;
  }>;
};

type GatewayRoute = {
  name: string;
  prefix: string;
  target: string;
};

type GatewayMetric = {
  routeName: string;
  requestCount: number;
  errorCount: number;
  lastStatusCode?: number;
  lastLatencyMs?: number;
};

type AuditLog = {
  id: string;
  userId: number | null;
  username: string | null;
  action: string;
  result: string;
  statusCode: number;
  route: string;
  createdAt: string;
};

type Taxonomy = {
  count: number;
  categories: Array<{ code: string; name: string; tags: string[] }>;
};

type AdminSummary = {
  windowHours: number;
  since: string;
  totals: {
    auditEvents: number;
    success: number;
    failure: number;
    failureRate: number;
  };
  topActions: Array<{ name: string; count: number }>;
  topRoutes: Array<{ name: string; count: number }>;
  recentFailures: Array<{
    id: string;
    action: string;
    route: string;
    statusCode: number;
    detail: string | null;
    createdAt: string;
  }>;
};

const { gatewayApi, analysisApi } = useApi();
const { user, refreshMe } = useAuth();
const loading = ref(false);
const health = ref<GatewayHealth | null>(null);
const routes = ref<GatewayRoute[]>([]);
const metrics = ref<GatewayMetric[]>([]);
const auditLogs = ref<AuditLog[]>([]);
const taxonomy = ref<Taxonomy | null>(null);
const adminSummary = ref<AdminSummary | null>(null);
const articleId = ref<number | null>(null);
const analysis = ref<(AiAnalysis & { tags?: Array<{ name: string; confidence: number | null; weight: number | null }> }) | null>(null);
const analysisError = ref("");
const auditError = ref("");
const taxonomyError = ref("");
const summaryError = ref("");
const auditPage = ref(1);
const auditPageSize = 20;

const canAdmin = computed(() => {
  const role = user.value?.role?.toLowerCase();
  return role === "admin";
});

const metricMap = computed(() => new Map(metrics.value.map((item) => [item.routeName, item])));
const auditTotalPages = computed(() => Math.max(1, Math.ceil(auditLogs.value.length / auditPageSize)));
const pagedAuditLogs = computed(() => {
  const page = Math.min(auditPage.value, auditTotalPages.value);
  const start = (page - 1) * auditPageSize;
  return auditLogs.value.slice(start, start + auditPageSize);
});

onMounted(async () => {
  await refreshMe();
  await loadOps();
});

async function loadOps() {
  loading.value = true;
  try {
    const [healthPayload, routesPayload, metricsPayload] = await Promise.all([
      gatewayApi<GatewayHealth>("/gateway/health"),
      gatewayApi<{ items: GatewayRoute[] }>("/gateway/routes"),
      gatewayApi<{ items: GatewayMetric[] }>("/gateway/metrics"),
    ]);
    health.value = healthPayload;
    routes.value = routesPayload.items;
    metrics.value = metricsPayload.items;
    if (canAdmin.value) {
      await Promise.all([loadTaxonomy(), loadAuditLogs(), loadAdminSummary()]);
    }
  } finally {
    loading.value = false;
  }
}

async function loadTaxonomy() {
  taxonomyError.value = "";
  try {
    taxonomy.value = await analysisApi<Taxonomy>("/analysis/taxonomy");
  } catch (err) {
    taxonomy.value = null;
    taxonomyError.value = err instanceof Error ? err.message : "标签库不可用";
  }
}

async function loadAuditLogs() {
  auditError.value = "";
  try {
    const payload = await gatewayApi<{ items: AuditLog[] }>("/gateway/audit-logs?limit=100");
    auditLogs.value = payload.items;
    auditPage.value = 1;
  } catch (err) {
    auditError.value = err instanceof Error ? err.message : "审计日志不可用";
  }
}

async function loadAdminSummary() {
  summaryError.value = "";
  try {
    adminSummary.value = await gatewayApi<AdminSummary>("/gateway/admin-summary?hours=24");
  } catch (err) {
    adminSummary.value = null;
    summaryError.value = err instanceof Error ? err.message : "管理员监控不可用";
  }
}

async function loadAnalysis() {
  if (!articleId.value) return;
  analysisError.value = "";
  analysis.value = null;
  try {
    const payload = await analysisApi<{ analysis: NonNullable<typeof analysis.value> }>(`/analysis/articles/${articleId.value}`);
    analysis.value = payload.analysis;
  } catch (err) {
    analysisError.value = err instanceof Error ? err.message : "查询失败";
  }
}

async function reanalyzeArticle() {
  if (!articleId.value) return;
  analysisError.value = "";
  try {
    await analysisApi(`/analysis/articles/${articleId.value}`, { method: "POST" });
    await loadAnalysis();
    await loadAuditLogs();
  } catch (err) {
    analysisError.value = err instanceof Error ? err.message : "重新分析失败";
  }
}

function statusClass(status: string) {
  if (status === "ok") return "risk-low";
  if (status === "degraded") return "risk-mid";
  return "risk-high";
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
</script>
