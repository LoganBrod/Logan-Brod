"use client";

import { Suspense } from "react";
import AuthForm from "@/components/AuthForm";

export default function LoginPage() {
  // Suspense boundary because AuthForm reads search params (?next=).
  return (
    <Suspense fallback={null}>
      <AuthForm mode="signin" />
    </Suspense>
  );
}
