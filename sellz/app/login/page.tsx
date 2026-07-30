import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";
import { googleEnabled } from "@/auth.config";

// Rendered per request, not prerendered: `googleEnabled` reads the environment,
// and a static page would freeze it at build time — so adding Google
// credentials to a running deployment would leave the button invisible until
// the next rebuild.
export const dynamic = "force-dynamic";

// A server component so it can read whether Google is configured; the form
// itself is a client component. Suspense because AuthForm reads search params
// (?next=).
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm mode="signin" googleEnabled={googleEnabled} />
    </Suspense>
  );
}
