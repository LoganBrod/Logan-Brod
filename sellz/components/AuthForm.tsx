"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { motion } from "framer-motion";
import PageHeader from "@/components/PageHeader";

const field =
  "w-full rounded-lg border border-ink-border bg-ink px-3 py-2 text-fog placeholder:text-fog/30 focus:border-brand focus:outline-none transition-colors";

/**
 * Sign-in and sign-up share this component: they differ by one field and one
 * endpoint. Google is offered first because it is the path that involves no
 * password handling on our side at all.
 *
 * Lives in components/ rather than in the page, because a Next.js page may
 * only export a default plus a few reserved fields — a second export there is
 * a build error.
 */
export default function AuthForm({ mode }: { mode: "signin" | "signup" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSignup = mode === "signup";

  async function withEmail() {
    setBusy("email");
    setError(null);
    try {
      if (isSignup) {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Couldn't create the account");
      }

      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        throw new Error(
          isSignup
            ? "Account created, but signing in failed. Try signing in."
            : "That email and password don't match."
        );
      }
      // Onboarding decides for itself whether this seller still needs setting
      // up, so it is safe to send new accounts there unconditionally.
      router.push(isSignup ? "/onboarding" : next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <PageHeader
        title={isSignup ? "Create your account" : "Sign in"}
        subtitle={
          isSignup
            ? "Photograph an item, and LevoZ prices it against real sales and writes the listing."
            : "Welcome back."
        }
      />

      <section className="mt-6 rounded-2xl border border-ink-border bg-ink-card p-6 shadow-card">
        <button
          onClick={() => {
            setBusy("google");
            signIn("google", { callbackUrl: isSignup ? "/onboarding" : next });
          }}
          disabled={busy !== null}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 font-bold text-ink transition hover:bg-brand-dim disabled:opacity-50"
        >
          {busy === "google" ? "Redirecting…" : "Continue with Google"}
        </button>

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-ink-border" />
          <span className="text-xs font-semibold uppercase tracking-wider text-fog/30">or</span>
          <span className="h-px flex-1 bg-ink-border" />
        </div>

        <div className="space-y-3 text-sm">
          {isSignup && (
            <label className="block space-y-1">
              <span className="text-fog/50">Name (optional)</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className={field} />
            </label>
          )}
          <label className="block space-y-1">
            <span className="text-fog/50">Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={field}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-fog/50">
              Password{" "}
              {isSignup && <span className="text-fog/30">(at least 10 characters)</span>}
            </span>
            <input
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && email && password) withEmail();
              }}
              className={field}
            />
          </label>
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
        )}

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={withEmail}
          disabled={busy !== null || !email || !password}
          className="mt-4 w-full rounded-xl bg-ink-border px-5 py-3 font-bold text-fog transition hover:bg-ink-border/70 disabled:opacity-40"
        >
          {busy === "email"
            ? isSignup
              ? "Creating account…"
              : "Signing in…"
            : isSignup
              ? "Create account"
              : "Sign in with email"}
        </motion.button>

        <p className="mt-5 text-center text-xs text-fog/45">
          {isSignup ? (
            <>
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-brand hover:underline">
                Sign in
              </Link>
            </>
          ) : (
            <>
              New here?{" "}
              <Link href="/signup" className="font-semibold text-brand hover:underline">
                Create an account
              </Link>
            </>
          )}
        </p>
      </section>
    </div>
  );
}
