"use client";

import { useAuth } from "@/lib/auth-context";
import { Role } from "@/lib/types";
import { EmptyState } from "@/components/ui/primitives";

export function RoleGuard({
  allow,
  children,
}: {
  allow: Role[];
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  if (!user || !allow.includes(user.role)) {
    return (
      <EmptyState
        title="You don't have access to this page"
        description="This section is restricted to a different role on your store."
      />
    );
  }
  return <>{children}</>;
}
