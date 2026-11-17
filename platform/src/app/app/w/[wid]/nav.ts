import type { WorkspacePlan } from "@/lib/db/schema";
import type { NavGroup, NavItem } from "@/components/AppShell";
import { matchNavItem } from "@/components/nav-match";
import { hasFeature } from "@/server/plans";
import { reelVaultNavItem } from "@/components/reelvault/routes";

export type WorkspaceNavInput = {
  base: string;
  plan: WorkspacePlan;
  unread: number;
  /** ReelVault's shared secret is set (reelVaultConfigured()). */
  reelVault: boolean;
  /** The short Member menu: a starter-plan workspace on the platform's own brand, not paused. */
  member: boolean;
  mode: "week" | "after";
  /** path.current.href without ?#, when the next step is a page in the app. */
  nextHref: string | null;
};

export function workspaceNav(o: WorkspaceNavInput): NavGroup[] {
  const { base, plan } = o;
  const growth = hasFeature(plan, "inbox");
  const item = {
    dashboard: { href: base, label: "Dashboard", icon: "dashboard", exact: true },
    path: { href: `${base}/path`, label: "Your path", icon: "route" },
    ai: { href: `${base}/ai`, label: "Your AI", icon: "bot" },
    launch: { href: `${base}/launch`, label: "AI launch kit", icon: "sparkles" },
    sites: { href: `${base}/sites`, label: "Funnels & pages", icon: "globe" },
    research: { href: `${base}/ads/research`, label: "Ad research", icon: "search" },
    studio: { href: `${base}/ads/studio`, label: "Ad studio", icon: "palette" },
    review: { href: `${base}/ads`, label: "Ad review", icon: "megaphone" },
    growth: { href: `${base}/growth`, label: "Growth ladder", icon: "ladder" },
    leads: { href: `${base}/leads`, label: "Leads", icon: "users" },
    unlocks: { href: `${base}/unlocks`, label: "Unlocks", icon: "gift" },
    emails: { href: `${base}/emails`, label: "Emails", icon: "mail" },
    billing: { href: `${base}/billing`, label: "Plan & wallet", icon: "billing" },
    settings: { href: `${base}/settings`, label: "Settings", icon: "settings" },
  } satisfies Record<string, NavItem>;
  // ReelVault opens right inside the app (/reelvault), already signed in, with its screens as sub-items.
  // Only shown once the shared secret is set, so nobody is sent to a ReelVault that isn't there.
  const reelVault: NavItem[] = o.reelVault ? [reelVaultNavItem(base)] : [];

  if (o.member) {
    // In the order the course's days first use them, and the same every day so nothing moves.
    // A Member never sees a Growth-plan tool, so there is nothing locked to show.
    const first: NavItem[] = [item.dashboard, item.path];
    const week: NavItem[] = [item.ai, item.launch, item.sites, item.research, item.studio, item.leads, item.growth, item.unlocks, item.review];
    const more: NavItem[] = [...reelVault, item.emails, item.settings, item.billing];
    // Open "More" on the server when the next step lives there (the Pixel step is /settings#tracking),
    // so its glowing dot is visible on first paint.
    const next = matchNavItem([...first, ...week, ...more], o.nextHref);
    return [
      { items: first },
      { title: o.mode === "after" ? "Your tools" : "Your week", items: week },
      { id: "more", title: "More", collapsible: true, defaultOpen: Boolean(next && more.includes(next)), items: more },
    ];
  }

  return [
    { items: [item.dashboard, item.path] },
    { title: "Start here", items: [item.ai, item.launch, item.sites] },
    {
      title: "Get members",
      items: [
        item.research,
        ...reelVault,
        item.studio,
        item.review,
        item.growth,
        item.leads,
        { href: `${base}/pipeline`, label: "Pipeline", icon: "pipeline", locked: !hasFeature(plan, "pipelines") },
      ],
    },
    {
      title: "Keep members",
      items: [
        { href: `${base}/automations`, label: "Automations", icon: "workflow", locked: !growth },
        item.unlocks,
        item.emails,
      ],
    },
    {
      title: "Talk",
      items: [
        { href: `${base}/inbox`, label: "Inbox", icon: "inbox", badge: o.unread || undefined, locked: !growth },
        { href: `${base}/social`, label: "Social planner", icon: "calendar", locked: !growth },
        { href: `${base}/calendar`, label: "Calendar", icon: "booking", locked: !hasFeature(plan, "calendar") },
      ],
    },
    { title: "Account", items: [item.billing, item.settings] },
  ];
}
