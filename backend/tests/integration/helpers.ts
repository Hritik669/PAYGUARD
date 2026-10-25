import request from "supertest";
import { createApp } from "../../src/app";

export const app = createApp();

export function cookieHeader(setCookie: string | string[] | undefined): string {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

export async function login(email: string, password: string) {
  const response = await request(app).post("/api/v1/auth/login").send({ email, password });
  return {
    response,
    cookie: cookieHeader(response.headers["set-cookie"]),
    csrf: response.body?.data?.csrfToken as string,
    user: response.body?.data?.user,
  };
}
