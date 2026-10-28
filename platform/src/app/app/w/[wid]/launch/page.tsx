import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { aiGenerations, sites } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { requireWorkspace } from "@/server/tenancy";
import { getLaunchKit } from "@/server/ai/launchKit";
import { siteBaseUrl } from "@/server/sites";
import { launchKitAction } from "@/actions/sites";
import { Flash, PageHead } from "@/components/ui";
import { CopyButton, SubmitButton } from "@/components/client";

export const maxDuration = 300;

function Copy({ text }: { text: string }) {
  return (
    <div className="copy-block">
      <CopyButton text={text} />
      {text}
    </div>
  );
}

export default async function LaunchPage({ params, searchParams }: { params: Promise<{ wid: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid } = await params;
  const sp = await searchParams;
  const { workspace, user } = await requireWorkspace(wid);
  const db = await getDb();
  const kitId =
    sp.kit ??
    (sp.new
      ? undefined
      : (
          await db
            .select({ id: aiGenerations.id })
            .from(aiGenerations)
            .where(and(eq(aiGenerations.workspaceId, wid), eq(aiGenerations.kind, "launch_kit")))
            .orderBy(desc(aiGenerations.createdAt))
            .limit(1)
        )[0]?.id);
  const result = kitId ? await getLaunchKit(wid, kitId) : null;

  if (!result) {
    const s = workspace.settings;
    return (
      <>
        <PageHead
          eyebrow="Step 1 of your sprint"
          title="AI launch kit"
          sub="Answer these questions. In about a minute you get a live landing page, a free guide, 3 follow-up emails, ad copy, 10 hooks, a Skool About page and a 7-day ad plan."
        />
        <Flash searchParams={sp} />
        {!env.aiEnabled ? (
          <div className="alert alert-info">AI isn't switched on for this server yet, so you'll get a smart template. The platform owner adds an Anthropic API key to turn on AI copy.</div>
        ) : null}
        <form action={launchKitAction.bind(null, wid)} className="card stack-lg">
          <div className="form-grid">
            <div className="field">
              <label htmlFor="businessName">Community name</label>
              <input id="businessName" name="businessName" required minLength={2} defaultValue={s.businessName ?? workspace.name} />
            </div>
            <div className="field">
              <label htmlFor="ownerName">Your name</label>
              <input id="ownerName" name="ownerName" required defaultValue={user.name} />
            </div>
            <div className="field full">
              <label htmlFor="niche">What do you help with?</label>
              <input id="niche" name="niche" required minLength={3} placeholder="Fat loss for busy dads" defaultValue={s.niche ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="audience">Who is it for?</label>
              <input id="audience" name="audience" required minLength={3} placeholder="Dads 30-50 with desk jobs" defaultValue={s.audience ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="outcome">What result do they want?</label>
              <input id="outcome" name="outcome" required minLength={3} placeholder="Lose 10 lbs in 8 weeks without a gym" />
            </div>
            <div className="field">
              <label htmlFor="leadMagnetIdea">Free lead magnet idea (optional)</label>
              <input id="leadMagnetIdea" name="leadMagnetIdea" placeholder="Leave blank and AI picks one" />
            </div>
            <div className="field">
              <label htmlFor="offer">Your paid offer (optional)</label>
              <input id="offer" name="offer" placeholder="$9/month Skool group with a 7-day free trial" defaultValue={s.offer ?? ""} />
            </div>
            <div className="field">
              <label htmlFor="skoolUrl">Your Skool group link</label>
              <input id="skoolUrl" name="skoolUrl" type="url" placeholder="https://www.skool.com/your-group/about" defaultValue={s.skoolUrl ?? ""} />
            </div>
            <div className="row" style={{ gap: 16, alignItems: "flex-end" }}>
              <div className="field">
                <label htmlFor="tone">Tone</label>
                <select id="tone" name="tone" defaultValue="friendly">
                  <option value="friendly">Friendly</option>
                  <option value="bold">Bold</option>
                  <option value="calm">Calm</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="brandColor">Brand color</label>
                <input id="brandColor" name="brandColor" type="color" defaultValue="#2A44EE" />
              </div>
            </div>
          </div>
          <div className="row">
            <SubmitButton pendingText="Writing your kit… (up to a minute)">Build my launch kit</SubmitButton>
            <span className="small muted">Uses 1 AI generation. Your plan includes some each month.</span>
          </div>
        </form>
      </>
    );
  }

  const { kit } = result;
  const [site] = await db.select().from(sites).where(eq(sites.workspaceId, wid)).orderBy(desc(sites.createdAt)).limit(1);
  const live = site ? siteBaseUrl(site) : null;
  const adsText = kit.ads.map((a, i) => `AD ${i + 1}\nPrimary text:\n${a.primaryText}\n\nHeadline: ${a.headline}\nDescription: ${a.description}`).join("\n\n---\n\n");
  const emailsText = kit.emails.map((e, i) => `EMAIL ${i + 1}: ${e.subject}\n\n${e.body}`).join("\n\n---\n\n");

  return (
    <>
      <PageHead
        eyebrow={`Generated ${result.createdAt.toDateString()} · ${result.model === "template" ? "template" : "AI"}`}
        title="Your launch kit"
        sub="Your funnel is built from this kit. Copy anything below into Meta Ads Manager, Instagram or Skool."
        actions={
          <>
            {site ? (
              <Link className="btn btn-primary" href={`/app/w/${wid}/sites/${site.id}`}>
                Review & publish funnel
              </Link>
            ) : null}
            <Link className="btn" href={`/app/w/${wid}/launch?new=1`}>
              Make another kit
            </Link>
          </>
        }
      />
      <Flash searchParams={sp} />

      <div className="grid-2">
        <div className="card stack">
          <h2>Your free lead magnet</h2>
          <p>
            <strong>{kit.leadMagnetName}</strong> <span className="badge">{kit.leadMagnetType}</span>
          </p>
          <p className="muted small">It's hosted for you on your funnel{live ? <> at <a href={`${live}/guide`} target="_blank" rel="noreferrer">{live}/guide</a></> : null}. Your first email sends the link.</p>
          <Copy text={kit.leadMagnetContent} />
        </div>
        <div className="card stack">
          <h2>Your 7-day ad plan</h2>
          <p className="muted">
            Start at <strong>${kit.adPlan.dailyBudgetUsd}/day</strong>. Audience: {kit.adPlan.audience}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Objective</th>
                  <th>$/day</th>
                </tr>
              </thead>
              <tbody>
                {kit.adPlan.campaigns.map((c) => (
                  <tr key={c.name}>
                    <td>
                      <strong>{c.name}</strong>
                      <div className="tiny muted">{c.why}</div>
                    </td>
                    <td className="small">{c.objective}</td>
                    <td className="num">${c.budgetUsd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ol className="small" style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
            {kit.adPlan.firstWeek.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ol>
        </div>
      </div>

      <div className="card stack">
        <div className="card-head">
          <h2>Meta ad copy</h2>
          <CopyButton text={adsText} label="Copy all ads" />
        </div>
        <div className="grid-3">
          {kit.ads.map((a, i) => (
            <div key={i} className="stack" style={{ gap: 8 }}>
              <span className="eyebrow">Ad {i + 1}</span>
              <Copy text={a.primaryText} />
              <p className="small">
                <strong>Headline:</strong> {a.headline}
              </p>
              <p className="small muted">
                <strong>Description:</strong> {a.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <div className="card stack">
          <div className="card-head">
            <h2>10 hooks for Reels and ads</h2>
            <CopyButton text={kit.hooks.map((h, i) => `${i + 1}. ${h}`).join("\n")} label="Copy hooks" />
          </div>
          <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
            {kit.hooks.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ol>
        </div>
        <div className="card stack">
          <div className="card-head">
            <h2>Skool About page</h2>
          </div>
          <Copy text={kit.skoolAboutPage} />
        </div>
      </div>

      <div className="card stack">
        <div className="card-head">
          <h2>Your 3 follow-up emails</h2>
          <span className="row">
            <CopyButton text={emailsText} label="Copy emails" />
            <Link className="btn btn-sm" href={`/app/w/${wid}/emails`}>
              Edit in Emails
            </Link>
          </span>
        </div>
        <p className="muted small">These already run for every new lead: day 0, day 1 and day 3.</p>
        <div className="grid-3">
          {kit.emails.map((e, i) => (
            <div key={i} className="stack" style={{ gap: 6 }}>
              <span className="eyebrow">Email {i + 1}</span>
              <strong>{e.subject}</strong>
              <Copy text={e.body} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
