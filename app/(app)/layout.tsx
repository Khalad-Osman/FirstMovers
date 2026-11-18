import { requireUser } from "@/lib/auth";
import { getWatchlist } from "@/lib/data/briefs";
import { getUnreadCount } from "@/lib/data/notifications";
import { SidebarNav } from "@/components/sidebar-nav";
import { signOut } from "../(auth)/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [watchlist, unread] = await Promise.all([
    getWatchlist(), // same query the Watchlist page uses
    getUnreadCount(user.id),
  ]);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-4 bg-[var(--slate)] px-4 py-4 text-[var(--slate-text)] md:sticky md:top-0 md:h-screen md:py-6">
        <div className="text-[1.0625rem] font-bold tracking-[0.04em] text-white">FIRST MOVERS</div>
        <nav aria-label="Main">
          <SidebarNav
            items={[
              { href: "/", label: "Opportunity Feed" },
              { href: "/discovery", label: "Discovery" },
              { href: "/prospects", label: "Prospects" },
              { href: "/research", label: "Live Research" },
              { href: "/watchlist", label: "Watchlist", count: watchlist.length },
              { href: "/notifications", label: "Notifications", count: unread, countLabel: `${unread} unread`, highlight: unread > 0 },
            ]}
            secondary={{
              label: "Pipeline & admin",
              items: [
                { href: "/signals", label: "Signals" },
                { href: "/sources", label: "Data sources" },
                { href: "/deals", label: "Past deals" },
                { href: "/usage", label: "Usage" },
                { href: "/settings", label: "Settings" },
              ],
            }}
          />
        </nav>
        <div className="mt-auto grid gap-2 border-t border-[var(--slate-2)] pt-4 text-[0.875rem]">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 truncate font-semibold text-white">{user.fullName ?? user.email}</span>
            <span className="badge badge-role">{user.role}</span>
          </div>
          <form action={signOut}>
            <button type="submit" className="text-[var(--slate-text)] underline underline-offset-2 hover:text-white">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-[1200px]">{children}</div>
      </main>
    </div>
  );
}
