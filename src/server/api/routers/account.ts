import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  adminProcedure,
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import {
  hashPassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  verifyPassword,
} from "~/server/domain/passwords";
import {
  requireRealAccount,
  ROLES,
  SELF_SERVICE_ROLES,
} from "~/server/domain/permissions";

const realAccountProcedure = protectedProcedure.use(({ ctx, next }) => {
  requireRealAccount(ctx.session.user.id);
  return next();
});

const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, {
    message: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  })
  .max(PASSWORD_MAX_LENGTH);

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export const accountRouter = createTRPCRouter({
  register: publicProcedure
    .input(
      z.object({
        name: z
          .string()
          .trim()
          .min(2)
          .max(60)
          .regex(/^[^\p{Cc}\p{Cf}]+$/u, "Use visible characters only."),
        email: z.string().trim().toLowerCase().email().max(254),
        password,
        role: z.enum(SELF_SERVICE_ROLES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const passwordHash = await hashPassword(input.password);
      try {
        return await ctx.db.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              name: input.name,
              email: input.email,
              role: input.role,
              passwordHash,
            },
            select: { id: true, role: true },
          });
          await tx.auditLog.create({
            data: {
              actorId: user.id,
              action: "user.registered",
              entityId: user.id,
            },
          });
          return user;
        });
      } catch (error) {
        if (isUniqueViolation(error))
          throw new TRPCError({
            code: "CONFLICT",
            message: "An account with this email already exists.",
          });
        throw error;
      }
    }),

  me: protectedProcedure.query(({ ctx }) =>
    ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      select: { id: true, name: true, email: true, role: true },
    }),
  ),

  revokeSessions: realAccountProcedure.mutation(async ({ ctx }) => {
    await ctx.db.$transaction([
      ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { sessionVersion: { increment: 1 } },
      }),
      ctx.db.auditLog.create({
        data: {
          actorId: ctx.session.user.id,
          action: "user.sessions_revoked",
          entityId: ctx.session.user.id,
        },
      }),
    ]);
    return { revoked: true };
  }),

  changePassword: realAccountProcedure
    .input(
      z.object({ currentPassword: z.string().max(128), newPassword: password }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { passwordHash: true },
      });
      if (
        !user?.passwordHash ||
        !(await verifyPassword(input.currentPassword, user.passwordHash))
      )
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "The current password is incorrect.",
        });
      const passwordHash = await hashPassword(input.newPassword);
      await ctx.db.$transaction([
        ctx.db.user.update({
          where: { id: ctx.session.user.id },
          data: { passwordHash, sessionVersion: { increment: 1 } },
        }),
        ctx.db.auditLog.create({
          data: {
            actorId: ctx.session.user.id,
            action: "user.password_changed",
            entityId: ctx.session.user.id,
          },
        }),
      ]);
      return { changed: true };
    }),

  setRole: adminProcedure
    .input(z.object({ userId: z.string().min(1), role: z.enum(ROLES) }))
    .mutation(({ ctx, input }) =>
      ctx.db.$transaction(
        async (tx) => {
          const target = await tx.user.findUnique({
            where: { id: input.userId },
            select: { role: true },
          });
          if (!target)
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "No such user.",
            });
          if (target.role === input.role) return { role: target.role };
          if (target.role === "ADMIN") {
            const admins = await tx.user.count({ where: { role: "ADMIN" } });
            if (admins <= 1)
              throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message:
                  "Promote another administrator before removing the last one.",
              });
          }
          // Bumping the version signs the user out everywhere, so no token keeps the old role.
          await tx.user.update({
            where: { id: input.userId },
            data: { role: input.role, sessionVersion: { increment: 1 } },
          });
          await tx.auditLog.create({
            data: {
              actorId: ctx.session.user.id,
              action: `user.role_changed.${target.role}.${input.role}`,
              entityId: input.userId,
            },
          });
          return { role: input.role };
        },
        { isolationLevel: "Serializable" },
      ),
    ),
});
