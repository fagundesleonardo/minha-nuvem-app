/**
 * Brand mark for Minha Nuvem: a cloud with an upload accent, drawn inline so
 * it stays crisp at any size without shipping a raster asset. Mirrors the
 * app icon (public/icons/*) so the in-app brand and the installed-app icon
 * are the same mark.
 */
export function LogoMark({ size = 32, rounded = true }: { size?: number; rounded?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <defs>
        <linearGradient id="logoBg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="512" height="512" rx={rounded ? 114 : 0} ry={rounded ? 114 : 0} fill="url(#logoBg)" />
      <ellipse cx="140" cy="100" rx="170" ry="125" fill="#FFFFFF" opacity="0.08" />
      <circle cx="178" cy="272" r="68" fill="#FFFFFF" />
      <circle cx="248" cy="228" r="98" fill="#FFFFFF" />
      <circle cx="330" cy="278" r="72" fill="#FFFFFF" />
      <rect x="128" y="278" width="256" height="104" rx="52" ry="52" fill="#FFFFFF" />
      <path d="M256 294 L286 332 L268 332 L268 370 L244 370 L244 332 L226 332 Z" fill="url(#logoBg)" />
    </svg>
  );
}

export default function Logo({ size = 28, textClassName = "" }: { size?: number; textClassName?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={size} />
      <span className={textClassName || "font-semibold text-slate-900"}>Minha Nuvem</span>
    </span>
  );
}
