import type { PublicUser } from "~/types/social";

export function useAuth() {
  const { userApi } = useApi();
  const user = useState<PublicUser | null>("auth:user", () => null);
  const ready = useState<boolean>("auth:ready", () => false);

  async function refreshMe() {
    try {
      const payload = await userApi<{ user: PublicUser | null }>("/auth/session");
      user.value = payload.user;
    } catch {
      user.value = null;
    } finally {
      ready.value = true;
    }
  }

  async function login(identifier: string, password: string) {
    const payload = await userApi<{ user: PublicUser }>("/auth/login", {
      method: "POST",
      body: { identifier, password },
    });
    const sessionPayload = await userApi<{ user: PublicUser | null }>("/auth/session");
    if (!sessionPayload.user || sessionPayload.user.id !== payload.user.id) {
      user.value = null;
      ready.value = true;
      throw new Error("登录成功，但浏览器没有保存登录状态，请检查 Cookie/Secure/HTTPS 配置");
    }
    user.value = sessionPayload.user;
    ready.value = true;
    return sessionPayload.user;
  }

  async function register(input: { username: string; email: string; password: string }) {
    const payload = await userApi<{ user: PublicUser }>("/auth/register", {
      method: "POST",
      body: input,
    });
    user.value = payload.user;
    ready.value = true;
    return payload.user;
  }

  async function logout() {
    await userApi("/auth/logout", { method: "POST" }).catch(() => undefined);
    user.value = null;
  }

  return {
    user,
    ready,
    isLoggedIn: computed(() => Boolean(user.value)),
    refreshMe,
    login,
    register,
    logout,
  };
}
