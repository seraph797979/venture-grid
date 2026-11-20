// modules/venture-grid/tests/auth.test.ts
/**
 * UI 登录门禁的状态机（不渲染 React，只验证 auth.ts 的行为）。
 * 用最小 localStorage + fetch 桩模拟浏览器与 /api/vg/admin/check。
 */
import { beforeEach, describe, expect, test } from "bun:test";

function installBrowserStubs(): void {
  const store = new Map<string, string>();
  const localStorageStub = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
  (globalThis as Record<string, unknown>).localStorage = localStorageStub;
}

const ADMIN_TOKEN = "right-token";

function installFetch(serverHasToken: boolean): void {
  (globalThis as Record<string, unknown>).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes("/api/vg/admin/check")) {
      return new Response(JSON.stringify({ ok: false, code: "not_found", error: "nope" }), { status: 404 });
    }
    if (!serverHasToken) {
      return new Response(
        JSON.stringify({ ok: false, code: "admin_not_configured", error: "未配置 VG_ADMIN_TOKEN" }),
        { status: 503 },
      );
    }
    const headers = new Headers(init?.headers);
    const provided = (headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (provided !== ADMIN_TOKEN) {
      return new Response(JSON.stringify({ ok: false, code: "unauthorized", error: "令牌无效" }), {
        status: 401,
      });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
}

installBrowserStubs();
installFetch(true);

const auth = await import("../ui/src/auth");

beforeEach(() => {
  localStorage.clear();
  installFetch(true);
  auth.resetAuthBootstrapForTests();
});

describe("管理员登录门禁", () => {
  test("无令牌启动 → 匿名，且不发起请求", async () => {
    let called = 0;
    const realFetch = globalThis.fetch;
    (globalThis as Record<string, unknown>).fetch = async (...args: Parameters<typeof fetch>) => {
      called += 1;
      return realFetch(...args);
    };
    await auth.bootstrapAuth();
    expect(auth.getAuthState().status).toBe("anonymous");
    expect(called).toBe(0);
    (globalThis as Record<string, unknown>).fetch = realFetch;
  });

  test("有本地令牌但服务端拒绝 → 清掉令牌并回到匿名", async () => {
    localStorage.setItem("vg_admin_token", "stale");
    await auth.bootstrapAuth();
    expect(auth.getAuthState().status).toBe("anonymous");
    expect(localStorage.getItem("vg_admin_token")).toBeNull();
    expect(auth.getAuthState().errorCode).toBe("unauthorized");
  });

  test("令牌正确 → admin；错误 → 失败并清除", async () => {
    expect(await auth.login(ADMIN_TOKEN)).toBe(true);
    expect(auth.getAuthState().status).toBe("admin");
    expect(localStorage.getItem("vg_admin_token")).toBe(ADMIN_TOKEN);

    auth.logout();
    expect(auth.getAuthState().status).toBe("anonymous");

    expect(await auth.login("wrong")).toBe(false);
    expect(auth.getAuthState().status).toBe("anonymous");
    expect(localStorage.getItem("vg_admin_token")).toBeNull();
    expect(auth.getAuthState().errorCode).toBe("unauthorized");
  });

  test("空令牌 → validation，不发请求", async () => {
    expect(await auth.login("   ")).toBe(false);
    expect(auth.getAuthState().errorCode).toBe("validation");
  });

  test("服务端未配置 VG_ADMIN_TOKEN → admin_not_configured（登录不可用）", async () => {
    installFetch(false);
    expect(await auth.login(ADMIN_TOKEN)).toBe(false);
    expect(auth.getAuthState().status).toBe("anonymous");
    expect(auth.getAuthState().errorCode).toBe("admin_not_configured");
  });
});