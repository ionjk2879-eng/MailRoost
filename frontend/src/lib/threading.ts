import type { Mail } from "@/types/mail"

// Union-Find (경로 압축만 — 이 규모의 메일함에선 랭크까지 필요 없다)
class DisjointSet {
  private parent = new Map<string, string>()

  private find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x)
    const p = this.parent.get(x)!
    if (p === x) return x
    const root = this.find(p)
    this.parent.set(x, root)
    return root
  }

  union(a: string, b: string): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent.set(ra, rb)
  }

  groupOf(x: string): string {
    return this.find(x)
  }
}

// Gmail은 accountId+threadId로, IMAP은 계정 안에서 messageId/references/inReplyTo 체인으로 묶는다.
// 계정 경계는 절대 넘지 않는다 — accountId를 모든 노드 키에 접두어로 넣어 강제한다.
export function groupIntoThreads(mails: Mail[]): Mail[][] {
  const ds = new DisjointSet()
  const nodeKeyOf = (mail: Mail): string => {
    if (mail.threadId) return `${mail.accountId} thread:${mail.threadId}`
    if (mail.messageId) return `${mail.accountId} msg:${mail.messageId}`
    return `${mail.accountId} mail:${mail.id}`
  }

  for (const mail of mails) {
    const key = nodeKeyOf(mail)
    ds.groupOf(key) // 노드를 등록해둔다 (union 호출이 없는 단독 메일도 그룹이 생기도록)

    if (!mail.messageId) continue
    const refs = [...(mail.references ?? []), ...(mail.inReplyTo ? [mail.inReplyTo] : [])]
    for (const ref of refs) {
      const refKey = `${mail.accountId} msg:${ref}`
      ds.union(key, refKey)
    }
  }

  const byRoot = new Map<string, Mail[]>()
  for (const mail of mails) {
    const root = ds.groupOf(nodeKeyOf(mail))
    const group = byRoot.get(root)
    if (group) group.push(mail)
    else byRoot.set(root, [mail])
  }

  return [...byRoot.values()].map((group) =>
    [...group].sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()),
  )
}
