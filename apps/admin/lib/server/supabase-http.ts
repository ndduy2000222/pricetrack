export function supabaseHeaders (serviceKey: string, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { apikey: serviceKey, ...extra }
  // sb_secret_* values are API keys, not JWTs. Sending them as Bearer tokens
  // makes Supabase reject the request as an invalid JWT.
  if (!serviceKey.startsWith('sb_')) headers.Authorization = `Bearer ${serviceKey}`
  return headers
}
