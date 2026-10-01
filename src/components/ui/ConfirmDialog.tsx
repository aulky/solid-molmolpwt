import { Show, createEffect, onCleanup } from "solid-js";
import { AlertTriangle, Trash2, HelpCircle, AlertCircle, Loader2 } from "lucide-solid";

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "info";
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const variant = () => props.variant || "danger";

  // Tangani tombol ESC untuk menutup dialog
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && props.isOpen && !props.isLoading) {
      props.onClose();
    }
  };

  createEffect(() => {
    if (typeof window !== "undefined" && props.isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
      onCleanup(() => {
        window.removeEventListener("keydown", handleKeyDown);
        document.body.style.overflow = "";
      });
    }
  });

  return (
    <Show when={props.isOpen}>
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <div
          class="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
          onClick={() => {
            if (!props.isLoading) props.onClose();
          }}
        />

        {/* Modal Box */}
        <div
          role="dialog"
          aria-modal="true"
          class="relative w-full max-w-md bg-white rounded-2xl border border-[#E8E8EC] p-6 shadow-2xl z-10 space-y-4 animate-in zoom-in-95 fade-in duration-150"
        >
          {/* Header & Icon */}
          <div class="flex items-start gap-3.5">
            <Show when={variant() === "danger"}>
              <div class="w-10 h-10 rounded-xl bg-[#EF4444]/10 text-[#EF4444] border border-[#EF4444]/20 flex items-center justify-center shrink-0">
                <Trash2 size={20} />
              </div>
            </Show>

            <Show when={variant() === "warning"}>
              <div class="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} />
              </div>
            </Show>

            <Show when={variant() === "info"}>
              <div class="w-10 h-10 rounded-xl bg-[#6366F1]/10 text-[#6366F1] border border-[#6366F1]/20 flex items-center justify-center shrink-0">
                <HelpCircle size={20} />
              </div>
            </Show>

            <div class="space-y-1 flex-1 min-w-0">
              <h3 class="font-heading font-bold text-base text-[#0A0A0A] leading-snug">
                {props.title}
              </h3>
              <p class="text-xs sm:text-sm text-[#6B6B6B] leading-relaxed font-body">
                {props.message}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div class="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              disabled={props.isLoading}
              onClick={props.onClose}
              class="px-4 py-2 rounded-xl border border-[#E8E8EC] text-xs font-semibold text-[#0A0A0A] bg-white hover:bg-[#F4F4F6] transition cursor-pointer disabled:opacity-50"
            >
              {props.cancelText || "Batal"}
            </button>

            <button
              type="button"
              disabled={props.isLoading}
              onClick={props.onConfirm}
              class={`px-4 py-2 rounded-xl text-xs font-semibold text-white shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                variant() === "danger"
                  ? "bg-[#EF4444] hover:bg-[#DC2626] active:scale-[0.98]"
                  : variant() === "warning"
                  ? "bg-amber-600 hover:bg-amber-700 active:scale-[0.98]"
                  : "bg-[#6366F1] hover:bg-[#4F46E5] active:scale-[0.98]"
              }`}
            >
              <Show when={props.isLoading}>
                <Loader2 size={13} class="animate-spin" />
              </Show>
              <span>{props.confirmText || "Ya, Lanjutkan"}</span>
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
