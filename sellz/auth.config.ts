import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Google credentials, under either naming convention.
 *
 * Auth.js v5 infers `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` for a bare provider,
 * but Google's own console calls them a client ID and client secret and the
 * rest of this project documents `GOOGLE_CLIENT_*`. Reading both means whichever
 * pair is set works, instead of the documented one being silently ignored.
 */
const googleId = process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID;
const googleSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET;

/**
 * Whether Google sign-in is available at all.
 *
 * The provider is registered only when it is configured: an unconfigured
 * provider still renders a button that dead-ends on Google's error page, so
 * the sign-in screen reads this to decide whether to offer it. Email/password
 * keeps working either way, which is what makes a deploy usable before the
 * OAuth consent screen is approved.
 */
export const googleEnabled = Boolean(googleId && googleSecret);

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
  /**
   * Trust the host header.
   *
   * Auth.js refuses to serve a host it cannot verify, and it can only infer
   * trust automatically on the platforms it recognises — Vercel and friends.
   * Self-hosted behind a proxy (Railway, Docker, Fly) it infers nothing and
   * every auth request fails with `UntrustedHost`, which takes sign-in down
   * with it. Relying on NEXTAUTH_URL instead does not work here: the middleware
   * is bundled for the edge runtime, where the value has to be present at build
   * time, so a variable set only on the running service is not seen.
   *
   * Safe because the app is always reached through its own proxy, which sets
   * the host itself.
   */
  trustHost: true,
  providers: googleEnabled
    ? [Google({ clientId: googleId, clientSecret: googleSecret })]
    : [],
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
