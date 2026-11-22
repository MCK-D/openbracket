import { type Metadata } from "next";
import { redirect } from "next/navigation";
import { Button } from "~/components/ui/button";
import { auth, signOut } from "~/server/auth";
import { RevokeSessionsButton } from "./revoke-sessions";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

const roleDescriptions = {
  ADMIN: "Administrator: manage tournaments and roles.",
  PLAYER: "Player: enter tournaments and make predictions.",
  SPECTATOR: "Spectator: follow tournaments and make predictions.",
} as const;

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) redirect("/api/auth/signin?callbackUrl=/account");
  return (
    <main id="main" className="mx-auto min-h-[75vh] max-w-md px-6 py-14">
      <h1 className="text-3xl font-semibold tracking-tight">Account</h1>
      <dl className="mt-8 space-y-4">
        <div>
          <dt className="text-muted-foreground text-sm">Name</dt>
          <dd>{session.user.name ?? "Not set"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-sm">Role</dt>
          <dd>{roleDescriptions[session.user.role]}</dd>
        </div>
      </dl>
      <div className="mt-10 flex flex-wrap gap-4">
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <Button type="submit">Sign out</Button>
        </form>
        <RevokeSessionsButton />
      </div>
      <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
        Sessions expire after 8 hours. Signing out everywhere ends every
        session, including this one.
      </p>
    </main>
  );
}
