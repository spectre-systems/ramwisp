/** Marca do ramwisp: fantasma de traço único (silhueta plana, bracinhos, barra recortada), estilo pictograma. */
export const GHOST_PATH =
  'M32 6C45 6 51 16 51 29V37C55 38 59 41 59 44C59 47 55 47.5 51.5 46.5V55Q47.2 61.5 42.7 55Q38.3 61.5 34 55Q29.7 61.5 25.3 55Q20.8 61.5 16.5 55L12.5 55V46.5C9 47.5 5 47 5 44C5 41 9 38 13 37V29C13 16 19 6 32 6Z'

export function GhostMark({ size = 24, stroke = 'currentColor', fill = 'none', eyes = 'currentColor', weight = 3.4 }: { size?: number; stroke?: string; fill?: string; eyes?: string; weight?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden style={{ flex: 'none', display: 'block' }}>
      <path d={GHOST_PATH} fill={fill} stroke={stroke} strokeWidth={weight} strokeLinejoin="round" />
      <ellipse cx="25.5" cy="28" rx="3" ry="3.8" fill={eyes} /><ellipse cx="38.5" cy="28" rx="3" ry="3.8" fill={eyes} />
    </svg>
  )
}
