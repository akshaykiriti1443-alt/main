# UI guide

The app UI is built with [shadcn/ui](https://ui.shadcn.com) on Tailwind CSS v4.
shadcn components are copied into the repo, so you own and can edit them.

## Where things live

| Path | What it is |
|---|---|
| `src/components/ui/*.tsx` | shadcn components (Button, Card, Input, Table, Sidebar…). Add more with `npx shadcn@latest add <name>`. |
| `src/components/ui.tsx` | Product building blocks: `PageHead`, `Panel`, `Stat`, `Empty`, `Callout`, `Flash`, `TempBadge`, `Locked`. |
| `src/components/client.tsx` | `SubmitButton` (spinner + optional confirm), `CopyButton`, `AutoSubmitSelect`. |
| `src/components/shell.tsx` | Sidebar, header, workspace switcher and the Ctrl/⌘ K command menu. |
| `src/components/theme.tsx` | Light / dark / system theme. |
| `src/app/globals.css` | Design tokens (colors, radius) for light and dark, and base styles for plain form controls. |
| `src/components/landing/` | Public funnel pages. These have their own `.lp` styles on purpose, so app changes never alter a customer's page. |

## Page recipe

Every app page follows the same shape, so people always know where to look:

```tsx
<PageHead title="Leads" sub="One line on what this page is for." actions={<Button>Primary action</Button>} />
<Flash searchParams={sp} />            {/* ?ok= becomes a toast; ?error= stays inline */}
<Panel title="Section" sub="Optional hint" action={<Button variant="ghost" size="sm">…</Button>}>
  …content…
</Panel>
```

- **One primary button per screen.** Everything else is `variant="outline"`, `"ghost"` or `"destructive"`.
- **Empty states teach.** Use `<Empty icon={…} title="No X yet" body="What to do next" action={<Button>Do it</Button>} />`.
- **Forms** use `Field` + `FieldLabel` + `Input` / `Textarea` / `NativeSelect`, and `FieldDescription` for help text.
  Native selects post with plain `<form action={serverAction}>`, so server actions keep working without client state.
- **Destructive actions** use `<SubmitButton variant="destructive" confirm="Click again to delete">`.
- **Tables** use `Table` from `ui/table` inside a `Panel`. Put the row's main link on the name.
- **Status** uses `Badge`; `TempBadge` for hot / warm / cold.
- **Messages:** success → toast (automatic via `Flash`). Anything the user must act on → `<Callout tone="warn|error|info">`.

## Colors

Use tokens, never hex values: `bg-background`, `bg-card`, `bg-muted`, `text-muted-foreground`, `bg-primary`,
`text-destructive`, `bg-success-soft text-success`, `bg-warning-soft text-warning`, `bg-hot-soft text-hot`.
They switch automatically in dark mode. To rebrand, change `--primary` (and `--ring`, `--sidebar-primary`)
in `globals.css`. Agencies' own brand color still colors their logo mark.

## Plain HTML controls

`globals.css` styles bare `<input>`, `<select>` and `<textarea>` to match the shadcn `Input`, so a native
checkbox, radio or color picker inside a server-action form looks right without a wrapper. Prefer native
checkboxes and radios in forms that post to server actions: they submit exactly what the action expects.
