/**
 * iExcellence mark: a warm gradient tile with a white "i" whose dot is a four-point spark.
 * Every instance carries the same gradient definitions, so repeated ids on one page are harmless.
 */
export function Logo({ className = "logo" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" role="img" aria-label="iExcellence">
      <defs>
        <linearGradient id="ixl-tile" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFA24A" />
          <stop offset=".5" stopColor="#F26B1D" />
          <stop offset="1" stopColor="#B83A0A" />
        </linearGradient>
        <linearGradient id="ixl-gloss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".38" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#ixl-tile)" />
      <path d="M0 11A11 11 0 0 1 11 0h18a11 11 0 0 1 11 11v3.5C27.5 21 12.5 21 0 14.5z" fill="url(#ixl-gloss)" />
      <rect x="16.6" y="18.2" width="6.8" height="14.6" rx="3.4" fill="#fff" />
      <path d="M20 4.6Q21.1 9.4 25.9 10.5Q21.1 11.6 20 16.4Q18.9 11.6 14.1 10.5Q18.9 9.4 20 4.6z" fill="#fff" />
      <path d="M29.6 5.6Q30 7.6 32 8Q30 8.4 29.6 10.4Q29.2 8.4 27.2 8Q29.2 7.6 29.6 5.6z" fill="#fff" opacity=".75" />
    </svg>
  );
}
