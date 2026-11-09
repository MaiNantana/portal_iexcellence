"use client";

import { useRef } from "react";

/** A submit button inside a form that asks first; the form is only submitted after "ยืนยัน". */
export function ConfirmButton({
  className,
  message,
  confirmLabel = "ยืนยัน",
  style,
  title,
  children,
}: {
  className: string;
  message: string;
  confirmLabel?: string;
  style?: React.CSSProperties;
  title?: string;
  children: React.ReactNode;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button ref={trigger} type="button" className={className} style={style} title={title} onClick={() => dialog.current?.showModal()}>
        {children}
      </button>
      <dialog ref={dialog} className="confirm">
        <p>{message}</p>
        <div className="confirm-actions">
          <button type="button" className="btn" onClick={() => dialog.current?.close()}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn danger-solid"
            onClick={() => {
              dialog.current?.close();
              trigger.current?.form?.requestSubmit();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}
