"use client";

import { useState } from "react";
import { useStaff, useInviteStaff, useRemoveStaff } from "@/hooks/use-store";
import { PageHeader } from "@/components/layout/page-header";
import { RoleGuard } from "@/components/layout/role-guard";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Card, EmptyState, ErrorBanner, PageSpinner } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { ApiError } from "@/lib/api-client";

export default function StaffPage() {
  return (
    <RoleGuard allow={["STORE_OWNER"]}>
      <StaffContent />
    </RoleGuard>
  );
}

function StaffContent() {
  const { data: staff, isLoading } = useStaff();
  const inviteStaff = useInviteStaff();
  const removeStaff = useRemoveStaff();
  const [isInviting, setIsInviting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await inviteStaff.mutateAsync({ email, password });
      setEmail("");
      setPassword("");
      setIsInviting(false);
    } catch (err) {
      // A 403 here is most often the plan's staff-seat limit - surface the
      // server's actual message rather than a generic "forbidden".
      setError(err instanceof ApiError ? err.message : "Couldn't invite staff member.");
    }
  }

  async function handleRemove(id: string, staffEmail: string) {
    if (!confirm(`Remove ${staffEmail}? They'll lose access immediately.`)) return;
    await removeStaff.mutateAsync(id);
  }

  return (
    <div>
      <PageHeader
        title="Staff"
        description="Invite team members to help manage your store."
        action={<Button onClick={() => setIsInviting(true)}>Invite staff</Button>}
      />

      {isLoading ? (
        <PageSpinner />
      ) : !staff || staff.length === 0 ? (
        <EmptyState
          title="No staff yet"
          description="Invite someone to help manage products and orders."
          action={<Button onClick={() => setIsInviting(true)}>Invite staff</Button>}
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {staff.map((member) => (
              <li key={member.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-ink">{member.email}</span>
                <button
                  onClick={() => handleRemove(member.id, member.email)}
                  className="text-xs font-medium text-ink-muted hover:text-danger"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Modal isOpen={isInviting} onClose={() => setIsInviting(false)} title="Invite staff">
        <form onSubmit={handleInvite} className="flex flex-col gap-4">
          {error && <ErrorBanner message={error} />}
          <Field label="Email" htmlFor="staffEmail">
            <Input
              id="staffEmail"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Temporary password" htmlFor="staffPassword">
            <Input
              id="staffPassword"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button type="submit" isLoading={inviteStaff.isPending}>
            Send invite
          </Button>
        </form>
      </Modal>
    </div>
  );
}
