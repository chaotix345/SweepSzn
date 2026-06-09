import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

// Nested layout (not a second root layout) for the marketing/content routes:
// /, /how-it-works, /leaderboards, /about. Shares the root layout's <html>/<body>,
// so navigation between these and /play is client-side (no full reload).
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
