/** Line drawings of each product type. Inline SVG: no third-party images, nothing to allow in the CSP. */
const S = { fill: 'none', stroke: '#16181a', strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
const Y = '#ffc629'

function Key({ nfc }: { nfc?: boolean }) {
  return (
    <>
      <rect x="40" y="52" width="104" height="46" rx="12" {...S} />
      <rect x="144" y="64" width="26" height="22" rx="4" {...S} />
      {nfc ? <circle cx="58" cy="75" r="8" {...S} /> : <rect x="144" y="68" width="26" height="14" rx="3" fill="#16181a" />}
      <circle cx="98" cy="75" r="13" fill={Y} stroke="#16181a" strokeWidth={3} />
      <path d="M92 75l4 4 8-8" {...S} />
      {nfc && <path d="M120 58c6 5 6 29 0 34M128 52c10 8 10 38 0 46" {...S} strokeWidth={2.5} />}
    </>
  )
}

const ART: Record<string, React.ReactNode> = {
  key: <Key />,
  'key-nfc': <Key nfc />,
  shutter: (
    <>
      <rect x="30" y="28" width="140" height="88" rx="6" {...S} />
      <path d="M18 124h164" {...S} />
      <rect x="82" y="34" width="36" height="12" rx="6" fill={Y} stroke="#16181a" strokeWidth={3} />
      <circle cx="108" cy="40" r="3" fill="#16181a" />
      <path d="M50 70h100M50 86h64" {...S} stroke="#b9bdb5" />
    </>
  ),
  sleeve: (
    <>
      <rect x="54" y="20" width="76" height="50" rx="6" fill={Y} stroke="#16181a" strokeWidth={3} />
      <path d="M66 36h30" {...S} />
      <rect x="44" y="52" width="96" height="78" rx="6" fill="#fff" stroke="#16181a" strokeWidth={3} />
      <path d="M58 70l10 10-10 10M74 70l10 10-10 10" {...S} strokeWidth={2.5} />
      <path d="M96 80h30" {...S} stroke="#b9bdb5" />
    </>
  ),
  screen: (
    <>
      <rect x="44" y="22" width="112" height="76" rx="5" {...S} />
      <path d="M30 112h140l-12 12H42z" {...S} />
      <path d="M100 98L36 40M100 98l64-58" {...S} strokeDasharray="5 6" stroke="#767c83" strokeWidth={2} />
      <rect x="56" y="32" width="88" height="56" fill={Y} opacity={0.55} />
    </>
  ),
  lab: (
    <>
      <rect x="62" y="34" width="76" height="34" rx="5" fill={Y} stroke="#16181a" strokeWidth={3} />
      <path d="M78 34V16M122 34V16" {...S} />
      <circle cx="80" cy="51" r="3" fill="#16181a" /><circle cx="92" cy="51" r="3" fill="#16181a" />
      <rect x="24" y="100" width="52" height="32" rx="4" {...S} />
      <rect x="124" y="100" width="52" height="32" rx="4" {...S} />
      <path d="M86 68v14H50v18M114 68v14h36v18" {...S} strokeWidth={2.5} />
    </>
  ),
  flag: (
    <>
      <path d="M62 132V18" {...S} />
      <path d="M62 22h82l-16 24 16 24H62z" fill={Y} stroke="#16181a" strokeWidth={3} />
      <path d="M44 132h40" {...S} />
      <path d="M86 40l-6 6 6 6M108 40l6 6-6 6" {...S} strokeWidth={2.5} />
    </>
  ),
  course: (
    <>
      <rect x="28" y="24" width="144" height="90" rx="6" {...S} />
      <path d="M90 52v34l28-17z" fill={Y} stroke="#16181a" strokeWidth={3} />
      <path d="M28 126h144" {...S} />
      <circle cx="74" cy="126" r="5" fill="#16181a" />
    </>
  ),
  'course-ir': (
    <>
      <path d="M24 112h152" {...S} />
      <path d="M40 112V96M70 112V70M100 112V84M130 112V50M160 112V90" {...S} strokeWidth={2.5} stroke="#767c83" />
      <circle cx="124" cy="52" r="26" fill={Y} fillOpacity={0.6} stroke="#16181a" strokeWidth={3} />
      <path d="M143 71l22 22" {...S} strokeWidth={5} />
    </>
  ),
  book: (
    <>
      <path d="M100 34c-18-10-44-12-62-6v92c18-6 44-4 62 6 18-10 44-12 62-6V28c-18-6-44-4-62 6z" {...S} />
      <path d="M100 34v92" {...S} />
      <path d="M50 52h34M50 66h34M116 52h34M116 66h22" {...S} strokeWidth={2.5} stroke="#767c83" />
      <rect x="116" y="82" width="34" height="18" fill={Y} stroke="#16181a" strokeWidth={2.5} />
    </>
  ),
  sticker: (
    <>
      <path d="M40 40h120v52l-28 28H40z" fill={Y} stroke="#16181a" strokeWidth={3} />
      <path d="M132 120V92h28" fill="#fff" stroke="#16181a" strokeWidth={3} />
      <path d="M60 66l12 12 22-24" {...S} strokeWidth={4} />
    </>
  ),
}

export default function ProductArt({ art, title }: { art: string; title?: string }) {
  return (
    <svg viewBox="0 0 200 150" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} aria-label={title}>
      {ART[art] ?? ART.key}
    </svg>
  )
}
