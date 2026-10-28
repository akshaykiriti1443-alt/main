import type { CSSProperties, ReactNode } from "react";
import type { Section, SiteTheme } from "@/lib/db/types";
import { safeUrl, textToHtml } from "@/lib/html";
import { fillTemplate } from "@/lib/util";
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

function LeadForm({ form, title, body, buttonText, collectPhone, hero }: { form: FormProps; title: string; body?: string; buttonText: string; collectPhone?: boolean; hero?: boolean }) {
  return (
    <div className="lp-form-card">
      {title ? hero ? <h2>{title}</h2> : <h3>{title}</h3> : null}
      {body ? <p className="lp-form-body">{body}</p> : null}
      <form className="lp-form" method="post" action={form.preview ? undefined : form.action}>
        {form.error ? <p className="lp-error" role="alert">{form.error}</p> : null}
        <input type="hidden" name="pageId" value={form.pageId} />
        <input type="hidden" name="eventId" value={form.eventId} />
        <label>
          First name
          <input type="text" name="name" autoComplete="given-name" placeholder="Your first name" />
        </label>
        <label>
          Email
          <input type="email" name="email" required autoComplete="email" placeholder="you@email.com" />
        </label>
        {collectPhone ? (
          <label>
            Phone
            <input type="tel" name="phone" autoComplete="tel" placeholder="+1 555 123 4567" />
          </label>
        ) : null}
        <div className="lp-hp" aria-hidden="true">
          <label>
            Website
            <input type="text" name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <button className="lp-btn" type={form.preview ? "button" : "submit"}>
          {buttonText || "Send it to me"}
        </button>
        <p className="lp-fine">Free. Unsubscribe anytime.</p>
      </form>
    </div>
  );
}

function SectionView({ s, props }: { s: Section; props: Props }): ReactNode {
  const fill = (t: string) => fillTemplate(t, props.vars);
  switch (s.type) {
    case "hero": {
      const img = safeUrl(s.imageUrl);
      return (
        <header className={`lp-hero${s.showForm ? "" : " no-form"}`}>
          <div className="lp-wrap lp-hero-grid">
            <div>
              {s.eyebrow ? <span className="lp-eyebrow">{fill(s.eyebrow)}</span> : null}
              <h1>{fill(s.headline)}</h1>
              {s.subheadline ? <p className="lp-sub">{fill(s.subheadline)}</p> : null}
              {s.bullets.length ? (
                <ul className="lp-bullets">
                  {s.bullets.filter(Boolean).map((b, i) => (
                    <li key={i}>{fill(b)}</li>
                  ))}
                </ul>
              ) : null}
              {img ? <img className="lp-hero-img" src={img} alt="" /> : null}
            </div>
            {s.showForm ? <LeadForm form={props.form} title={fill(s.formTitle)} buttonText={fill(s.ctaText)} hero /> : null}
          </div>
        </header>
      );
    }
    case "benefits":
    case "steps":
      return (
        <section className="lp-section">
          <div className="lp-wrap">
            {s.title ? <h2 className="lp-title">{fill(s.title)}</h2> : null}
            <div className={`lp-cards${s.type === "steps" ? " lp-steps" : ""}`}>
              {s.items.map((it, i) => (
                <div className="lp-card" key={i}>
                  <h3>{fill(it.title)}</h3>
                  <p>{fill(it.body)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      );
    case "text":
      return (
        <section className="lp-section">
          <div className="lp-wrap lp-text">
            {s.title ? <h2 className="lp-title">{fill(s.title)}</h2> : null}
            <div className="lp-body" dangerouslySetInnerHTML={{ __html: textToHtml(fill(s.body)) }} />
          </div>
        </section>
      );
    case "faq":
      return (
        <section className="lp-section">
          <div className="lp-wrap">
            {s.title ? <h2 className="lp-title">{fill(s.title)}</h2> : null}
            <div className="lp-faq">
              {s.items.map((it, i) => (
                <details key={i}>
                  <summary>{fill(it.q)}</summary>
                  <p>{fill(it.a)}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      );
    case "cta": {
      const href = safeUrl(fill(s.buttonUrl));
      return (
        <section className="lp-section">
          <div className="lp-wrap lp-cta">
            <h2>{fill(s.headline)}</h2>
            {s.body ? <p>{fill(s.body)}</p> : null}
            {s.buttonText ? (
              <a className="lp-btn" href={href || "#"} {...(href ? { rel: "noopener" } : {})}>
                {fill(s.buttonText)}
              </a>
            ) : null}
          </div>
        </section>
      );
    }
    case "form":
      return (
        <section className="lp-section">
          <div className="lp-wrap lp-form-section">
            <LeadForm form={props.form} title={fill(s.title)} body={fill(s.body)} buttonText={fill(s.buttonText)} collectPhone={s.collectPhone} />
          </div>
        </section>
      );
    case "video": {
      const embed = videoEmbedUrl(s.url);
      return (
        <section className="lp-section">
          <div className="lp-wrap" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
            {s.title ? <h2 className="lp-title" style={{ marginBottom: 0 }}>{fill(s.title)}</h2> : null}
            {embed ? (
              <div className="lp-video">
                <iframe src={embed} title={s.title || "Video"} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
              </div>
            ) : (
              <p style={{ color: "var(--lp-muted)" }}>Add a YouTube, Vimeo or Loom link to show your video.</p>
            )}
          </div>
        </section>
      );
    }
  }
}

export function LandingSections(props: Props) {
  const style = { "--lp-brand": props.theme.brandColor } as CSSProperties;
  return (
    <div className={`lp style-${props.theme.style} font-${props.theme.font}`} style={style}>
      {props.sections.map((s) => (
        <SectionView key={s.id} s={s} props={props} />
      ))}
      <footer className="lp-footer">
        © {new Date().getFullYear()} {props.businessName}
        {props.poweredBy ? <> · {props.poweredBy}</> : null}
      </footer>
    </div>
  );
}
