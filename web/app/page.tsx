import Game from "@/components/Game";
import { poolStats } from "@/lib/data";

export default function Home() {
  const stats = poolStats();
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <Game />
      <footer className="pb-10 text-center text-xs text-zinc-600">
        {stats.players.toLocaleString()} players · {stats.franchiseDecades} franchise-eras · engine calibrated to real NBA team-seasons
      </footer>
    </main>
  );
}
