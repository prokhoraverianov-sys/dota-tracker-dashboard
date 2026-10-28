import ky from "ky"
import { z } from "zod"
import { errorSchema, type Session, sessionSchema } from "./contracts"
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    text: string,
  ) {
    super(text)
    this.name = "ApiError"
  }
}
const configSchema = z.object({
  apiUrl: z
    .url()
    .refine(
      (value) =>
        new URL(value).protocol === "https:" ||
        ["localhost", "127.0.0.1"].includes(new URL(value).hostname),
      "Сервер должен использовать HTTPS",
    ),
})
export class Api {
  constructor(
    readonly origin: string,
    private readonly session: () => Session | null,
    private readonly expired: () => void,
  ) {}
  async request<T>(
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    idempotency?: string,
  ): Promise<T> {
    const response = await this.response(path, body, idempotency)
    return schema.parse(await response.json())
  }
  async response(path: string, body?: unknown, idempotency?: string): Promise<Response> {
    const token = this.session()
    if (token && Date.parse(token.expires_at) <= Date.now()) {
      this.expired()
      throw new ApiError(401, "expired", "Сессия истекла. Войдите снова; черновик сохранён.")
    }
    const response = await ky(`${this.origin}/api/v1${path}`, {
      method: body === undefined ? "GET" : "POST",
      ...(body === undefined ? {} : { json: body }),
      headers: {
        ...(token ? { Authorization: `Bearer ${token.access_token}` } : {}),
        ...(idempotency ? { "Idempotency-Key": idempotency } : {}),
      },
      timeout: 30000,
      retry: 0,
      throwHttpErrors: false,
    })
    if (!response.ok) {
      const parsed = errorSchema.safeParse(await response.json().catch(() => null))
      if (response.status === 401 && token) this.expired()
      throw new ApiError(
        response.status,
        parsed.success ? parsed.data.error.code : "http_error",
        parsed.success ? parsed.data.error.message : `Сервер вернул ${response.status}`,
      )
    }
    return response
  }
}
export async function loadConfig(): Promise<string> {
  const data = await ky(`${import.meta.env.BASE_URL}config.json`, { retry: 0 }).json()
  return configSchema.parse(data).apiUrl.replace(/\/$/, "")
}
export function readSession(): Session | null {
  const raw = sessionStorage.getItem("dota-session")
  if (!raw) return null
  try {
    const result = sessionSchema.safeParse(JSON.parse(raw))
    return result.success && Date.parse(result.data.expires_at) > Date.now() ? result.data : null
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
}
export function storeSession(value: Session | null) {
  if (value) sessionStorage.setItem("dota-session", JSON.stringify(value))
  else sessionStorage.removeItem("dota-session")
}
