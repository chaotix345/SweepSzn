"use client";
import { useEffect } from "react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SkipLink from "@/components/SkipLink";
import { Button, ButtonLink } from "@/components/ui/Button";

// Root error boundary (Next 16: `retry` re-fetches and re-renders the failed segment). Arena-styled
// with the site chrome, a Retry, and a way home, instead of a blank crash screen.
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <SkipLink />
      <SiteHeader />
      <main id="main-content" className="flex flex-1 items-center bg-arena-glow px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-md text-center">
          <h1>
            <span className="block text-xs font-bold uppercase tracking-[0.2em] text-orange-400">Something went wrong</span>
            <span className="mt-3 block font-display text-5xl leading-none text-zinc-100 sm:text-6xl">Shot clock violation.</span>
          </h1>
          <p className="mt-4 text-zinc-400">
            {"This page hit an error before it could load. Try again, or head back home."}
          </p>
          {error.digest && <p className="mt-2 font-mono text-xs text-zinc-500">ref {error.digest}</p>}
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Button size="lg" onClick={() => retry()}>Retry</Button>
            <ButtonLink href="/" variant="secondary" size="lg">Home</ButtonLink>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
