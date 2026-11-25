import { useEffect, type RefObject } from "react";

// Move keyboard focus into a dialog while `active` is truthy and restore it to the triggering element
// when it closes (or when `active` changes identity). Paired with each dialog's own Tab trap.
export function useDialogFocus(active: unknown, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => prev?.focus?.();
  }, [active, ref]);
}
