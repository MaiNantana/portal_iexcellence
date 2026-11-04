"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/app/actions";

/**
 * Form bound to a server action that returns { error } or { ok }; resets itself on success.
 * `org` adds the tenant slug as the hidden "org" field that tenant actions read.
 */
export function ActionForm({
  action,
  submitLabel,
  org,
  resetOnSuccess = true,
  children,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  submitLabel: string;
  org?: string;
  resetOnSuccess?: boolean;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction}>
      {org && <input type="hidden" name="org" value={org} />}
      {children}
      {state?.error && <div className="notice error">{state.error}</div>}
      {state?.ok && <div className="notice ok">{state.ok}</div>}
      <div className="form-actions">
        <Submit label={submitLabel} />
      </div>
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn primary" disabled={pending}>
      {pending ? "กำลังบันทึก..." : label}
    </button>
  );
}
