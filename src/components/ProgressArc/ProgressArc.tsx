import styles from './ProgressArc.module.css'

/* Геометрия из макета (в пикселях макета):
   полуокружность 180°, центр-радиус 576, толщина 96, круглые торцы.
   0 % — левый конец, 100 % — правый. */
const R = 576
const STROKE = 96
const CAP = STROKE / 2
const BOX_W = (R + CAP) * 2
const BOX_H = R + CAP * 2
const CX = BOX_W / 2
const CY = R + CAP
const LENGTH = Math.PI * R

const TRACK_PATH = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`

type ProgressArcProps = {
  /** 0…1 */
  value: number
  className?: string
}

export function ProgressArc({ value, className }: ProgressArcProps) {
  const clamped = Math.min(Math.max(value, 0), 1)

  return (
    <svg
      className={[styles.arc, className].filter(Boolean).join(' ')}
      viewBox={`0 0 ${BOX_W} ${BOX_H}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
    >
      <defs>
        <linearGradient id="arc-fill" x1={CX - R} y1="0" x2={CX + R} y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#461dff" />
          <stop offset="10%" stopColor="#6e0eff" />
          <stop offset="100%" stopColor="#c500ff" />
        </linearGradient>
      </defs>

      <path className={styles.track} d={TRACK_PATH} strokeWidth={STROKE} />
      <path
        className={styles.value}
        d={TRACK_PATH}
        strokeWidth={STROKE}
        stroke="url(#arc-fill)"
        strokeDasharray={LENGTH}
        strokeDashoffset={LENGTH * (1 - clamped)}
      />
    </svg>
  )
}
