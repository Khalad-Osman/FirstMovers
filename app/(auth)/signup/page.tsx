import type { Metadata } from "next";
import { AuthForm } from "../auth-form";
import { signUp } from "../actions";
import Link from "next/link";
import { signupEnabled } from "@/lib/signup";

export const metadata: Metadata = { title: "Create account · First Movers" };

export default function SignupPage() {
  if (!signupEnabled()) {
    return (
      <div className="auth-card">
        <h1 className="auth-title">Accounts are by invitation</h1>
        <p className="auth-subtitle">First Movers · industrial occupier intelligence</p>
        <p>Public sign-up is off. Ask a First Movers admin to create an account for you.</p>
        <p className="auth-switch">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </div>
    );
  }
  return <AuthForm mode="signup" action={signUp} />;
}
