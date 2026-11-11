"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthFormState } from "./actions";

type Props = {
  mode: "login" | "signup";
  action: (prev: AuthFormState, formData: FormData) => Promise<AuthFormState>;
  next?: string;
  initialError?: string;
  signupEnabled?: boolean;
};

export function AuthForm({ mode, action, next, initialError, signupEnabled = true }: Props) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const isSignup = mode === "signup";
  const error = state?.error ?? (state ? undefined : initialError);

  return (
    <form action={formAction} className="auth-card" noValidate>
      <h1 className="auth-title">{isSignup ? "Create your account" : "Sign in"}</h1>
      <p className="auth-subtitle">First Movers · industrial occupier intelligence</p>

      {isSignup && (
        <label className="field">
          <span className="field-label">Full name</span>
          <input name="fullName" type="text" autoComplete="name" required className="input" />
        </label>
      )}
      <label className="field">
        <span className="field-label">Email</span>
        <input name="email" type="email" autoComplete="email" required className="input" />
      </label>
      <label className="field">
        <span className="field-label">Password</span>
        <input
          name="password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          minLength={8}
          required
          className="input"
        />
        {isSignup && <span className="field-hint">At least 8 characters.</span>}
      </label>
      {next && <input type="hidden" name="next" value={next} />}

      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {state?.message && (
        <p role="status" className="form-message">
          {state.message}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "Please wait…" : isSignup ? "Create account" : "Sign in"}
      </button>

      <p className="auth-switch">
        {isSignup ? (
          <>
            Already have an account? <Link href="/login">Sign in</Link>
          </>
        ) : signupEnabled ? (
          <>
            New to First Movers? <Link href="/signup">Create an account</Link>
          </>
        ) : (
          <>Need access? Ask a First Movers admin for an account.</>
        )}
      </p>
    </form>
  );
}
