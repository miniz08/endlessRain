export function useApi() {
  const config = useRuntimeConfig();
  const apiBase = config.public.apiBase as string;

  function blogApi<T>(path: string, options: Record<string, unknown> = {}) {
    return $fetch<T>(`${apiBase}${path}`, {
      credentials: "include",
      ...options,
    });
  }

  function userApi<T>(path: string, options: Record<string, unknown> = {}) {
    return $fetch<T>(`${apiBase}${path}`, {
      credentials: "include",
      ...options,
    });
  }

  function analysisApi<T>(path: string, options: Record<string, unknown> = {}) {
    return $fetch<T>(`${apiBase}${path}`, {
      credentials: "include",
      ...options,
    });
  }

  function chatApi<T>(path: string, options: Record<string, unknown> = {}) {
    return $fetch<T>(`${apiBase}${path}`, {
      credentials: "include",
      ...options,
    });
  }

  function gatewayApi<T>(path: string, options: Record<string, unknown> = {}) {
    return $fetch<T>(`${apiBase}${path}`, {
      credentials: "include",
      ...options,
    });
  }

  return { blogApi, userApi, analysisApi, chatApi, gatewayApi, apiBase };
}
