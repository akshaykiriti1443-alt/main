"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/server/auth";
import { requireWorkspace } from "@/server/tenancy";
import { takeRateLimit } from "@/server/rateLimit";
import {
  checkSkoolInviteUrl,
  platformInviteUrl,
  postSkoolInvite,
  setPlatformInviteUrl,
  setWorkspaceInviteUrl,
  workspaceInviteUrl,
} from "@/server/skoolInvite";
import { isEmail } from "@/lib/util";
import { field, go } from "./helpers";

// Skool's Webhook plugin: paste the private URL once, then people get invited into the Skool
// group by themselves (automations for a member's group; /join purchases for the platform).

const said = (status: number) =>
  status ? `Skool answered ${status}` : "Skool didn't answer";

// ----- a member's own Skool group -----

export async function saveSkoolInviteAction(wid: string, fd: FormData) {
  await requireWorkspace(wid, "admin");
  const back = `/app/w/${wid}/skool#skool-invite`;
  const r = checkSkoolInviteUrl(field(fd, "url", 2000));
  if (!r.ok) go(back, { error: r.error });
  await setWorkspaceInviteUrl(wid, r.url);
  revalidatePath(`/app/w/${wid}/skool`);
  go(back, {
    ok: "Skool webhook connected. Send yourself a test invite to make sure it works.",
  });
}

export async function testSkoolInviteAction(wid: string, fd: FormData) {
  const { user } = await requireWorkspace(wid, "admin");
  const back = `/app/w/${wid}/skool#skool-invite`;
  const email = field(fd, "email", 200) || user.email;
  if (!isEmail(email))
    go(back, { error: "Type a real email address for the test." });
  if (
    !(await takeRateLimit(`skool-invite-test:${wid}`, [
      { seconds: 600, max: 5 },
    ]))
  )
    go(back, {
      error: "That's a lot of test invites. Try again in 10 minutes.",
    });
  const url = await workspaceInviteUrl(wid);
  if (!url) go(back, { error: "Connect your Skool webhook first." });
  const r = await postSkoolInvite(url, { email, name: user.name ?? "" });
  go(
    back,
    r.ok
      ? {
          ok: `Sent. If Skool took it, an invite lands in ${email} within a minute or two.`,
        }
      : {
          error: `${said(r.status)}. Copy the webhook again from Skool › Settings › Plugins › Webhook and paste it here.`,
        },
  );
}

export async function removeSkoolInviteAction(wid: string) {
  await requireWorkspace(wid, "admin");
  await setWorkspaceInviteUrl(wid, null);
  revalidatePath(`/app/w/${wid}/skool`);
  go(`/app/w/${wid}/skool#skool-invite`, {
    ok: "Disconnected. Nobody gets auto-invited until you connect it again.",
  });
}

// ----- the platform owner's community: /join buyers get invited -----

export async function savePlatformInviteAction(fd: FormData) {
  await requirePlatformAdmin();
  const r = checkSkoolInviteUrl(field(fd, "url", 2000));
  if (!r.ok) go("/app/admin/members#skool-invite", { error: r.error });
  await setPlatformInviteUrl(r.url);
  go("/app/admin/members#skool-invite", {
    ok: "Connected. People who buy on /join now get a Skool invite by themselves.",
  });
}

export async function testPlatformInviteAction(fd: FormData) {
  const admin = await requirePlatformAdmin();
  const email = field(fd, "email", 200) || admin.email;
  if (!isEmail(email))
    go("/app/admin/members#skool-invite", {
      error: "Type a real email address for the test.",
    });
  const url = await platformInviteUrl();
  if (!url)
    go("/app/admin/members#skool-invite", {
      error: "Connect your Skool webhook first.",
    });
  const r = await postSkoolInvite(url, { email, name: admin.name ?? "" });
  go(
    "/app/admin/members#skool-invite",
    r.ok
      ? { ok: `Sent. If Skool took it, an invite lands in ${email} shortly.` }
      : {
          error: `${said(r.status)}. Copy the webhook again from Skool and paste it here.`,
        },
  );
}

export async function removePlatformInviteAction() {
  await requirePlatformAdmin();
  await setPlatformInviteUrl(null);
  go("/app/admin/members#skool-invite", { ok: "Disconnected." });
}
