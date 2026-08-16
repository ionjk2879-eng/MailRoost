// ── Cursor-based pagination helpers ──────────────────────────────────────────

export type CursorState = { pageToken?: string; offset?: number }
export type CursorMap = Record<string, CursorState>

export function encodeCursor(map: CursorMap): string {
  return btoa(JSON.stringify(map))
}

export function decodeCursor(cursor: string): CursorMap {
  try { return JSON.parse(atob(cursor)) as CursorMap } catch { return {} }
}
