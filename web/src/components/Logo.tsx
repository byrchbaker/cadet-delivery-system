/** Original mark: a star over chevron wings. Deliberately not an official insignia. */
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ flex: 'none' }}>
      <rect x="1" y="1" width="62" height="62" rx="10" fill="none" stroke="currentColor" strokeOpacity=".28" strokeWidth="2" />
      <path d="M12 41 32 27l20 14v8L32 35 12 49z" fill="var(--nav-rule, #c3cad4)" />
      <path d="m32 9 3.1 6.4 7 .9-5.1 4.9 1.3 7L32 24.9 25.7 28.2l1.3-7-5.1-4.9 7-.9z" fill="currentColor" />
    </svg>
  );
}

export function Brand({ name, sub }: { name: string; sub?: string }) {
  return (
    <>
      <LogoMark />
      <div style={{ minWidth: 0 }}>
        <div className="brand-name">{name}</div>
        {sub && <div className="brand-sub">{sub}</div>}
      </div>
    </>
  );
}
