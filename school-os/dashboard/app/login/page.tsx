import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { COOKIE, isAuthed } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const to = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (await isAuthed((await cookies()).get(COOKIE)?.value)) redirect(to);
  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-4">
      <div className="card rise w-full max-w-sm p-7">
        <div className="text-xs tracking-[0.18em] uppercase mb-6" style={{ color: "var(--muted)" }}>School OS</div>
        <h1 className="text-2xl mb-1">Welcome back.</h1>
        <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>Your notes are private. The password is the one set in Vercel.</p>
        <LoginForm next={to} />
      </div>
    </div>
  );
}
