import type { PageKind } from "@/lib/db/schema";
import { siteThemeSchema, type PageContent, type Section, type SiteTheme } from "@/lib/db/types";
import { midSentence, shortId } from "@/lib/util";

// Ready-made websites members can start from. Pure (no database), so the UI, the AI and tests can all
// build one and hand it to createSite. Copy is a plain-words placeholder: no numbers, no testimonials,
// nothing the member would have to un-claim. They (or Claude) rewrite it in their own voice.

/** The /skool violet: the colour our own marketing page uses. */
export const GLASS_BRAND = "#6A45F5";

export type SiteStarter = {
  theme: SiteTheme;
  leadMagnetName: string;
  /** The opt-in page's sections (hero with the signup form, benefits, steps, FAQ, Join button). */
  sections: Section[];
  /** Both pages, ready for createSite. */
  pages: { slug: string; title: string; kind: PageKind; content: PageContent }[];
};

const id = () => shortId(8);
const clean = (s: string | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * The premium starter: our own /skool look ("Glass") on a Skool community landing page.
 * `name` is the community or business name; `niche` (optional) is who or what it is for.
 */
export function glassStarter(opts: { name: string; niche?: string; brandColor?: string }): SiteStarter {
  const name = clean(opts.name, 80) || "our community";
  const niche = midSentence(clean(opts.niche, 60));
  const theme = siteThemeSchema.parse({
    style: "glass",
    font: "sans",
    brandColor: opts.brandColor && /^#[0-9a-fA-F]{6}$/.test(opts.brandColor) ? opts.brandColor : GLASS_BRAND,
  });

  const sections: Section[] = [
    {
      id: id(),
      type: "hero",
      // A long niche would wrap the little label onto three lines; it reads fine in the FAQ instead.
      eyebrow: niche && niche.length <= 32 ? `Free guide for ${niche}` : "Free starter guide",
      headline: "Your first step, made simple",
      subheadline: `A short, free guide from ${name}. Read it in one sitting, then try the first step today.`,
      bullets: ["One clear first step you can take today", "Plain words, no jargon", "Free, sent straight to your inbox"],
      ctaText: "Send me the free guide",
      formTitle: "Where should we send it?",
      showForm: true,
      imageUrl: "",
    },
    {
      id: id(),
      type: "benefits",
      title: "What you get inside the community",
      items: [
        { title: "A clear path", body: "Lessons in order, so you always know what to do next." },
        { title: "People on the same road", body: "Share progress and swap ideas with members who are working on the same thing." },
        { title: "Help when you're stuck", body: "Post a question and get a real answer, not a sales pitch." },
      ],
    },
    {
      id: id(),
      type: "steps",
      title: "How it works",
      items: [
        { title: "Get the free guide", body: "Enter your email and it lands in your inbox." },
        { title: "Try the first step", body: "The guide starts with one small thing you can do today." },
        { title: "Join the community", body: "When you want more, join us on Skool and keep going together." },
      ],
    },
    {
      id: id(),
      type: "faq",
      title: "Questions",
      items: [
        { q: "Is the guide really free?", a: "Yes. Enter your email and it's yours." },
        { q: "What is the community?", a: `It's the ${name} group on Skool, where members learn, ask questions and share progress.` },
        { q: "Do I need any experience?", a: "No. Everything starts from the beginning." },
        { q: "Can I unsubscribe?", a: "Yes, any time, with one click at the bottom of every email." },
      ],
    },
    {
      id: id(),
      type: "cta",
      headline: "Ready to go further?",
      body: `Join ${name} on Skool and keep going with people on the same path.`,
      buttonText: "Join the community",
      buttonUrl: "{{skool_url}}",
    },
  ];

  const thankYou: Section[] = [
    {
      id: id(),
      type: "cta",
      headline: "You're in. Check your inbox.",
      body: "Your free guide is on its way. While you wait, come and say hello in the community.",
      buttonText: "Join the community",
      buttonUrl: "{{skool_url}}",
    },
  ];

  return {
    theme,
    // Shown on the form as "Yours free: The starter guide". The member renames it to their real guide.
    leadMagnetName: "The starter guide",
    sections,
    pages: [
      { slug: "", title: "Opt-in page", kind: "optin", content: { sections } },
      { slug: "thank-you", title: "Thank-you page", kind: "thankyou", content: { sections: thankYou } },
    ],
  };
}
