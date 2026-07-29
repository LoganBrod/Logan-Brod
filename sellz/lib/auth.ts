import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { authConfig } from "../auth.config";
import { prisma } from "./prisma";

/**
 * The full auth setup, used by route handlers and server components.
 *
 * Extends the edge-safe config in auth.config.ts with the Prisma adapter and
 * the email/password provider — both of which need Node, so neither can be
 * imported by middleware.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    ...authConfig.providers,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").trim().toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        // A Google-only account has no passwordHash. Returning null rather
        // than a distinct error keeps the response identical to a wrong
        // password, so this can't be used to enumerate which emails exist.
        if (!user?.passwordHash) return null;

        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;

        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
});

/**
 * The signed-in user's id, or null.
 *
 * Every API route funnels tenancy through this: whatever it returns is the
 * only tenant that request may touch.
 */
export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
