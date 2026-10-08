import { useLanguage } from '../../i18n'
import styles from './LangToggle.module.css'

type LangToggleProps = {
  onToggle: () => void
}

/**
 * Круглая кнопка смены языка в правом верхнем углу.
 *
 * Подписана языком, на который переключит, а не текущим: на кнопке «EN»
 * посетитель ожидает получить английский, и это читается без раздумий.
 *
 * Макета на неё нет — свёрстана в той же палитре, что и остальные экраны.
 *
 * Гасит всплытие: экран приветствия сам по себе кнопка «начать», и без
 * этого смена языка сразу уводила бы в съёмку.
 */
export function LangToggle({ onToggle }: LangToggleProps) {
  const language = useLanguage()
  const next = language === 'ru' ? 'en' : 'ru'

  return (
    <button
      type="button"
      className={styles.button}
      aria-label={next === 'en' ? 'Switch to English' : 'Переключить на русский'}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {next.toUpperCase()}
    </button>
  )
}
