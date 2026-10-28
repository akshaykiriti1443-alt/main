import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PublicPage, publicMetadata } from "@/components/landing/PublicPage";
import { findPublicSite } from "@/server/sites";
import { agencyForHost } from "@/server/agency";

export const dynamic = "force-dynamic";

type Params = Promise<{ host: string; path?: string[] }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { host, path = [] } = await params;
  return publicMetadata(await findPublicSite({ domain: decodeURIComponent(host) }), path);
}

export default async function DomainPage({ params, searchParams }: { params: Params; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { host, path = [] } = await params;
  const domain = decodeURIComponent(host);
  const site = await findPublicSite({ domain });
  if (!site) {
    // A white-label agency's app domain: send visitors to the branded login.
    if (await agencyForHost(domain)) redirect("/login");
    notFound();
  }
  return <PublicPage site={site} path={path} searchParams={await searchParams} />;
}
