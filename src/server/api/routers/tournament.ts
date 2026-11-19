import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "~/server/api/trpc";
import { requireAdmin } from "~/server/domain/permissions";
export const tournamentRouter = createTRPCRouter({
  list: publicProcedure.query(({ ctx }) =>
    ctx.db.tournament.findMany({
      where: { visibility: "PUBLIC" },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        name: true,
        game: true,
        format: true,
        status: true,
        startsAt: true,
        sourceUrl: true,
      },
      take: 100,
    }),
  ),
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().trim().min(3).max(100),
        game: z.string().trim().min(1).max(80),
        format: z.enum([
          "SINGLE_ELIMINATION",
          "DOUBLE_ELIMINATION",
          "ROUND_ROBIN",
          "SWISS",
          "FFA",
        ]),
        startsAt: z
          .date()
          .refine(
            (date) => date > new Date(),
            "Start time must be in the future.",
          ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { role: true },
      });
      requireAdmin(user?.role);
      return ctx.db.$transaction(async (tx) => {
        const tournament = await tx.tournament.create({ data: input });
        await tx.auditLog.create({
          data: {
            actorId: ctx.session.user.id,
            action: "tournament.created",
            entityId: tournament.id,
          },
        });
        return tournament;
      });
    }),
});
