// Public sign-up switch. On by default (local dev); set SIGNUP_ENABLED=false on
// the hosted app, where accounts are created by an admin (scripts/create-account.mjs).
// Also disable sign-ups in Supabase Auth so the API itself refuses them.
export function signupEnabled(): boolean {
  return (process.env.SIGNUP_ENABLED ?? "true").toLowerCase() !== "false";
}
