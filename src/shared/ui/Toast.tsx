import React from "react";

export type ToastType = "success" | "error";

type ToastProps = {
  message: string;
  type: ToastType;
};

export function Toast({ message, type }: ToastProps) {
  return (
    <div
      className={`
        rounded-2xl px-4 py-3 text-sm shadow-lg
        ${type === "success" ? "bg-fern-700 text-dust-50" : ""}
        ${type === "error" ? "bg-red-700 text-white" : ""}
      `}
    >
      {message}
    </div>
  );
}