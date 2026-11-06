import { ExternalLinkIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * "Get a domain": a member searches for a name and lands at the platform owner's domain partner
 * through the affiliate link (/r/domain counts the click). Opens in a new tab.
 */
export function GetDomain({ wid, partner }: { wid: string; partner: string }) {
  return (
    <form action="/r/domain" method="get" target="_blank" className="flex flex-col gap-3 rounded-2xl border border-dashed border-border-strong bg-card/40 p-4">
      <input type="hidden" name="w" value={wid} />
      <label htmlFor="domain-idea" className="text-sm font-semibold tracking-[-0.01em]">
        No domain yet? Find one in 30 seconds
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle-foreground" aria-hidden />
          <Input id="domain-idea" name="q" placeholder="yourbrand.com" className="rounded-full pl-10" autoComplete="off" />
        </div>
        <Button type="submit" variant="outline">
          Get a domain <ExternalLinkIcon data-icon="inline-end" />
        </Button>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Opens {partner} in a new tab. Buy it there, then connect it above. We may earn a commission at no extra cost to you.
      </p>
    </form>
  );
}
