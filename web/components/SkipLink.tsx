// Keyboard "Skip to content" link: visually hidden until focused, then an orange pill top-left.
export default function SkipLink({ href = "#main-content" }: { href?: string }) {
  return (
    <a
      href={href}
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-orange-500 focus:px-4 focus:py-2 focus:font-bold focus:text-black"
    >
      Skip to content
    </a>
  );
}
