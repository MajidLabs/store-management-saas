"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useAuth } from "@/lib/auth-context";
import { Role } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  roles: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", roles: ["STORE_OWNER", "STAFF"] },
  { href: "/products", label: "Products", roles: ["STORE_OWNER", "STAFF"] },
  { href: "/categories", label: "Categories", roles: ["STORE_OWNER", "STAFF"] },
  { href: "/orders", label: "Orders", roles: ["STORE_OWNER", "STAFF"] },
  { href: "/staff", label: "Staff", roles: ["STORE_OWNER"] },
  { href: "/billing", label: "Billing", roles: ["STORE_OWNER"] },
  { href: "/admin/stores", label: "All stores", roles: ["SUPER_ADMIN"] },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const items = NAV_ITEMS.filter((item) => user && item.roles.includes(user.role));

  return (
    <aside className="flex h-screen w-56 shrink-0 flex-col border-r border-border bg-surface">
      <div className="flex h-14 items-center border-b border-border px-4">
        <span className="font-mono text-sm font-semibold tracking-tight text-ink">
          store<span className="text-accent">.saas</span>
        </span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 p-2">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "rounded px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent-soft text-accent"
                  : "text-ink-muted hover:bg-bg hover:text-ink",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <p className="truncate text-xs text-ink-muted">{user?.email}</p>
        <p className="mb-2 text-xs text-ink-faint">{roleLabel(user?.role)}</p>
        <button
          onClick={() => logout()}
          className="text-xs font-medium text-ink-muted hover:text-danger"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}

function roleLabel(role?: Role): string {
  if (role === "SUPER_ADMIN") return "Platform admin";
  if (role === "STORE_OWNER") return "Store owner";
  if (role === "STAFF") return "Staff";
  return "";
}
