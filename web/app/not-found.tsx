import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import SkipLink from "@/components/SkipLink";
import { ButtonLink } from "@/components/ui/Button";

// Root 404: unmatched URLs plus every notFound() from /r, /pe, /sg, /rank, /compare, /dex/s, /teams.
// Arena-styled with the site chrome so a dead link always has a way back into the game.
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <SkipLink />
      <SiteHeader />
      <main id="main-content" className="flex flex-1 items-center bg-arena-glow px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-md text-center">
          <h1>
            <span className="block font-display text-8xl leading-none tabular-nums text-zinc-100 sm:text-9xl">404</span>
            <span className="mt-3 block font-display text-3xl tracking-wide text-orange-400">Airball.</span>
          </h1>
          <p className="mt-4 text-zinc-400">
            {"This page isn't on the court. The link may be mistyped, or the lineup it pointed to no longer exists."}
          </p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <ButtonLink href="/play" size="lg">Draft your five →</ButtonLink>
            <ButtonLink href="/" variant="secondary" size="lg">Home</ButtonLink>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
