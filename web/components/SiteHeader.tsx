"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import NotificationBell from "@/components/NotificationBell";
import AuthControl from "@/components/AuthControl";
import { ButtonLink } from "@/components/ui/Button";
import { MenuIcon, CloseIcon } from "@/components/ui/icons";
import { buildFocusTrapHandler } from "@/components/game/useFocusTrap";

const NAV = [
  { href: "/play", label: "Play" },
  { href: "/leaderboards", label: "Leaderboards" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/about", label: "About" },
];

export default function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  // Escape closes the mobile menu and returns focus to the toggle (keyboard a11y)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(false); toggleRef.current?.focus(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Move focus into the menu on open so Tab cycles inside it (paired with the focus trap below).
  useEffect(() => { if (open) firstLinkRef.current?.focus(); }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/80 shadow-[0_1px_0_0_rgba(255,106,0,0.08),0_10px_30px_-12px_rgba(0,0,0,0.85)] backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" onClick={() => setOpen(false)} className="font-display text-2xl tracking-wide">
          Sweep<span className="text-orange-500">Szn</span>
        </Link>

        <nav className="hidden items-center gap-6 sm:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={isActive(n.href) ? "page" : undefined}
              className={`text-sm font-semibold transition ${isActive(n.href) ? "text-orange-400" : "text-zinc-400 hover:text-zinc-100"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ButtonLink href="/play" size="sm" className="hidden sm:inline-flex">
            Build your five
          </ButtonLink>
          <AuthControl />
          <NotificationBell />
          <button
            ref={toggleRef}
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu"
            aria-expanded={open}
            aria-controls="mobile-nav"
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-zinc-700 text-zinc-300 transition hover:border-zinc-500 sm:hidden"
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {open && (
        <nav
          id="mobile-nav"
          ref={navRef}
          onKeyDown={(e) => buildFocusTrapHandler<HTMLElement>(navRef, () => { setOpen(false); toggleRef.current?.focus(); }, { selector: "a[href]" })(e)}
          className="animate-menu-down border-t border-zinc-800 px-4 pb-3 pt-1 sm:hidden"
        >
          {NAV.map((n, i) => (
            <Link
              key={n.href}
              ref={i === 0 ? firstLinkRef : undefined}
              href={n.href}
              onClick={() => setOpen(false)}
              aria-current={isActive(n.href) ? "page" : undefined}
              className={`block rounded-lg px-2 py-3 text-sm font-semibold ${isActive(n.href) ? "text-orange-400" : "text-zinc-300 hover:text-zinc-100"}`}
            >
              {n.label}
            </Link>
          ))}
          <ButtonLink href="/play" onClick={() => setOpen(false)} className="mt-1 w-full">
            Build your five →
          </ButtonLink>
        </nav>
      )}
    </header>
  );
}
