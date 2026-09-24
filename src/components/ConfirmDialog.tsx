import { useEffect, useRef } from "react";

type ConfirmDialogProps = {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function SaveDiscardDialog({
  name,
  onSave,
  onDiscard,
  onCancel,
}: {
  name: string;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="save-discard-title"
        aria-describedby="save-discard-message"
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
        className="toast-in w-full max-w-sm rounded-xl border border-line bg-panel p-4 shadow-[0_24px_64px_rgb(0_0_0/0.35)]"
      >
        <h2 id="save-discard-title" className="text-sm font-semibold text-fg">
          Save request
        </h2>
        <p id="save-discard-message" className="mt-2 text-[13px] leading-5 text-muted">
          Do you want to save “{name}” or discard the changes?
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onDiscard}
            className="h-8 cursor-pointer rounded-md px-3 text-xs text-danger hover:bg-danger-soft"
          >
            Discard
          </button>
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="h-8 cursor-pointer rounded-md border border-line px-3 text-xs text-fg hover:bg-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            className="h-8 cursor-pointer rounded-md bg-accent px-3 text-xs font-medium text-white hover:bg-accent-hover"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
        className="toast-in w-full max-w-sm rounded-xl border border-line bg-panel p-4 shadow-[0_24px_64px_rgb(0_0_0/0.35)]"
      >
        <h2 id="confirm-title" className="text-sm font-semibold text-fg">
          {title}
        </h2>
        <p id="confirm-message" className="mt-2 text-[13px] leading-5 text-muted">
          {message}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="h-8 cursor-pointer rounded-md border border-line px-3 text-xs text-fg hover:bg-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-8 cursor-pointer rounded-md border border-danger/40 bg-danger-soft px-3 text-xs font-medium text-danger hover:border-danger"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
