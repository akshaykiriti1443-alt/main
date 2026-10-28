import type { Metadata } from "next";
import { PublicPage, publicMetadata } from "@/components/landing/PublicPage";
import { findPublicSite } from "@/server/sites";

export const dynamic = "force-dynamic";

type Params = Promise<{ site: string; path?: string[] }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { site, path = [] } = await params;
  return publicMetadata(await findPublicSite({ slug: site }), path);
}

export default async function SitePage({ params, searchParams }: { params: Params; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { site, path = [] } = await params;
  return <PublicPage site={await findPublicSite({ slug: site })} path={path} searchParams={await searchParams} />;
}
