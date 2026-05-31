import type { AppStatus, Basket, TodoList } from "./types";

const BASE = "";  // same origin

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const api = {
  /** Current run state + last results */
  status: () => get<AppStatus>("/api/status"),

  /** Live HA todo items */
  list: () => get<TodoList>("/api/list"),

  /** Current Sainsbury's basket */
  basket: () => get<Basket>("/api/basket"),

  /** Trigger a shopping run */
  shop: () => post<{ status: string }>("/api/shop"),

  /** Step 1: email + password */
  login: (email: string, password: string) =>
    post<{ result: string; auth_status: string }>("/api/auth/login", { email, password }),

  /** Step 2: SMS code */
  smsCode: (code: string) =>
    post<{ result: string; auth_status: string }>("/api/auth/sms", { code }),
};
