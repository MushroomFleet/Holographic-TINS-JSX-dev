import type { Toast as ToastType } from "../hooks/useToast";

interface ToastContainerProps {
  toasts: ToastType[];
  onDismiss: (id: number) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="alert"
          className={`px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition-all duration-300 cursor-pointer ${
            toast.type === "success"
              ? "bg-green-600/90 text-white"
              : "bg-red-600/90 text-white"
          }`}
          onClick={() => onDismiss(toast.id)}
        >
          <span className="mr-2">
            {toast.type === "success" ? "\u2713" : "\u2717"}
          </span>
          {toast.message}
        </div>
      ))}
    </div>
  );
}
