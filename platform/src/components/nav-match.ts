// Which menu item an address belongs to. Pure, so the sidebar, the layout and the tests agree.

type Matchable = { href: string; exact?: boolean };

/** An exact item (the Dashboard) only matches itself; any other item also owns the pages under it. */
export function isActive(pathname: string, item: Matchable) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** The most specific item for an address. Query and hash are ignored, so /settings#tracking is Settings. */
export function matchNavItem<T extends Matchable>(items: T[], href: string | null | undefined): T | undefined {
  if (!href) return undefined;
  const path = href.split(/[?#]/)[0];
  return items.filter((i) => isActive(path, i)).sort((a, b) => b.href.length - a.href.length)[0];
}
