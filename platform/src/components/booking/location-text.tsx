import { Fragment } from "react";

const URL_RE = /(https?:\/\/[^\s<>"')]+)/g;

/** "Zoom: https://zoom.us/j/123" with the link clickable. Plain text stays plain text. */
export function LocationText({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <span className="break-words">
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a key={i} href={p} target="_blank" rel="noreferrer noopener" className="font-medium break-all text-link underline-offset-4 hover:underline">
            {p.replace(/^https?:\/\//, "")}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </span>
  );
}
