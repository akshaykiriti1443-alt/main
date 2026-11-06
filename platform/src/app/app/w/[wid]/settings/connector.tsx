"use client";

import { useActionState } from "react";
import { LinkIcon } from "lucide-react";
import { createConnectorAction, type ConnectorState } from "@/actions/connectors";
import { Callout } from "@/components/ui";
import { CopyButton } from "@/components/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

// Shows the new connector URL exactly once. It works like a password.
// `cta`: this is the screen's one most important button (pink), e.g. before any AI is connected.
export function NewConnector({ wid, cta }: { wid: string; cta?: boolean }) {
  const [state, action, pending] = useActionState<ConnectorState, FormData>(createConnectorAction.bind(null, wid), {});
  return (
    <div className="flex flex-col gap-3">
      <form action={action} data-guide="ai-connect" className="flex flex-col gap-2.5 sm:flex-row">
        <Input name="name" placeholder="Name it, e.g. My Claude" className="h-10 sm:max-w-60" aria-label="Connector name" />
        <Button type="submit" variant={cta ? "cta" : "default"} disabled={pending} className="h-10">
          {pending ? <Spinner data-icon="inline-start" /> : <LinkIcon data-icon="inline-start" />}
          {pending ? "Creating…" : "Create connector URL"}
        </Button>
      </form>
      {state.error ? <Callout tone="error">{state.error}</Callout> : null}
      {state.url ? (
        <Callout tone="ok" title="Copy it now. You won't see it again.">
          <div className="mt-2 flex items-center gap-2">
            <Input readOnly value={state.url} className="font-mono text-xs" aria-label="Connector URL" />
            <CopyButton text={state.url} />
          </div>
          <span className="mt-2 block text-xs">Anyone with this URL can work in this account. Keep it private, and remove it below if it leaks.</span>
        </Callout>
      ) : null}
    </div>
  );
}
