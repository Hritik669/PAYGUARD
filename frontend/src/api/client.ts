import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

const baseURL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api/v1";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let csrfToken: string | null = null;
let refreshPromise: Promise<void> | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

export function shouldAttemptRefresh(status: number | undefined, url: string | undefined, alreadyRetried: boolean): boolean {
  if (status !== 401 || alreadyRetried) return false;
  const path = url ?? "";
  if (path.includes("/auth/login") || path.includes("/auth/register") || path.includes("/auth/refresh") || path.includes("/auth/csrf")) return false;
  return true;
}

function normalize(error: AxiosError<{ error?: { code?: string; message?: string; details?: unknown } }>): ApiError {
  const status = error.response?.status ?? 0;
  const body = error.response?.data?.error;
  const unreachable = status === 0 || error.code === "ECONNABORTED";
  const message = unreachable
    ? "The PayGuard API did not respond. A free host can take about a minute to wake up. Wait, then try again."
    : (body?.message ?? "The PayGuard API could not be reached.");
  return new ApiError(status, body?.code ?? "NETWORK_ERROR", message, body?.details);
}

export const api = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 70_000,
});

api.interceptors.request.use((config) => {
  const method = (config.method ?? "get").toLowerCase();
  if (!["get", "head", "options"].includes(method) && csrfToken) {
    config.headers.set("X-CSRF-Token", csrfToken);
  }
  if (!config.headers.has("X-Request-Id")) {
    config.headers.set("X-Request-Id", crypto.randomUUID());
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ error?: { code?: string; message?: string; details?: unknown } }>) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const url = original?.url;
    if (original && shouldAttemptRefresh(error.response?.status, url, Boolean(original._retry))) {
      original._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = axios
            .post(
              `${baseURL}/auth/refresh`,
              {},
              {
                withCredentials: true,
                headers: csrfToken ? { "X-CSRF-Token": csrfToken } : {},
              },
            )
            .then((response) => {
              const token = response.data?.data?.csrfToken as string | undefined;
              if (token) csrfToken = token;
            })
            .finally(() => {
              refreshPromise = null;
            });
        }
        await refreshPromise;
        return api(original);
      } catch (refreshError) {
        csrfToken = null;
        if (!window.location.pathname.startsWith("/login")) {
          window.location.assign("/login");
        }
        return Promise.reject(refreshError instanceof axios.AxiosError ? normalize(refreshError) : refreshError);
      }
    }
    return Promise.reject(normalize(error));
  },
);
