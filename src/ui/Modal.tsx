import React, { useEffect } from "react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;

  /** Optional: layout sizing */
  maxWidthClassName?: string; // e.g. "max-w-lg"
};

export default function Modal({
  open,
  onClose,
  title,
  children,
  maxWidthClassName = "max-w-lg",
}: ModalProps) {
  // Escape closes
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/30"
        aria-label="Close modal"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative flex h-full w-full items-center justify-center p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title ?? "Modal"}
          className={[
            "w-full",
            maxWidthClassName,
            "rounded-3xl bg-dust-50 p-6 shadow-xl",
            "ring-1 ring-black/10",
          ].join(" ")}
        >
          {title ? (
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold text-dust-900">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-3 py-2 text-sm text-dust-600 hover:bg-black/5"
              >
                Close
              </button>
            </div>
          ) : null}

          {children}
        </div>
      </div>
    </div>
  );
}