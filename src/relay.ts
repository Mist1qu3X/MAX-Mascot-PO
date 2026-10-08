/**
 * Наш собственный сервер (`server/index.mjs`). Его адрес нужен в двух местах,
 * поэтому настройки живут здесь, а не дублируются.
 *
 * Через него идёт не только страница стикера, но и загрузка снятого кадра:
 * хранилище kie.ai (`kieai.redpandaai.co`) с панели недоступно, судя по
 * всему — блокировка у провайдера. Свой домен панель видит, а kie.ai умеет
 * скачать картинку по любой публичной ссылке.
 */
export const RELAY = import.meta.env.VITE_STICKER_RELAY ?? 'http://localhost:8787'
export const RELAY_TOKEN = import.meta.env.VITE_STICKER_TOKEN ?? ''

export function relayHeaders(): HeadersInit {
  return {
    'content-type': 'application/json',
    ...(RELAY_TOKEN ? { authorization: `Bearer ${RELAY_TOKEN}` } : {}),
  }
}
