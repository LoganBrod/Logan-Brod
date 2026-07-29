import type { DefaultSession } from "next-auth";

/**
 * `id` and `plan` are put on the session by the jwt/session callbacks in
 * auth.config.ts; these declarations make them visible to TypeScript.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      plan: string;
    } & DefaultSession["user"];
  }

  interface User {
    plan?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    plan?: string;
  }
}
