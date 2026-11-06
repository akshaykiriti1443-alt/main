import type { Metadata, Viewport } from "next";
import { PublicPage, publicMetadata, publicSite, publicViewport } from "@/components/landing/PublicPage";

export const dynamic = "force-dynamic";

type Params = Promise<{ site: string; path?: string[] }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { site, path = [] } = await params;
  return publicMetadata(await publicSite({ slug: site }), path);
}

export async function generateViewport({ params }: { params: Params }): Promise<Viewport> {
  const { site } = await params;
  return publicViewport(await publicSite({ slug: site }));
}

export default async function SitePage({ params, searchParams }: { params: Params; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { site, path = [] } = await params;
  return <PublicPage site={await publicSite({ slug: site })} path={path} searchParams={await searchParams} />;
}
