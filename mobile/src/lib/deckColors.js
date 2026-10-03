export const DECK_COLOR_IDS = ["violet", "mint", "amber", "tomato"];

const ICONS = {
  violet: "layers-outline",
  mint: "leaf-outline",
  amber: "sparkles-outline",
  tomato: "book-outline",
};

export function deckAccent(colorId, colors) {
  const id = DECK_COLOR_IDS.includes(colorId) ? colorId : "violet";
  return {
    id,
    color: colors[id],
    soft: colors[`${id}Soft`],
    icon: ICONS[id],
  };
}
