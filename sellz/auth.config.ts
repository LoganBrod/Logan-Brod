import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * The half of the auth setup that must run on the edge.
 *
 * `middleware.ts` runs in the edge runtime, where Prisma cannot load — so the
 * PrismaAdapter and the Credentials provider (which needs bcrypt and a DB
 * lookup) live in lib/auth.ts instead, and only this edge-safe config is
 * imported by the middleware. Splitting them is not stylistic: importing the
 * adapter into middleware fails the build outright.
 */
export const authConfig = {
  providers: [Google],
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    /**
     * Carry the user id and plan on the token so route handlers can read them
     * without a database round trip.
     *
     * `plan` here is a UI hint only. It goes stale the moment a Stripe webhook
     * changes the subscription, and a stale token must never be able to unlock
     * a paid feature — so every limit is enforced against the User row in
     * lib/usage.ts, never against this value.
     */
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.plan = (user as { plan?: string }).plan ?? "free";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.plan = (token.plan as string) ?? "free";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
