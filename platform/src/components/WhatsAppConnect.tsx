"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    FB?: {
      init: (o: Record<string, unknown>) => void;
      login: (cb: (r: { authResponse?: { code?: string } }) => void, o: Record<string, unknown>) => void;
    };
    fbAsyncInit?: () => void;
  }
}

// Meta Embedded Signup: the customer picks or creates a WhatsApp Business
// account and number in Meta's popup; we finish setup on the server.
export function WhatsAppConnect({ appId, configId, graphVersion, workspaceId }: { appId: string; configId: string; graphVersion: string; workspaceId: string }) {
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const session = useRef<{ phoneNumberId?: string; wabaId?: string; code?: string }>({});

  useEffect(() => {
    if (!document.getElementById("facebook-jssdk")) {
      window.fbAsyncInit = () => window.FB?.init({ appId, autoLogAppEvents: true, xfbml: false, version: graphVersion });
      const s = document.createElement("script");
      s.id = "facebook-jssdk";
      s.async = true;
      s.crossOrigin = "anonymous";
      s.src = "https://connect.facebook.net/en_US/sdk.js";
      document.body.appendChild(s);
    }
    const onMessage = (event: MessageEvent) => {
      if (!/(^|\.)facebook\.com$/.test(new URL(event.origin).hostname)) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type === "WA_EMBEDDED_SIGNUP") {
          if (data.event === "FINISH" || data.event === "FINISH_ONLY_WABA") {
            session.current.phoneNumberId = data.data?.phone_number_id;
            session.current.wabaId = data.data?.waba_id;
            void maybeFinish();
          } else if (data.event === "CANCEL") {
            setStatus("Setup was cancelled.");
            setBusy(false);
          }
        }
      } catch {
        // Not a signup message.
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId, graphVersion]);

  async function maybeFinish() {
    const { code, phoneNumberId, wabaId } = session.current;
    if (!code || !phoneNumberId || !wabaId) return;
    setStatus("Finishing setup…");
    const res = await fetch("/api/integrations/whatsapp/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, code, phoneNumberId, wabaId }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; name?: string; error?: string };
    setBusy(false);
    if (data.ok) {
      setStatus(`Connected ${data.name}. Reloading…`);
      window.location.reload();
    } else setStatus(data.error ?? "Setup failed. Try again.");
  }

  function start() {
    if (!window.FB) {
      setStatus("Facebook is still loading. Try again in a second.");
      return;
    }
    setBusy(true);
    setStatus("Follow the steps in the popup…");
    window.FB.login(
      (response) => {
        if (response.authResponse?.code) {
          session.current.code = response.authResponse.code;
          void maybeFinish();
        } else {
          setBusy(false);
          setStatus("The popup closed before setup finished.");
        }
      },
      { config_id: configId, response_type: "code", override_default_response_type: true, extras: { setup: {}, featureType: "", sessionInfoVersion: "3" } },
    );
  }

  return (
    <div className="row">
      <button type="button" className="btn" onClick={start} disabled={busy}>
        {busy ? "Connecting…" : "Connect WhatsApp"}
      </button>
      {status ? <span className="small muted">{status}</span> : null}
    </div>
  );
}
