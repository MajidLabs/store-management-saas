"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSubscription, useCreateCheckoutSession } from "@/hooks/use-store";
import { PageHeader } from "@/components/layout/page-header";
import { RoleGuard } from "@/components/layout/role-guard";
import { Button } from "@/components/ui/button";
import { Card, Badge, ErrorBanner, PageSpinner } from "@/components/ui/primitives";
import { ApiError } from "@/lib/api-client";
import { Plan } from "@/lib/types";

const PLAN_DETAILS: Record<Plan, { label: string; price: string; products: string; staff: string }> = {
  FREE: { label: "Free", price: "$0/mo", products: "Up to 20 products", staff: "1 staff seat" },
  PRO: {
    label: "Pro",
    price: "$29/mo",
    products: "Unlimited products",
    staff: "Up to 10 staff seats",
  },
};

export default function BillingPage() {
  return (
    <RoleGuard allow={["STORE_OWNER"]}>
      <BillingContent />
    </RoleGuard>
  );
}

function BillingContent() {
  const { data: subscription, isLoading } = useSubscription();
  const checkout = useCreateCheckoutSession();
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();
  const justUpgraded = searchParams.get("upgraded") === "1";

  useEffect(() => {
    if (justUpgraded) {
      const timer = setTimeout(() => router.replace("/billing"), 4000);
      return () => clearTimeout(timer);
    }
  }, [justUpgraded, router]);

  async function handleUpgrade(targetPlan: Plan) {
    setError(null);
    try {
      const { url } = await checkout.mutateAsync(targetPlan);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start checkout.");
    }
  }

  if (isLoading) return <PageSpinner />;

  return (
    <div>
      <PageHeader title="Billing" description="Manage your plan and staff seat limit." />

      {justUpgraded && (
        <div className="mb-4 rounded border border-accent/30 bg-accent-soft px-3 py-2 text-sm text-accent">
          Plan updated.
        </div>
      )}
      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(Object.keys(PLAN_DETAILS) as Plan[]).map((plan) => {
          const details = PLAN_DETAILS[plan];
          const isCurrent = subscription?.plan === plan;
          return (
            <Card key={plan} className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold text-ink">{details.label}</h2>
                {isCurrent && <Badge tone="accent">Current plan</Badge>}
              </div>
              <p className="mb-4 font-mono text-2xl font-semibold text-ink">{details.price}</p>
              <ul className="mb-5 flex flex-col gap-1.5 text-sm text-ink-muted">
                <li>{details.products}</li>
                <li>{details.staff}</li>
              </ul>
              {!isCurrent && (
                <Button
                  variant="secondary"
                  className="w-full"
                  isLoading={checkout.isPending}
                  onClick={() => handleUpgrade(plan)}
                >
                  {plan === "PRO" ? "Upgrade to Pro" : "Downgrade to Free"}
                </Button>
              )}
            </Card>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-ink-faint">
        Status: {subscription?.status} &middot; This environment uses a mock payment provider by
        default, so upgrades apply instantly with no card required. A real Stripe test-mode
        integration is available - see the project README.
      </p>
    </div>
  );
}
