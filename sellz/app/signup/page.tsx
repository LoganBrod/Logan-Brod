import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";
import { googleEnabled } from "@/auth.config";

// See the note in app/login/page.tsx — read per request, not baked at build.
export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm mode="signup" googleEnabled={googleEnabled} />
    </Suspense>
  );
}
