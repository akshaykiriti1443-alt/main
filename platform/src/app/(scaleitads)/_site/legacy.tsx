import { LegacyScript } from "./client";

/**
 * Renders one of the booking-funnel pages ported verbatim from GoHighLevel (/apply, /booked,
 * /not-yet): its CSS and markup on the server, and its own script once the page is on screen.
 */
export function LegacyPage({ rootId, css, html, js }: { rootId: string; css: string; html: string; js: string }) {
  return (
    <div className="sia-root">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <LegacyScript rootId={rootId} js={js} />
    </div>
  );
}
