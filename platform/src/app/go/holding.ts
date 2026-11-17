import { escapeHtml } from "@/lib/html";

/**
 * The page a visitor sees when a Skool link has nowhere to send them yet (no group link saved, or
 * no such account). A person who clicked an ad should get a calm "not ready yet", never an error
 * or somebody else's login screen. Plain HTML with its own few styles: no app chrome, no scripts.
 */
export function holdingPage(name?: string | null): string {
  const who = (name ?? "").trim();
  const title = who ? `${escapeHtml(who)} isn't open just yet` : "This link isn't ready yet";
  const body = who
    ? "The group behind this link is still being set up. Please come back a little later."
    : "There's nothing behind this link at the moment. If someone sent it to you, ask them for a new one.";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title}</title>
<style>
  html, body { height: 100%; margin: 0; }
  body {
    display: grid; place-items: center; padding: 24px; box-sizing: border-box;
    background: radial-gradient(60% 50% at 50% 0%, rgb(16 20 32 / 0.05), transparent 70%), #f7f7f8;
    color: #12141c; text-align: center;
    font: 400 17px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  }
  main { max-width: 30em; }
  h1 { margin: 0 0 8px; font-size: 28px; line-height: 1.2; font-weight: 650; letter-spacing: -0.02em; text-wrap: balance; }
  p { margin: 0; color: #5a5f6e; text-wrap: pretty; }
  @media (prefers-color-scheme: dark) {
    body { background: radial-gradient(60% 50% at 50% 0%, rgb(255 255 255 / 0.06), transparent 70%), #0f1117; color: #f3f4f7; }
    p { color: #a3a8b8; }
  }
</style>
</head>
<body>
<main>
<h1>${title}</h1>
<p>${body}</p>
</main>
</body>
</html>`;
}

export function holdingResponse(name: string | null, status: 200 | 404): Response {
  return new Response(holdingPage(name), {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" },
  });
}
