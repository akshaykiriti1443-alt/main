"use client";

import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { CheckIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";

type ButtonProps = ComponentProps<typeof Button>;

export function SubmitButton({
  children,
  className,
  variant,
  size,
  pendingText,
  confirm,
  disabled,
  guide,
}: {
  children: ReactNode;
  className?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  pendingText?: string;
  /** Ask for a second click, showing this text, before submitting. */
  confirm?: string;
  disabled?: boolean;
  /** A data-guide name, so the companion can point at this button. */
  guide?: string;
}) {
  const { pending } = useFormStatus();
  const [armed, setArmed] = useState(false);
  const props = { variant, size, className, "data-guide": guide };

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  if (confirm && !armed) {
    return (
      <Button type="button" {...props} disabled={disabled} onClick={() => setArmed(true)}>
        {children}
      </Button>
    );
  }
  return (
    <Button type="submit" {...props} variant={confirm ? "destructive" : props.variant} disabled={pending || disabled} aria-disabled={pending}>
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {pending ? (pendingText ?? "Working…") : confirm ? confirm : children}
    </Button>
  );
}

export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("bg-background", className)}
      onClick={() => {
        navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          })
          .catch(() => setDone(false));
      }}
    >
      {done ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
      {done ? "Copied" : label}
    </Button>
  );
}

export function AutoSubmitSelect({ name, defaultValue, options, className }: { name: string; defaultValue: string; options: { value: string; label: string }[]; className?: string }) {
  return (
    <NativeSelect name={name} defaultValue={defaultValue} className={className} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
      {options.map((o) => (
        <NativeSelectOption key={o.value} value={o.value}>
          {o.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

/** Shows a success message from the URL once, then removes it so a refresh doesn't repeat it. */
export function FlashToast({ message }: { message: string }) {
  useEffect(() => {
    toast.success(message, { id: `flash:${message}` });
    const url = new URL(window.location.href);
    if (url.searchParams.has("ok")) {
      url.searchParams.delete("ok");
      window.history.replaceState(window.history.state, "", url);
    }
  }, [message]);
  return null;
}
