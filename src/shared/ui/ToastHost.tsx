import React from "react";
import { Toast, ToastType } from "./Toast";

type ToastItem = {
  id: string;
  message: string;
  type: ToastType;
};

export function ToastHost() {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  function push(message: string, type: ToastType) {
    const id = crypto.randomUUID();
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3000);
  }

  // expose globally (simple + pragmatic)
  window.__toast = push;

  return (
    <div className="fixed bottom-6 right-6 z-50 space-y-2">
      {toasts.map((t) => (
        <Toast key={t.id} message={t.message} type={t.type} />
      ))}
    </div>
  );
}