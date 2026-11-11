import type { Metadata } from "next";
import { AuthForm } from "../auth-form";
import { signIn } from "../actions";
import { signupEnabled } from "@/lib/signup";

export const metadata: Metadata = { title: "Sign in · First Movers" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const initialError =
    params.error === "confirmation"
      ? "That confirmation link is invalid or expired. Sign in or sign up again."
      : undefined;

  return <AuthForm mode="login" action={signIn} next={next} initialError={initialError} signupEnabled={signupEnabled()} />;
}
