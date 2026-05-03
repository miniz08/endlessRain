<template>
  <div class="page">
    <div class="grid">
      <section class="stack">
        <div class="panel">
          <div class="row" style="justify-content: space-between">
            <div>
              <h2 style="margin: 0">运维控制台</h2>
              <p class="muted" style="margin: 4px 0 0">Gateway、上游服务、审计与内容分析</p>
            </div>
            <button class="ghost" :disabled="loading" @click="loadOps">{{ loading ? "刷新中" : "刷新" }}</button>
          </div>
        </div>

        <div class="panel">
          <div class="row" style="justify-content: space-between">
            <h3 style="margin: 0">服务状态</h3>
            <span v-if="health" class="status-pill" :class="statusClass(health.status)">{{ health.status }}</span>
          </div>
          <div v-if="health" class="ops-grid">
            <div v-for="item in health.upstreams" :key="`${item.key}-${item.target}`" class="metric-card">
              <div class="row" style="justify-content: space-between">
                <strong>{{ item.key }}</strong>
                <span class="status-dot" :class="statusClass(item.status)"></span>
              </div>
              <p class="muted">{{ item.target }}</p>
              <p>{{ item.httpStatus || "-" }} · {{ item.latencyMs }}ms</p>
              <div class="tags">
                <span v-for="route in item.routes" :key="route" class="tag">{{ route }}</span>
              </div>
            </div>
          </div>
          <div v-else class="empty">暂无状态数据</div>
        </div>

        <div class="panel">
          <h3 style="margin-top: 0">路由与流量</h3>
          <table class="data-table">
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
            <span class="muted">{{ canReview ? "reviewer" : "需要权限" }}</span>
          </div>
          <form class="inline-form" @submit.prevent="loadAnalysis">
            <input v-model.number="articleId" type="number" min="1" placeholder="文章 ID" />
            <button :disabled="!canReview || !articleId">查询</button>
            <button class="primary" :disabled="!canReview || !articleId" @click.prevent="reanalyzeArticle">重新分析</button>
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
            <button class="ghost" :disabled="!canReview" @click="loadAuditLogs">刷新日志</button>
          </div>
          <p v-if="auditError" class="error">{{ auditError }}</p>
          <table v-if="auditLogs.length" class="data-table">
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
              <tr v-for="log in auditLogs" :key="log.id">
                <td>{{ formatTime(log.createdAt) }}</td>
                <td>{{ log.username || log.userId || "-" }}</td>
                <td>{{ log.action }}</td>
                <td>{{ log.result }} · {{ log.statusCode }}</td>
                <td>{{ log.route }}</td>
              </tr>
            </tbody>
          </table>
          <div v-else class="empty">暂无日志</div>
        </div>
      </section>

      <aside class="stack">
        <div class="panel">
          <h3>当前身份</h3>
          <p>{{ user?.username || "未登录" }}</p>
          <p class="muted">{{ user?.role || "-" }}</p>
        </div>
        <div class="panel">
          <h3>标签库</h3>
          <p v-if="taxonomy">{{ taxonomy.count }} 个标签 · {{ taxonomy.categories.length }} 个大类</p>
          <p v-else class="muted">需要 reviewer 或 admin</p>
        </div>
      </aside>
    </div>
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

const { gatewayApi, analysisApi } = useApi();
const { user, refreshMe } = useAuth();
const loading = ref(false);
const health = ref<GatewayHealth | null>(null);
const routes = ref<GatewayRoute[]>([]);
const metrics = ref<GatewayMetric[]>([]);
const auditLogs = ref<AuditLog[]>([]);
const taxonomy = ref<Taxonomy | null>(null);
const articleId = ref<number | null>(null);
const analysis = ref<(AiAnalysis & { tags?: Array<{ name: string; confidence: number | null; weight: number | null }> }) | null>(null);
const analysisError = ref("");
const auditError = ref("");

const canReview = computed(() => {
  const role = user.value?.role?.toLowerCase();
  return role === "admin" || role === "reviewer";
});

const metricMap = computed(() => new Map(metrics.value.map((item) => [item.routeName, item])));

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
    if (canReview.value) {
      await Promise.all([loadTaxonomy(), loadAuditLogs()]);
    }
  } finally {
    loading.value = false;
  }
}

async function loadTaxonomy() {
  taxonomy.value = await analysisApi<Taxonomy>("/analysis/taxonomy");
}

async function loadAuditLogs() {
  auditError.value = "";
  try {
    const payload = await gatewayApi<{ items: AuditLog[] }>("/gateway/audit-logs?limit=40");
    auditLogs.value = payload.items;
  } catch (err) {
    auditError.value = err instanceof Error ? err.message : "审计日志不可用";
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
