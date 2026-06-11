export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number }

export async function fetchJSON<T>(url: string): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) return { ok: false, status: res.status }
    return { ok: true, data: (await res.json()) as T }
  } catch {
    return { ok: false, status: 0 }
  }
}
