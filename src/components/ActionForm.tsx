"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/app/actions";

/**
 * Form bound to a server action that returns { error } or { ok }; resets itself on success.
 * `org` adds the tenant slug as the hidden "org" field that tenant actions read.
 * Submits through onSubmit rather than <form action>, because React clears a form after every
 * <form action> run and an error would throw away what the person typed.
 */
export function ActionForm({
  action,
  submitLabel,
  org,
  resetOnSuccess = true,
  cancelHref,
  children,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  submitLabel: string;
  org?: string;
  resetOnSuccess?: boolean;
  /** Shows a "ยกเลิก" link beside the submit button. */
  cancelHref?: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form
      ref={ref}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      {org && <input type="hidden" name="org" value={org} />}
      {children}
      {state?.error && <div className="notice error">{state.error}</div>}
      {state?.ok && <div className="notice ok">{state.ok}</div>}
      <div className="form-actions">
        {cancelHref && (
          <Link href={cancelHref} className="btn">
            ยกเลิก
          </Link>
        )}
        <button className="btn primary" disabled={pending}>
          {pending ? "กำลังบันทึก..." : submitLabel}
        </button>
      </div>
    </form>
  );
}
