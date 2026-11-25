// Owner password reset with a recovery code (no email involved).
// The function authenticates the caller itself: email + recovery code, with lockout.
// Deployed with verify_jwt = false.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function sha256hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body: { email?: string; code?: string; password?: string };
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const email = String(body.email ?? "").trim().toLowerCase();
  const code = String(body.code ?? "").toUpperCase().replace(/[^0-9A-F]/g, "");
  const password = String(body.password ?? "");
  if (password.length < 8) return json({ error: "Choose a password of at least 8 characters." }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: rec } = await admin.from("owner_recovery").select("*").eq("email", email).maybeSingle();
  const generic = "That email and recovery code don't match.";
  if (!rec) return json({ error: generic }, 401);
  if (rec.locked_until && new Date(rec.locked_until) > new Date()) {
    return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
  }
  const ok = code.length === 20 && safeEqual(await sha256hex(code), rec.code_hash);
  if (!ok) {
    const n = rec.failed_attempts + 1;
    await admin.from("owner_recovery").update({
      failed_attempts: n,
      locked_until: n >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null,
    }).eq("email", email);
    return json({ error: generic }, 401);
  }
  const { error } = await admin.auth.admin.updateUserById(rec.user_id, { password, email_confirm: true });
  if (error) return json({ error: error.message }, 500);
  await admin.from("owner_recovery").update({ failed_attempts: 0, locked_until: null }).eq("email", email);
  return json({ ok: true });
});
