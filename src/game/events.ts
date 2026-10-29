/** События между волнами: два выбора, у каждого цена или риск. */
export type EventId = "trader" | "crate" | "well" | "camp" | "scout";

export interface EventOption {
  label: string;
  hint: string;
  /** Сколько золота стоит выбор; 0 — бесплатно. */
  cost: number;
}

export interface EventDef {
  id: EventId;
  title: string;
  text: string;
  options: [EventOption, EventOption];
}

export const EVENT_ORDER: EventId[] = ["trader", "crate", "well", "camp", "scout"];

export const EVENTS: Record<EventId, EventDef> = {
  trader: {
    id: "trader",
    title: "Бродячий торговец",
    text: "У тропы стоит человек с мешком, который звенит. Димон не спрашивает, откуда он взялся.",
    options: [
      { label: "Точильный камень", hint: "Следующая волна: урон башен +30%", cost: 80 },
      { label: "Продать ему трофей", hint: "+60 золота", cost: 0 },
    ],
  },
  crate: {
    id: "crate",
    title: "Ящик на тропе",
    text: "Кто-то бросил ящик у самых врат. Он тёплый. Димон не любит тёплые ящики.",
    options: [
      { label: "Открыть", hint: "Поровну: +160 золота или два лишних знахаря в следующей волне", cost: 0 },
      { label: "Обойти стороной", hint: "+30 золота", cost: 0 },
    ],
  },
  well: {
    id: "well",
    title: "Колодец с пеплом",
    text: "На дне что-то блестит. Вода пахнет жжёным, но блестит уж очень хорошо.",
    options: [
      { label: "Выпить", hint: "−2 жизни, +200 золота", cost: 0 },
      { label: "Не трогать", hint: "Ничего не меняется", cost: 0 },
    ],
  },
  camp: {
    id: "camp",
    title: "Привал",
    text: "Тихо. Димон садится у костра и впервые за ночь разувается.",
    options: [
      { label: "Отдохнуть", hint: "+2 жизни (не больше, чем было в начале)", cost: 0 },
      { label: "Подготовиться", hint: "Обвал и Заморозка готовы сразу", cost: 0 },
    ],
  },
  scout: {
    id: "scout",
    title: "Разведчик",
    text: "Малец прибежал со стороны портала и говорит, что видел, как тварям точат бока.",
    options: [
      { label: "Заплатить за слабое место", hint: "Следующая волна: твари на 25% тоньше", cost: 60 },
      { label: "Отмахнуться", hint: "+20 золота", cost: 0 },
    ],
  },
};
