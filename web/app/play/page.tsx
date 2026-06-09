import Game from "@/components/Game";

// Game is a client component; it reads `?c=<id>` from window.location on mount to
// auto-enter H2H respond mode (path-agnostic — works here exactly as it did on "/").
export default function Play() {
  return <Game />;
}
