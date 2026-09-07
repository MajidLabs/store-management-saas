"use client";

import { useState } from "react";
import Link from "next/link";
import { authApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { AuthShell } from "@/components/layout/auth-shell";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/primitives";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await authApi.requestPasswordReset({ email });
      // Always show the same success state, whether or not the email is
      // registered - matches the backend's anti-enumeration behavior.
      // Branching this on a "does this email exist" signal would leak
      // exactly what the backend is designed not to leak.
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we'll send you a link to reset your password."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-accent hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      {submitted ? (
        <div className="rounded border border-accent/30 bg-accent-soft px-3 py-3 text-sm text-ink">
          If an account exists for <span className="font-medium">{email}</span>, we&apos;ve sent a
          link to reset your password. It expires in 1 hour.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <ErrorBanner message={error} />}
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Button type="submit" isLoading={isSubmitting} className="mt-2 w-full">
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
