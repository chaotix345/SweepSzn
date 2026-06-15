export type Mode = "daily" | "classic" | "hoopiq" | "challenge" | "factorhunt" | "prime" | "blueprint" | "surgeon";
export const MODE_LABEL: Record<Mode, string> = { daily: "daily", classic: "classic", hoopiq: "hoopiq", challenge: "challenge", factorhunt: "Factor Hunt", prime: "Prime Draft", blueprint: "Blueprint", surgeon: "Surgeon" };

// Per-mode accent (DESIGN.md): orange = core/social, violet = Factor Hunt / Prime, cyan = Blueprint,
// rose = Surgeon. Single source shared by the picker tiles and the in-game Shell badge. Never gold
// (reserved for the elite-grade payoff) and never green/red (win-loss semantics).
export type ModeAccent = "orange" | "violet" | "cyan" | "rose";
export const MODE_ACCENT: Record<Mode, ModeAccent> = {
  daily: "orange", classic: "orange", hoopiq: "orange", challenge: "orange",
  factorhunt: "violet", prime: "violet", blueprint: "cyan", surgeon: "rose",
};
