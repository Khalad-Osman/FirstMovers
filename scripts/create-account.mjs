// Create a signed-up, email-confirmed account with a role (admin or member).
// Used where public sign-up is off (the hosted app). No confirmation email is sent.
//
// Usage:
//   npm run create-account -- <email> "<Full name>" <member|admin> [password]
// Against the hosted project, point it at that project's env file, e.g.:
//   node --env-file=.env.production.local scripts/create-account.mjs demo@example.com "Demo Reviewer" member
// If no password is given, a random one is generated and printed ONCE.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const [email, fullName, role = "member", given] = process.argv.slice(2);
if (!email || !fullName || !["member", "admin"].includes(role)) {
  console.error('Usage: npm run create-account -- <email> "<Full name>" <member|admin> [password]');
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY.");
  process.exit(1);
}
if (given && given.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const password = given ?? randomBytes(12).toString("base64url");
const db = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

const { data, error } = await db.auth.admin.createUser({
  email: email.trim().toLowerCase(),
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName },
});
if (error) {
  console.error(`Could not create ${email}: ${error.message}`);
  process.exit(1);
}
const { error: roleErr } = await db.from("profiles").update({ role, full_name: fullName }).eq("id", data.user.id);
if (roleErr) {
  console.error(`Account created, but setting the role failed: ${roleErr.message}`);
  process.exit(1);
}
console.log(`Created ${role} account for ${email} (${url}).`);
if (!given) console.log(`Password (shown once, store it safely): ${password}`);
