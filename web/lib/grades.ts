// Single source of truth for grade → color (the "keep these in sync" cleanup DESIGN.md §Grade
// colors asks for). Tailwind classes for in-app UI; hex for the satori/next-og cards in lib/og.tsx
// (satori has no Tailwind). S and A+ are the reserved gold tier; the rest follow win/loss + neutral.
export const GRADE_COLOR: Record<string, string> = {
  S: "text-gold", "A+": "text-gold", A: "text-green-400",
  B: "text-blue-400", C: "text-amber-400", D: "text-slate-400", F: "text-red-400",
};

export const GRADE_HEX: Record<string, string> = {
  S: "#ffc53d", "A+": "#ffc53d", A: "#4ade80", B: "#60a5fa", C: "#fbbf24", D: "#94a3b8", F: "#f87171",
};

// The elite tier — gets the gold trophy treatment (glow, buzzer pulse) on the result reveal.
export const isEliteGrade = (grade: string): boolean => grade === "S" || grade === "A+";

export const gradeColor = (grade: string): string => GRADE_COLOR[grade] ?? "text-zinc-300";
export const gradeHex = (grade: string): string => GRADE_HEX[grade] ?? "#e4e4e7";
