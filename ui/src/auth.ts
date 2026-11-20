// modules/venture-grid/ui/src/auth.ts
/**
 * 管理员登录状态。
 * - 令牌仍存 localStorage，但**必须**经 /api/vg/admin/check 验证后才算登录；
 * - 过期/错误的令牌会在启动时被清除，避免“看起来已登录、实际写不了”；
 * - 只是 UI 门禁，真正的写权限仍由服务端 VG_ADMIN_TOKEN 校验。
 */
import { useSyncExternalStore } from "react";
import { ApiError, api, getToken, setToken } from "./api/client";

export type AuthStatus = "checking" | "anonymous" | "admin";

export type AuthState = {
  status: AuthStatus;
  token: string;
  /** 最近一次验证失败的原因（code 用于 i18n 映射） */
  errorCode: string | null;
  errorMessage: string | null;
};

function initialState(): AuthState {
  const token = getToken();
  return {
    status: token === "" ? "anonymous" : "checking",
    token,
    errorCode: null,
    errorMessage: null,
  };
}

let state: AuthState = initialState();
const listeners = new Set<() => void>();
let bootstrapped = false;

function setState(next: AuthState): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/** 非 React 环境读取当前状态（测试 / 命令式代码）。 */
export function getAuthState(): AuthState {
  return state;
}

async function verify(token: string): Promise<void> {
  setState({ status: "checking", token, errorCode: null, errorMessage: null });
  try {
    await api.checkAdmin();
    setState({ status: "admin", token, errorCode: null, errorMessage: null });
  } catch (error) {
    setToken("");
    const apiError = error instanceof ApiError ? error : null;
    setState({
      status: "anonymous",
      token: "",
      errorCode: apiError?.code ?? "unauthorized",
      errorMessage: apiError?.message ?? "登录校验失败",
    });
  }
}

/** App 启动时调用一次：有令牌就验证，没有就保持匿名。 */
export async function bootstrapAuth(): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;
  const token = getToken();
  if (token === "") {
    setState({ status: "anonymous", token: "", errorCode: null, errorMessage: null });
    return;
  }
  await verify(token);
}

export async function login(token: string): Promise<boolean> {
  const trimmed = token.trim();
  if (trimmed === "") {
    setState({
      status: "anonymous",
      token: "",
      errorCode: "validation",
      errorMessage: "请输入管理员令牌",
    });
    return false;
  }
  // api client 从 localStorage 取令牌，先写入再验证；失败会被清掉
  setToken(trimmed);
  await verify(trimmed);
  return state.status === "admin";
}

export function logout(): void {
  setToken("");
  setState({ status: "anonymous", token: "", errorCode: null, errorMessage: null });
}

export function isAdminStatus(status: AuthStatus): boolean {
  return status === "admin";
}

/** 测试/调试用：重置引导标记（浏览器里没有调用点）。 */
export function resetAuthBootstrapForTests(): void {
  bootstrapped = false;
  state = initialState();
}