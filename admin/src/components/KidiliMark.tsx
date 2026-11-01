// The Kidili mark (Design Brief §15.2): a purple speech bubble with a white K, the same 40-unit
// drawing as the app's (mobile/src/components/Logo.tsx) and the favicon (public/favicon.svg).
export function KidiliMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden className={className}>
      <path d="M8 3h24a6 6 0 0 1 6 6v17a6 6 0 0 1-6 6H19l-8 6v-6H8a6 6 0 0 1-6-6V9a6 6 0 0 1 6-6z" className="fill-brand" />
      <path d="M15 10.5v15M15 19l9-8.5M18.2 16 25 25.5" stroke="#FFFFFF" strokeWidth={3.2} strokeLinecap="round"
        strokeLinejoin="round" fill="none" />
    </svg>
  );
}
