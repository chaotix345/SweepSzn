import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

// The shared CTA primitive. Replaces the 9+ hand-rolled orange-button class strings scattered
// across the app so padding/scale/focus/motion stay consistent. `Button` renders a <button>;
// `ButtonLink` renders a Next <Link> (prefetch + client nav). Both share the same look.
//
// Variants: primary = the action-orange CTA (DESIGN.md); secondary = outlined; ghost = bare.
// `mode` takes a per-mode accent class string (violet/cyan/rose) for the game-mode CTAs.
type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl font-black tracking-tight transition " +
  "select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 " +
  "disabled:pointer-events-none disabled:opacity-60";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-orange-500 text-black shadow-lg shadow-orange-500/20 hover:bg-orange-400 active:bg-orange-600",
  secondary: "border border-zinc-700 text-zinc-100 hover:border-zinc-500 hover:bg-zinc-800/50",
  ghost: "text-zinc-300 hover:bg-zinc-800/60 hover:text-zinc-100",
};

// Every size clears the 44px (sm: 36px) min touch target the audit flagged on the bare <a> CTAs.
const SIZES: Record<Size, string> = {
  sm: "min-h-9 px-3.5 py-1.5 text-sm",
  md: "min-h-11 px-6 py-2.5 text-base",
  lg: "min-h-12 px-8 py-3 text-base sm:text-lg",
};

const classes = (variant: Variant, size: Size, className?: string): string =>
  cn(BASE, VARIANTS[variant], SIZES[size], className);

type StyleProps = { variant?: Variant; size?: Size };

export function Button({
  variant = "primary", size = "md", className, children, ...rest
}: StyleProps & ComponentProps<"button"> & { children: ReactNode }) {
  return (
    <button className={classes(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = "primary", size = "md", className, children, ...rest
}: StyleProps & ComponentProps<typeof Link> & { children: ReactNode }) {
  return (
    <Link className={classes(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
