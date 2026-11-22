"use client";

import { TRPCClientError } from "@trpc/client";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "~/components/ui/button";
import type { AppRouter } from "~/server/api/root";
import { api } from "~/trpc/react";

function describeError(cause: unknown): string {
  if (!(cause instanceof TRPCClientError))
    return cause instanceof Error
      ? cause.message
      : "Registration failed. Try again.";
  // The client is created for AppRouter, so its errors carry AppRouter's error shape.
  const error: TRPCClientError<AppRouter> = cause;
  const fields = Object.keys(error.data?.zodError?.fieldErrors ?? {});
  return fields.length
    ? `Check these fields: ${fields.join(", ")}.`
    : error.message;
}
const field =
  "border-border bg-background mt-2 block w-full rounded-md border px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const register = api.account.register.useMutation();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email"));
    const password = String(data.get("password"));
    try {
      await register.mutateAsync({
        name: String(data.get("name")),
        email,
        password,
        role: data.get("role") === "SPECTATOR" ? "SPECTATOR" : "PLAYER",
      });
      // Navigate ourselves: Auth.js would resolve the redirect against its configured base URL.
      const result = await signIn("password", {
        email,
        password,
        redirect: false,
      });
      if (result?.error)
        throw new Error("Account created. Sign in to continue.");
      router.push("/account");
      router.refresh();
    } catch (cause) {
      setError(describeError(cause));
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-5" noValidate={false}>
      <div>
        <label htmlFor="name" className="font-medium">
          Display name
        </label>
        <input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={60}
          autoComplete="nickname"
          className={field}
        />
      </div>
      <div>
        <label htmlFor="email" className="font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          maxLength={254}
          autoComplete="email"
          className={field}
        />
      </div>
      <div>
        <label htmlFor="password" className="font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          aria-describedby="password-hint"
          className={field}
        />
        <p id="password-hint" className="text-muted-foreground mt-1 text-sm">
          At least 12 characters.
        </p>
      </div>
      <fieldset>
        <legend className="font-medium">I am joining as</legend>
        <label className="mt-2 flex items-center gap-2">
          <input type="radio" name="role" value="PLAYER" defaultChecked />{" "}
          Player: enter tournaments and make predictions
        </label>
        <label className="mt-2 flex items-center gap-2">
          <input type="radio" name="role" value="SPECTATOR" /> Spectator: follow
          tournaments and make predictions
        </label>
      </fieldset>
      <div role="alert" aria-live="assertive" className="text-sm text-red-700">
        {error}
      </div>
      <Button type="submit" disabled={register.isPending}>
        {register.isPending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
