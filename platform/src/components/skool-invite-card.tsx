import {
  CircleCheckIcon,
  KeyRoundIcon,
  SendIcon,
  UserPlusIcon,
} from "lucide-react";
import { MoreOptions, Panel, StepDot } from "@/components/ui";
import { SubmitButton } from "@/components/client";
import { Badge } from "@/components/ui/badge";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/**
 * Skool's Webhook plugin, connected once by the platform owner (Admin › Members):
 * people who buy access on /join get an invite to the owner's own Skool group.
 */
export function SkoolInviteCard({
  connected,
  save,
  test,
  remove,
  defaultEmail,
}: {
  connected: string | null;
  save: (fd: FormData) => Promise<void>;
  test: (fd: FormData) => Promise<void>;
  remove: () => Promise<void>;
  defaultEmail: string;
}) {
  return (
    <Panel
      id="skool-invite"
      icon={connected ? CircleCheckIcon : UserPlusIcon}
      tone={connected ? "success" : "primary"}
      title={
        <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          Auto-invite to your Skool group{" "}
          <Badge variant="gold">Skool Pro</Badge>
        </span>
      }
      sub="Anyone who buys access on your /join page gets a Skool invite by email, straight away. Pay here, get in there."
      className="scroll-mt-24"
    >
      {connected ? (
        <>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="success">Connected</Badge>
            <code className="rounded-full bg-muted px-2.5 py-0.5 text-xs">
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
          <ol className="flex flex-col gap-3 text-sm leading-relaxed">
            <li className="flex items-start gap-3">
              <StepDot n={1} active className="size-6 text-[11.5px]" />
              <span className="pt-0.5">
                In Skool, open your group&apos;s{" "}
                <b className="font-semibold">Settings › Plugins</b>.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <StepDot n={2} className="size-6 text-[11.5px]" />
              <span className="pt-0.5">
                Switch on <b className="font-semibold">Webhook</b> and click{" "}
                <b className="font-semibold">Edit</b>. Copy the URL it shows
                you.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <StepDot n={3} className="size-6 text-[11.5px]" />
              <span className="pt-0.5">
                Paste it here and press <b className="font-semibold">Connect</b>
                . Then send yourself a test invite.
              </span>
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
