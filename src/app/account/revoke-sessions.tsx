"use client";

import { useRouter } from "next/navigation";
import { Button } from "~/components/ui/button";
import { api } from "~/trpc/react";

export function RevokeSessionsButton() {
  const router = useRouter();
  const revoke = api.account.revokeSessions.useMutation({
    onSuccess: () => {
      router.push("/");
      router.refresh();
    },
  });
  return (
    <>
      <Button
        variant="outline"
        disabled={revoke.isPending}
        onClick={() => revoke.mutate()}
      >
        {revoke.isPending ? "Signing out…" : "Sign out everywhere"}
      </Button>
      {revoke.error ? (
        <p role="alert" className="w-full text-sm text-red-700">
          {revoke.error.message}
        </p>
      ) : null}
    </>
  );
}
