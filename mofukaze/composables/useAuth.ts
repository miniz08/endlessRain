import type { PublicUser } from "~/types/social";

export function useAuth() {
  const { userApi } = useApi();
  const user = useState<PublicUser | null>("auth:user", () => null);
  const ready = useState<boolean>("auth:ready", () => false);

  async function refreshMe() {
    try {
      const payload = await userApi<{ user: PublicUser }>("/auth/me");
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
    logout,
  };
}
