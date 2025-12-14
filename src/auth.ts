import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import argon2 from "argon2";
import { prisma } from "@/lib/db";
import { rateLimitOrThrow } from "@/lib/security/rateLimit";
import { writeAuditLog } from "@/lib/audit";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (creds, req) => {
        const parsed = credentialsSchema.safeParse(creds);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase();
        const ip = (req?.headers?.["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? null;
        await rateLimitOrThrow({
          key: `auth:${ip ?? "unknown"}:${email}`,
          limit: 12,
          windowMs: 10 * 60_000,
        });

        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true, passwordHash: true },
        });
        if (!user) {
          await writeAuditLog({
            type: "AUTH_LOGIN_FAILURE",
            ip,
            details: { email, reason: "user_not_found" },
          });
          return null;
        }

        const ok = await argon2.verify(user.passwordHash, parsed.data.password);
        if (!ok) {
          await writeAuditLog({
            userId: user.id,
            type: "AUTH_LOGIN_FAILURE",
            ip,
            details: { email, reason: "bad_password" },
          });
          return null;
        }

        await writeAuditLog({
          userId: user.id,
          type: "AUTH_LOGIN_SUCCESS",
          ip,
          details: { email },
        });

        return { id: user.id, email: user.email };
      },
    }),
  ],
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) (session.user as any).id = token.sub;
      return session;
    },
  },
};

