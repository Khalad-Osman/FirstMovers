"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; count?: number };

export function SidebarNav({ items }: { items: Item[] }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-wrap gap-1 md:flex-col">
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/" || pathname.startsWith("/briefs") || pathname.startsWith("/samples")
            : pathname.startsWith(item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center justify-between gap-3 rounded-[3px] px-3 py-2 text-[0.9375rem] ${
                active
                  ? "bg-[var(--slate-2)] text-white shadow-[inset_3px_0_0_var(--accent-soft)]"
                  : "text-[var(--slate-text)] hover:bg-[var(--slate-2)]"
              }`}
            >
              <span>{item.label}</span>
              {item.count !== undefined && (
                <span className="mono text-[0.8125rem] text-[var(--slate-muted)]" aria-label={`${item.count} companies`}>
                  {item.count}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
