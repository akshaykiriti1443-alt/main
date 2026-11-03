import Link from "next/link";
import {
  ArrowRightIcon,
  CircleCheckIcon,
  KeyRoundIcon,
  SendIcon,
  UserPlusIcon,
} from "lucide-react";
import { MoreOptions, Panel } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/**
 * Skool's Webhook plugin, connected once. For a member's workspace it powers the
 * "Invite to my Skool group" automation step; for the platform it invites /join buyers.
 */
export function SkoolInviteCard({
  connected,
  save,
  test,
  remove,
  defaultEmail,
  forPlatform = false,
  recipeHref,
}: {
  connected: string | null;
  save: (fd: FormData) => Promise<void>;
  test: (fd: FormData) => Promise<void>;
  remove: () => Promise<void>;
  defaultEmail: string;
  forPlatform?: boolean;
  recipeHref?: string;
}) {
  const what = forPlatform
    ? "Anyone who buys access on your /join page gets a Skool invite by email, straight away. Pay here, get in there."
    : "New leads (or anyone an automation picks) get a Skool invite by email, straight away. No copying emails into Skool by hand.";
  return (
    <Panel
      id="skool-invite"
      icon={connected ? CircleCheckIcon : UserPlusIcon}
      tone={connected ? "success" : "primary"}
      title={
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          Auto-invite to your Skool group{" "}
          <Badge variant="secondary">Skool Pro</Badge>
        </span>
      }
      sub={what}
      className="scroll-mt-24"
    >
      {connected ? (
        <>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <b>Connected</b>
            <code className="rounded-md bg-muted px-2 py-0.5 text-xs">
              {connected}
            </code>
          </p>
          <form action={test} className="flex flex-wrap items-end gap-3">
            <Field className="min-w-56 flex-1">
              <FieldLabel htmlFor="invite-test">
                Send a test invite to
              </FieldLabel>
              <Input
                id="invite-test"
                name="email"
                type="email"
                defaultValue={defaultEmail}
              />
            </Field>
            <SubmitButton variant="outline" pendingText="Sending…">
              <SendIcon data-icon="inline-start" /> Send test invite
            </SubmitButton>
          </form>
          {recipeHref ? (
            <Button asChild className="self-start">
              <Link href={recipeHref}>
                Invite every new lead automatically{" "}
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
          ) : null}
          {!forPlatform ? (
            <p className="text-xs text-muted-foreground">
              Or add an <b>Invite to my Skool group</b> step to any automation.
              Each person is only invited once. On a paid group, only invite
              people who&apos;ve already paid you.
            </p>
          ) : null}
          <MoreOptions title="Change or disconnect">
            <form action={save} className="flex flex-col gap-3">
              <Field>
                <FieldLabel htmlFor="invite-url-new">
                  New webhook URL
                </FieldLabel>
                <Input
                  id="invite-url-new"
                  name="url"
                  type="url"
                  required
                  placeholder="https://…skool.com/…"
                  autoComplete="off"
                />
              </Field>
              <SubmitButton
                variant="outline"
                className="self-start"
                pendingText="Saving…"
              >
                Replace it
              </SubmitButton>
            </form>
            <form action={remove}>
              <SubmitButton
                variant="ghost"
                className="text-destructive"
                confirm="Yes, disconnect"
                pendingText="Disconnecting…"
              >
                Disconnect
              </SubmitButton>
            </form>
          </MoreOptions>
        </>
      ) : (
        <>
          <ol className="grid gap-2 text-sm">
            <li>
              <b>1.</b> In Skool, open your group&apos;s{" "}
              <b>Settings › Plugins</b>.
            </li>
            <li>
              <b>2.</b> Switch on <b>Webhook</b> and click <b>Edit</b>. Copy the
              URL it shows you.
            </li>
            <li>
              <b>3.</b> Paste it here and press <b>Connect</b>. Then send
              yourself a test invite.
            </li>
          </ol>
          <form action={save} className="flex flex-col gap-3">
            <Field>
              <FieldLabel htmlFor="invite-url">
                Your Skool webhook URL
              </FieldLabel>
              <Input
                id="invite-url"
                name="url"
                type="url"
                required
                placeholder="https://…skool.com/…"
                autoComplete="off"
              />
              <FieldDescription className="flex items-start gap-1.5">
                <KeyRoundIcon
                  className="mt-0.5 size-3.5 shrink-0"
                  aria-hidden
                />
                Keep it private: anyone with this link can invite people into
                your group. We store it encrypted and only ever send it email
                addresses.
              </FieldDescription>
            </Field>
            <SubmitButton className="self-start" pendingText="Connecting…">
              Connect
            </SubmitButton>
          </form>
          <p className="text-xs text-muted-foreground">
            No Webhook in your Plugins? It comes with Skool Pro. A Zapier hook
            wired to Skool&apos;s &ldquo;Invite Member&rdquo; works here too.
          </p>
        </>
      )}
    </Panel>
  );
}
