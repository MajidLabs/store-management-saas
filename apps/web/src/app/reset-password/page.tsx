"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";
import { AuthShell } from "@/components/layout/auth-shell";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ErrorBanner, PageSpinner } from "@/components/ui/primitives";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<PageSpinner />}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  const footer = (
    <>
      Remembered your password?{" "}
      <Link href="/login" className="font-medium text-accent hover:underline">
        Back to sign in
      </Link>
    </>
  );

  if (!token) {
    return (
      <AuthShell title="Reset your password" subtitle="This reset link is missing or malformed." footer={footer}>
        <ErrorBanner message="No reset token found in the link. Request a new one from the sign-in page." />
      </AuthShell>
    );
  }

  if (succeeded) {
    return (
      <AuthShell title="Password updated" subtitle="Your password has been changed." footer={footer}>
        <div className="rounded border border-accent/30 bg-accent-soft px-3 py-3 text-sm text-ink">
          You&apos;ve been signed out of any existing sessions for security. Sign in with your new
          password to continue.
        </div>
      </AuthShell>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await authApi.resetPassword({ token: token as string, newPassword });
      setSucceeded(true);
      setTimeout(() => router.push("/login"), 3000);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "This link may have expired or already been used. Request a new one from the sign-in page.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Choose a new password for your account."
      footer={footer}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && <ErrorBanner message={error} />}
        <Field label="New password" htmlFor="new-password">
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm-password">
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" isLoading={isSubmitting} className="mt-2 w-full">
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}
