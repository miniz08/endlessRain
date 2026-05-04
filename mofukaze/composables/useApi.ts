export function useApi() {
  const config = useRuntimeConfig();
  const apiBase = config.public.apiBase as string;

  function blogApi<T>(path: string, options: Record<string, unknown> = {}) {
    return apiRequest<T>(path, options);
  }

  function userApi<T>(path: string, options: Record<string, unknown> = {}) {
    return apiRequest<T>(path, options);
  }

  function analysisApi<T>(path: string, options: Record<string, unknown> = {}) {
    return apiRequest<T>(path, options);
  }

  function chatApi<T>(path: string, options: Record<string, unknown> = {}) {
    return apiRequest<T>(path, options);
  }

  function gatewayApi<T>(path: string, options: Record<string, unknown> = {}) {
    return apiRequest<T>(path, options);
  }

  function apiRequest<T>(path: string, options: Record<string, unknown> = {}) {
    return $fetch<T>(joinApiPath(apiBase, path), {
      credentials: "include",
      ...options,
    }).catch((error) => {
      throw toApiError(error);
    });
  }

  return { blogApi, userApi, analysisApi, chatApi, gatewayApi, apiBase };
}

function joinApiPath(base: string, path: string) {
  const normalizedBase = base.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

type ApiErrorShape = {
  data?: {
    error?: {
      message?: string;
      code?: string;
    };
    message?: string;
  };
  response?: {
    status?: number;
  };
  message?: string;
};

function toApiError(error: unknown) {
  const shaped = error as ApiErrorShape;
  const message =
    shaped.data?.error?.message ??
    shaped.data?.message ??
    shaped.message ??
    "请求失败";
  const code = shaped.data?.error?.code;
  const status = shaped.response?.status;
  const suffix = [code, status ? `HTTP ${status}` : ""].filter(Boolean).join(" / ");
  return new Error(suffix ? `${message}（${suffix}）` : message);
}
