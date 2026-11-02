"use client";

import { useActionState } from "react";
import { createConnectorAction, type ConnectorState } from "@/actions/connectors";
import { Callout } from "@/components/ui";
import { CopyButton } from "@/components/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Shows the new connector URL exactly once. It works like a password.
export function NewConnector({ wid }: { wid: string }) {
  const [state, action, pending] = useActionState<ConnectorState, FormData>(createConnectorAction.bind(null, wid), {});
  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="flex flex-wrap gap-2">
        <Input name="name" placeholder="Name it, e.g. My Claude" className="w-full sm:max-w-56" aria-label="Connector name" />
        <Button type="submit" variant="outline" disabled={pending}>
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
