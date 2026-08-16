import type { Contact, Env } from "../types"

export async function getUserContacts(env: Env, userId: string): Promise<Contact[]> {
  const raw = await env.TOKENS.get(`user:contacts:${userId}`)
  return raw ? (JSON.parse(raw) as { contacts: Contact[] }).contacts : []
}

export async function saveUserContacts(env: Env, userId: string, contacts: Contact[]): Promise<void> {
  await env.TOKENS.put(`user:contacts:${userId}`, JSON.stringify({ contacts }))
}
