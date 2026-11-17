import { Flash } from "@/components/ui";

// Matches /reelvault and every ReelVault deep link (/reelvault/reels, /reelvault/reel/<id>, …).
// Everything visible is drawn by the layout, so the frame stays mounted between these addresses.
// The only thing here is the flash from an action that came back to this address (like "Send the link again").
export const metadata = { title: "ReelVault" };

export default async function ReelVaultPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  return <Flash searchParams={await searchParams} />;
}
