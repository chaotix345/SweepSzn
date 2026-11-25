import { twMerge } from "tailwind-merge";

// Class-name joiner: drops falsy values, then resolves Tailwind conflicts so a caller's className
// (e.g. `hidden sm:inline-flex`) overrides a primitive's base classes (Button's `inline-flex`).
export const cn = (...parts: (string | false | null | undefined)[]): string =>
  twMerge(parts.filter(Boolean).join(" "));
