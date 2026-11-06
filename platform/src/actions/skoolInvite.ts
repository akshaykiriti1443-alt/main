"use server";

import { requirePlatformAdmin } from "@/server/auth";
import {
  checkSkoolInviteUrl,
  platformInviteUrl,
  postSkoolInvite,
  setPlatformInviteUrl,
} from "@/server/skoolInvite";
import { isEmail } from "@/lib/util";
import { field, go } from "./helpers";

// Skool's Webhook plugin for the platform owner's own community: paste the private URL once,
// then people who buy on /join get invited into the Skool group by themselves.

const said = (status: number) =>
  status ? `Skool answered ${status}` : "Skool didn't answer";

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
