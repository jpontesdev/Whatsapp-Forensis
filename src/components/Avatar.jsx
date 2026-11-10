import { useState } from 'react';

/** Foto de perfil; sem foto, mostra a silhueta padrão (pessoa ou grupo). */
export default function Avatar({ src, group = false, size = 49, className = '' }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, minWidth: size };
  if (src && !failed) {
    return <img src={src} alt="" style={style} onError={() => setFailed(true)} className={`rounded-full object-cover ${className}`} />;
  }
  return (
    <div style={{ ...style, background: 'var(--avatar-bg)' }} className={`flex items-center justify-center overflow-hidden rounded-full ${className}`}>
      <svg viewBox="0 0 212 212" width={size} height={size} fill="var(--avatar-fg)" aria-hidden>
        {group ? (
          <>
            <circle cx="80" cy="80" r="30" />
            <path d="M24 175c0-34 25-58 56-58s56 24 56 58z" />
            <circle cx="140" cy="86" r="24" opacity=".85" />
            <path d="M120 120c6-2 13-3 20-3 27 0 48 21 48 52v6h-46c0-22-9-42-22-55z" opacity=".85" />
          </>
        ) : (
          <>
            <circle cx="106" cy="82" r="40" />
            <path d="M34 190c0-42 32-70 72-70s72 28 72 70c-20 14-44 22-72 22s-52-8-72-22z" />
          </>
        )}
      </svg>
    </div>
  );
}
