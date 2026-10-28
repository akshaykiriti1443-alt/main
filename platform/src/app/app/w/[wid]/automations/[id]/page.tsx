import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/server/tenancy";
import { getAutomation, recentRuns } from "@/server/automations";
import { listSequences } from "@/server/email/sequences";
import { hasFeature } from "@/server/plans";
import { deleteAutomationAction, saveAutomationAction } from "@/actions/marketing";
import type { AutomationAction, AutomationTrigger } from "@/lib/db/types";
import { relativeTime } from "@/lib/util";
import { Locked, PageHead } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { AutomationBuilder } from "@/components/AutomationBuilder";

const PRESETS: Record<string, { name: string; trigger: AutomationTrigger; actions: AutomationAction[] }> = {
  hot: {
    name: "Hot lead alert",
    trigger: { type: "message_received", value: "" },
    actions: [
      { type: "ai_score" },
      { type: "only_if_temperature", temperature: "hot" },
      { type: "add_tag", tag: "hot-lead" },
      { type: "ai_draft_reply" },
      { type: "notify_owner", message: "A hot lead just messaged you. Your AI reply draft is ready." },
    ],
  },
  "welcome-dm": {
    name: "Instant DM reply",
    trigger: { type: "message_received", value: "instagram" },
    actions: [{ type: "send_message", body: "Hey {{first_name}}! Thanks for the message. Here's my free guide to get you started: [paste your funnel link]. What's your #1 goal right now?" }],
  },
  nurture: {
    name: "Warm-up new leads",
    trigger: { type: "lead_created", value: "" },
    actions: [{ type: "add_tag", tag: "new-lead" }, { type: "wait", minutes: 1440 }, { type: "set_stage", stage: "engaged" }],
  },
  member: {
    name: "New member welcome",
    trigger: { type: "stage_changed", value: "member" },
    actions: [
      { type: "add_tag", tag: "member" },
      { type: "send_email", subject: "Welcome in, {{first_name}} 🎉", body: "Hey {{first_name}},\n\nWelcome to {{business_name}}! Start with the Start Here lesson today.\n\nSee you inside." },
    ],
  },
};

export default async function AutomationPage({ params, searchParams }: { params: Promise<{ wid: string; id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { wid, id } = await params;
  const sp = await searchParams;
  const { workspace } = await requireWorkspace(wid);
  if (!hasFeature(workspace.plan, "automations")) return <Locked feature="Automations" wid={wid} />;
  const isNew = id === "new";
  const existing = isNew ? null : await getAutomation(wid, id);
  if (!isNew && !existing) notFound();
  const preset = isNew ? (PRESETS[sp.preset ?? ""] ?? { name: "New automation", trigger: { type: "lead_created", value: "" } as AutomationTrigger, actions: [] }) : null;
  const sequences = (await listSequences(wid)).map((s) => ({ id: s.id, name: s.name }));
  const runs = existing ? await recentRuns(wid, existing.id) : [];
  return (
    <>
      <PageHead eyebrow={<Link href={`/app/w/${wid}/automations`} className="muted">← Automations</Link>} title={existing?.name ?? preset!.name} />
      <AutomationBuilder
        workspaceId={wid}
        id={existing?.id ?? null}
        initial={existing ? { name: existing.name, trigger: existing.trigger, actions: existing.actions, active: existing.active } : { ...preset!, active: true }}
        sequences={sequences}
        save={saveAutomationAction.bind(null, wid)}
      />
      {existing ? (
        <>
          <div className="card">
            <div className="card-head"><h2>Recent runs</h2></div>
            {runs.length === 0 ? <p className="muted small">No runs yet.</p> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Started</th><th>Status</th><th>Log</th></tr></thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr key={r.id}>
                        <td className="small muted">{relativeTime(r.createdAt)}</td>
                        <td><span className={`badge ${r.status === "completed" ? "badge-good" : r.status === "failed" ? "badge-bad" : "badge-warm"}`}>{r.status}</span></td>
                        <td className="tiny">{r.log.map((l) => l.message).join(" → ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <form action={deleteAutomationAction.bind(null, wid, existing.id)} className="card row-between">
            <span className="small muted">Delete this automation. Running steps stop.</span>
            <SubmitButton className="btn btn-danger" confirm="Yes, delete">Delete</SubmitButton>
          </form>
        </>
      ) : null}
    </>
  );
}
