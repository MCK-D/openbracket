import { type Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Create an account" };

export default function RegisterPage() {
  return (
    <main id="main" className="mx-auto min-h-[75vh] max-w-md px-6 py-14">
      <h1 className="text-3xl font-semibold tracking-tight">
        Create an account
      </h1>
      <p className="text-muted-foreground mt-4 leading-relaxed">
        Administrators are appointed by an existing administrator. Points have
        no monetary value. Already registered?{" "}
        <Link
          className="underline underline-offset-4"
          href="/api/auth/signin?callbackUrl=/account"
        >
          Sign in
        </Link>
        .
      </p>
      <RegisterForm />
    </main>
  );
}
