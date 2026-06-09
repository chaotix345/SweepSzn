"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV = [
  { href: "/play", label: "Play" },
  { href: "/leaderboards", label: "Leaderboards" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/about", label: "About" },
];

export default function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" onClick={() => setOpen(false)} className="font-display text-xl tracking-tight">
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
          <Link
            href="/play"
            className="hidden rounded-lg bg-orange-500 px-3.5 py-1.5 text-sm font-black text-black transition hover:bg-orange-400 sm:inline-block"
          >
            Build your five
          </Link>
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle menu"
            aria-expanded={open}
            aria-controls="mobile-nav"
            className="rounded-lg border border-zinc-700 px-2.5 py-1 text-zinc-300 hover:border-zinc-500 sm:hidden"
          >
            <span aria-hidden="true">{open ? "✕" : "☰"}</span>
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-nav" className="border-t border-zinc-800 px-4 pb-3 pt-1 sm:hidden">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              aria-current={isActive(n.href) ? "page" : undefined}
              className={`block rounded-lg px-2 py-2 text-sm font-semibold ${isActive(n.href) ? "text-orange-400" : "text-zinc-300 hover:text-zinc-100"}`}
            >
              {n.label}
            </Link>
          ))}
          <Link
            href="/play"
            onClick={() => setOpen(false)}
            className="mt-1 block rounded-lg bg-orange-500 px-2 py-2 text-center text-sm font-black text-black"
          >
            Build your five →
          </Link>
        </nav>
      )}
    </header>
  );
}
