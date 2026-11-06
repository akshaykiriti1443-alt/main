import type { CSSProperties, ReactNode } from "react";
import type { Section, SiteTheme } from "@/lib/db/types";
import { safeUrl, textToHtml } from "@/lib/html";
import { fillTemplate } from "@/lib/util";
import { lpFontClasses } from "./fonts";
import { brandPalette } from "./palette";
import "./landing.css";

export type FormProps = {
  action: string;
  pageId: string;
  eventId: string;
  error?: string;
  preview?: boolean;
};

type Props = {
  sections: Section[];
  theme: SiteTheme;
  vars: Record<string, string>;
  form: FormProps;
  businessName: string;
  poweredBy?: string;
  /** The page kind when known (public pages). A thank-you page opens with a "you're in" moment. */
  kind?: string;
  /** True on the public page itself (not the editor's live preview). */
  standalone?: boolean;
};

export function videoEmbedUrl(url: string): string | null {
  const u = safeUrl(url);
  if (!u) return null;
  const yt = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = u.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  const loom = u.match(/loom\.com\/(?:share|embed)\/([\w]+)/);
  if (loom) return `https://www.loom.com/embed/${loom[1]}`;
  return null;
}

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// Small inline icons (no icon font, no extra requests).
const Arrow = () => (
  <svg className="lp-ico lp-arrow" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M4 10h11m-4.5-4.5L15 10l-4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Check = ({ className = "lp-ico" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <path d="M5 10.5l3.2 3.2L15 6.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Lock = () => (
  <svg className="lp-ico" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <rect x="4.5" y="9" width="11" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M7 9V7a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

function LeadForm({
  form,
  title,
  body,
  buttonText,
  collectPhone,
  hero,
  offer,
}: {
  form: FormProps;
  title?: string;
  body?: string;
  buttonText: string;
  collectPhone?: boolean;
  hero?: boolean;
  offer?: string;
}) {
  return (
    <div className={cx("lp-form-card", hero && "is-hero")}>
      {offer ? (
        <div className="lp-offer">
          <span className="lp-offer-cover" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="lp-offer-text">
            <span className="lp-offer-kicker">Yours free</span>
            <span className="lp-offer-name">{offer}</span>
          </span>
        </div>
      ) : null}
      {title ? hero ? <h2 className="lp-form-title">{title}</h2> : <h3 className="lp-form-title">{title}</h3> : null}
      {body ? <p className="lp-form-body">{body}</p> : null}
      <form className={cx("lp-form", collectPhone && "has-phone")} method="post" action={form.preview ? undefined : form.action}>
        {form.error ? (
          <p className="lp-error" role="alert">
            {form.error}
          </p>
        ) : null}
        <input type="hidden" name="pageId" value={form.pageId} />
        <input type="hidden" name="eventId" value={form.eventId} />
        <label className="lp-field">
          <span className="lp-label">First name</span>
          <input className="lp-input" type="text" name="name" autoComplete="given-name" autoCapitalize="words" enterKeyHint="next" placeholder="Your first name" />
        </label>
        <label className="lp-field">
          <span className="lp-label">Email</span>
          <input
            className="lp-input"
            type="email"
            name="email"
            required
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint={collectPhone ? "next" : "send"}
            placeholder="you@email.com"
          />
        </label>
        {collectPhone ? (
          <label className="lp-field">
            <span className="lp-label">Phone</span>
            <input className="lp-input" type="tel" name="phone" autoComplete="tel" inputMode="tel" enterKeyHint="send" placeholder="+1 555 123 4567" />
          </label>
        ) : null}
        <div className="lp-hp" aria-hidden="true">
          <label>
            Website
            <input type="text" name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <button className="lp-btn lp-btn-block" type={form.preview ? "button" : "submit"}>
          <span>{buttonText || "Send it to me"}</span>
          <Arrow />
        </button>
        <p className="lp-fine">
          <Lock />
          Free. Unsubscribe anytime.
        </p>
      </form>
    </div>
  );
}

type Ctx = Props & { index: number; target: string | null; celebrate: boolean };

function SectionView({ s, ctx }: { s: Section; ctx: Ctx }): ReactNode {
  const fill = (t: string) => fillTemplate(t, ctx.vars);
  const anchor = `s-${s.id}`;
  switch (s.type) {
    case "hero": {
      const img = safeUrl(s.imageUrl);
      const bullets = s.bullets.filter((b) => b.trim());
      const offer = s.showForm && !img ? fill(ctx.vars.lead_magnet_name ?? "").trim() : "";
      const solo = !s.showForm && !img;
      // Without a form, the hero's button jumps to the page's signup form (or call to action).
      const heroButton =
        !s.showForm && s.ctaText && ctx.target ? (
          <div className="lp-hero-actions">
            <a className="lp-btn lp-btn-lg" href={`#${ctx.target}`}>
              <span>{fill(s.ctaText)}</span>
              <Arrow />
            </a>
          </div>
        ) : null;
      return (
        <header id={anchor} className={cx("lp-hero", !s.showForm && "no-form", img && "has-img", solo && "is-solo")}>
          <div className="lp-hero-frame">
            <div className="lp-deco" aria-hidden="true" />
            <div className="lp-wrap lp-hero-grid">
              <div className="lp-hero-copy">
                {s.eyebrow ? (
                  <p className="lp-eyebrow">
                    <span className="lp-dot" aria-hidden="true" />
                    {fill(s.eyebrow)}
                  </p>
                ) : null}
                <h1 className="lp-h1">{fill(s.headline)}</h1>
                {s.subheadline ? <p className="lp-sub">{fill(s.subheadline)}</p> : null}
                {heroButton && !bullets.length ? heroButton : null}
              </div>
              {s.showForm ? (
                <div className="lp-hero-form">
                  <LeadForm form={ctx.form} title={fill(s.formTitle)} buttonText={fill(s.ctaText)} hero offer={offer} />
                </div>
              ) : img ? (
                <div className="lp-hero-media">
                  <img className="lp-hero-img" src={img} alt="" fetchPriority="high" />
                </div>
              ) : null}
              {bullets.length || (img && s.showForm) ? (
                <div className="lp-hero-more">
                  {bullets.length ? (
                    <ul className="lp-bullets" role="list">
                      {bullets.map((b, i) => (
                        <li key={i}>
                          <span className="lp-tick">
                            <Check />
                          </span>
                          <span>{fill(b)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {heroButton}
                  {img && s.showForm ? <img className="lp-hero-img" src={img} alt="" /> : null}
                </div>
              ) : null}
            </div>
          </div>
        </header>
      );
    }
    case "benefits":
      return (
        <section id={anchor} className="lp-section lp-sec-benefits">
          <div className="lp-wrap">
            {s.title ? (
              <div className="lp-head">
                <h2 className="lp-title">{fill(s.title)}</h2>
              </div>
            ) : null}
            <div className="lp-grid" data-n={Math.min(s.items.length, 6)}>
              {s.items.map((it, i) => (
                <article className="lp-card lp-reveal" key={i}>
                  <span className="lp-card-icon" aria-hidden="true">
                    <Check />
                  </span>
                  <span className="lp-card-num" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3>{fill(it.title)}</h3>
                  {it.body ? <p>{fill(it.body)}</p> : null}
                </article>
              ))}
            </div>
          </div>
        </section>
      );
    case "steps":
      return (
        <section id={anchor} className="lp-section lp-sec-steps">
          <div className="lp-wrap">
            {s.title ? (
              <div className="lp-head">
                <h2 className="lp-title">{fill(s.title)}</h2>
              </div>
            ) : null}
            <ol className="lp-steps" role="list" data-n={s.items.length}>
              {s.items.map((it, i) => (
                <li className="lp-step lp-reveal" key={i}>
                  <span className="lp-step-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div className="lp-step-body">
                    <h3>{fill(it.title)}</h3>
                    {it.body ? <p>{fill(it.body)}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      );
    case "text": {
      const body = fill(s.body);
      // A drop cap only suits an opening paragraph long enough to wrap around it.
      const first = body.trim().split(/\n\s*\n/)[0] ?? "";
      const dropcap = first.length >= 160 && /^[A-Za-z]/.test(first) && !/^\s*[-•]\s/.test(first);
      return (
        <section id={anchor} className="lp-section lp-sec-text">
          <div className="lp-wrap lp-narrow lp-reveal">
            {s.title ? <h2 className="lp-title">{fill(s.title)}</h2> : null}
            <div className={cx("lp-prose", dropcap && "lp-dropcap")} dangerouslySetInnerHTML={{ __html: textToHtml(body) }} />
          </div>
        </section>
      );
    }
    case "faq":
      return (
        <section id={anchor} className="lp-section lp-sec-faq">
          <div className="lp-wrap lp-faq-grid">
            {s.title ? (
              <div className="lp-faq-head">
                <h2 className="lp-title">{fill(s.title)}</h2>
              </div>
            ) : null}
            <div className="lp-faq lp-reveal">
              {s.items.map((it, i) => (
                <details key={i}>
                  <summary>
                    <span>{fill(it.q)}</span>
                    <span className="lp-faq-icon" aria-hidden="true" />
                  </summary>
                  <div className="lp-faq-a">
                    <p>{fill(it.a)}</p>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>
      );
    case "cta": {
      const href = safeUrl(fill(s.buttonUrl));
      const lead = ctx.index === 0;
      const Heading = lead ? "h1" : "h2";
      return (
        <section id={anchor} className={cx("lp-section lp-sec-cta", lead && "is-lead")}>
          <div className="lp-wrap">
            <div className={cx("lp-cta-panel", !lead && "lp-reveal")}>
              <div className="lp-deco" aria-hidden="true" />
              {lead && ctx.celebrate ? (
                <span className="lp-badge" aria-hidden="true">
                  <Check className="lp-ico lp-badge-check" />
                </span>
              ) : null}
              <Heading className="lp-cta-title">{fill(s.headline)}</Heading>
              {s.body ? <p className="lp-cta-body">{fill(s.body)}</p> : null}
              {s.buttonText ? (
                <a className="lp-btn lp-btn-lg" href={href || "#"} {...(href ? { rel: "noopener" } : {})}>
                  <span>{fill(s.buttonText)}</span>
                  <Arrow />
                </a>
              ) : null}
            </div>
          </div>
        </section>
      );
    }
    case "form":
      return (
        <section id={anchor} className="lp-section lp-sec-form">
          <div className="lp-wrap">
            <div className="lp-form-panel lp-reveal">
              <div className="lp-deco" aria-hidden="true" />
              {s.title || s.body ? (
                <div className="lp-form-copy">
                  {s.title ? <h2 className="lp-title">{fill(s.title)}</h2> : null}
                  {s.body ? <p className="lp-form-lede">{fill(s.body)}</p> : null}
                </div>
              ) : null}
              <LeadForm form={ctx.form} buttonText={fill(s.buttonText)} collectPhone={s.collectPhone} />
            </div>
          </div>
        </section>
      );
    case "video": {
      const embed = videoEmbedUrl(s.url);
      return (
        <section id={anchor} className="lp-section lp-sec-video">
          <div className="lp-wrap lp-video-wrap">
            {s.title ? <h2 className="lp-title">{fill(s.title)}</h2> : null}
            {embed ? (
              <div className="lp-video-frame lp-reveal">
                <div className="lp-video">
                  <iframe
                    src={embed}
                    title={s.title || "Video"}
                    loading={ctx.index < 2 ? undefined : "lazy"}
                    referrerPolicy="strict-origin-when-cross-origin"
                    allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                    allowFullScreen
                  />
                </div>
              </div>
            ) : (
              <p className="lp-video-empty">Add a YouTube, Vimeo or Loom link to show your video.</p>
            )}
          </div>
        </section>
      );
    }
  }
}

export const LANDING_STYLES = ["bold", "clean", "dark", "editorial", "luxe"] as const;

export function LandingSections(props: Props) {
  const style = (LANDING_STYLES as readonly string[]).includes(props.theme.style) ? props.theme.style : "bold";
  const palette = brandPalette(props.theme.brandColor) as CSSProperties;
  // A hero without a form points its button at the page's signup form (or its call to action).
  const firstForm = props.sections.find((s) => s.type === "form") ?? props.sections.find((s) => s.type === "cta");
  const target = firstForm ? `s-${firstForm.id}` : null;
  const celebrate = props.kind
    ? props.kind === "thankyou"
    : props.sections[0]?.type === "cta" && !props.sections.some((s) => s.type === "form" || (s.type === "hero" && s.showForm));
  const name = props.businessName.trim();
  const Main = props.standalone ? "main" : "div";
  return (
    <div className={cx("lp", `style-${style}`, `lpf-${props.theme.font}`, lpFontClasses, props.standalone && "lp-standalone")} style={palette}>
      <div className="lp-page-deco" aria-hidden="true" />
      {name ? (
        <div className="lp-brandbar">
          <div className="lp-wrap">
            <span className="lp-wordmark">
              <span className="lp-mark" aria-hidden="true">
                {(Array.from(name)[0] ?? "").toUpperCase()}
              </span>
              <span>{name}</span>
            </span>
          </div>
        </div>
      ) : null}
      <Main className="lp-main">
        {props.sections.map((s, index) => (
          <SectionView key={s.id} s={s} ctx={{ ...props, index, target, celebrate }} />
        ))}
      </Main>
      <footer className="lp-footer">
        <div className="lp-wrap">
          © {new Date().getFullYear()} {props.businessName}
          {props.poweredBy ? <> · {props.poweredBy}</> : null}
        </div>
      </footer>
    </div>
  );
}
