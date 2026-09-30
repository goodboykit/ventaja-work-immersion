export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
        <circle cx="16" cy="16" r="16" className="fill-brand" />
        <path d="M10 12h12v2H10zm0 4h10v2H10zm0 4h8v2H10z" fill="#fff" />
      </svg>
      <span className="text-xl font-bold tracking-tight text-brand">Tubo</span>
    </div>
  );
}
