import { TRPCError } from "@trpc/server";
export function requireAdmin(role: string | undefined): void {
  if (role !== "ADMIN")
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Administrator access is required.",
    });
}
