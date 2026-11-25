// Server Component. Remounts on each navigation (unique key per route segment), so the CSS fade in
// globals.css replays on every page change. It sits inside the layout's <main>, so only the page
// content fades: the sticky SiteHeader stays put. Zero client cost.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-fade">{children}</div>;
}
