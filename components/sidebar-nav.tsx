"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; count?: number; countLabel?: string; highlight?: boolean };

function isActive(href: string, pathname: string) {
  return href === "/"
    ? pathname === "/" || pathname.startsWith("/briefs") || pathname.startsWith("/samples")
    : pathname.startsWith(href);
}

function NavList({ items, pathname }: { items: Item[]; pathname: string }) {
  return (
    <ul className="flex flex-wrap gap-1 md:flex-col">
      {items.map((item) => {
        const active = isActive(item.href, pathname);
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
                <span
                  className={
                    item.highlight
                      ? "mono rounded-full bg-[var(--accent)] px-2 text-[0.8125rem] font-semibold text-white"
                      : "mono text-[0.8125rem] text-[var(--slate-muted)]"
                  }
                  aria-label={item.countLabel ?? `${item.count} companies`}
                >
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

/**
 * Broker-facing pages first; pipeline and admin pages in a collapsible group
 * below. The group starts open when the current page is inside it.
 */
export function SidebarNav({
  items,
  secondary,
}: {
  items: Item[];
  secondary?: { label: string; items: Item[] };
}) {
  const pathname = usePathname();
  const secondaryActive = secondary?.items.some((i) => isActive(i.href, pathname)) ?? false;

  return (
    <div className="grid gap-3">
      <NavList items={items} pathname={pathname} />
      {secondary && (
        // Remount when entering/leaving the group so it opens on its own pages.
        <details key={secondaryActive ? "in" : "out"} open={secondaryActive} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-[3px] px-3 py-2 text-[0.8125rem] font-semibold uppercase tracking-[0.06em] text-[var(--slate-muted)] hover:bg-[var(--slate-2)] hover:text-white [&::-webkit-details-marker]:hidden">
            <span>{secondary.label}</span>
            <span aria-hidden="true" className="transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <div className="mt-1">
            <NavList items={secondary.items} pathname={pathname} />
          </div>
        </details>
      )}
    </div>
  );
}
