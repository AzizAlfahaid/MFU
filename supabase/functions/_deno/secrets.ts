// Reads a server setting: the function's environment first, then the private app_secrets table.
import { createClient } from 'npm:@supabase/supabase-js@2'

let cache: Record<string, string> | null = null

export async function getSecret(name: string): Promise<string | undefined> {
  const fromEnv = Deno.env.get(name)
  if (fromEnv) return fromEnv
  if (!cache) {
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data } = await db.from('app_secrets').select('key, value')
    cache = Object.fromEntries((data ?? []).map((r: { key: string; value: string }) => [r.key, r.value]))
  }
  return cache[name]
}
