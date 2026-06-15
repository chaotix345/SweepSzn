// Tiny class- name joiner (no clsx dependency): drops falsy values, joins with a space.
export const cn = (...parts: (string | false | null | undefined)[]): string =>
  parts.filter(Boolean).join(" ");
