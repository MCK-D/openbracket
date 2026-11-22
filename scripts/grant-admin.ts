import { PrismaClient } from "@prisma/client";
import { verifyPassword } from "../src/server/domain/passwords";

// Operator-only bootstrap: grants ADMIN to an existing account from a machine that holds the
// database URL. Emails are not verified, so the operator must prove they own the account by
// typing its password: whoever registered the email first cannot be promoted by mistake.
async function readHidden(prompt: string): Promise<string> {
  const { stdin, stdout } = process;
  stdout.write(prompt);
  if (!stdin.isTTY) {
    let input = "";
    for await (const chunk of stdin) input += String(chunk);
    stdout.write("\n");
    return input.replace(/\r?\n$/, "");
  }
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  let input = "";
  try {
    for await (const chunk of stdin) {
      for (const char of String(chunk)) {
        if (char === "\u0003") throw new Error("Cancelled.");
        if (char === "\r" || char === "\n") return input;
        if (char === "\u007f") input = input.slice(0, -1);
        else input += char;
      }
    }
    return input;
  } finally {
    stdin.setRawMode(false);
    stdin.pause();
    stdout.write("\n");
  }
}

const email = process.argv[2]?.trim().toLowerCase();
if (!email) throw new Error("Usage: npm run user:grant-admin -- <email>");
const db = new PrismaClient();
try {
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true, role: true, passwordHash: true },
  });
  const password = await readHidden(`Password of ${email}: `);
  if (
    !user?.passwordHash ||
    !(await verifyPassword(password, user.passwordHash))
  )
    throw new Error("Unknown account or wrong password. Nothing changed.");
  if (user.role === "ADMIN")
    console.log(`${email} (${user.id}) is already an administrator.`);
  else {
    await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: { role: "ADMIN", sessionVersion: { increment: 1 } },
      }),
      db.auditLog.create({
        data: {
          actorId: user.id,
          action: `user.role_changed.${user.role}.ADMIN.operator`,
          entityId: user.id,
        },
      }),
    ]);
    console.log(
      `${user.name ?? email} (${user.id}) is now an administrator. Sign in again to use it.`,
    );
  }
} finally {
  await db.$disconnect();
}
