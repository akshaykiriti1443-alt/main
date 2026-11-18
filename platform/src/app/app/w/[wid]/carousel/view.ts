import type { CarouselLook, CarouselSlide } from "@/server/carousel/shape";
import type { Carousel } from "@/server/carousel/store";

/** A saved carousel as the editor in the browser gets it. */
export type CarouselView = {
  id: string;
  title: string;
  handle: string;
  look: CarouselLook;
  slides: CarouselSlide[];
  source: string;
  createdAt: string;
};

export const toView = (c: Carousel): CarouselView => ({ id: c.id, title: c.title, handle: c.handle, look: c.look, slides: c.slides, source: c.source, createdAt: c.createdAt.toISOString() });

/** The words under the downloads, exactly as the course says them. */
export const POSTING_TIP = "On Instagram: + › Post › pick all slides in order › Add music.";

export const slideUrl = (wid: string, id: string, n: number, look: CarouselLook, opts: { download?: boolean; v?: number } = {}) =>
  `/api/carousel?${new URLSearchParams({ w: wid, id, slide: String(n), look, ...(opts.download ? { download: "1" } : {}), ...(opts.v ? { v: String(opts.v) } : {}) })}`;

export const zipUrl = (wid: string, id: string, look: CarouselLook) => `/api/carousel?${new URLSearchParams({ w: wid, id, look, zip: "1" })}`;
