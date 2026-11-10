import type { Metadata } from "next";
import { AuthForm } from "../auth-form";
import { signUp } from "../actions";

export const metadata: Metadata = { title: "Create account · First Movers" };

export default function SignupPage() {
  return <AuthForm mode="signup" action={signUp} />;
}
