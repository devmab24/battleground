// Shared art style template (Stage 3): appended to every fighter's image
// prompt so both sides render as one consistent visual system.
// Lives in lib/, not api/, because Vercel turns every file in api/ into a route.
export const ART_STYLE_TEMPLATE =
  "16-bit pixel art illustration, retro video game sprite style, bold outlined pixels, vibrant limited color palette, dynamic action pose. Depicted as one cohesive image, centered, filling most of the frame, isolated on a plain solid color background with no scenery. No text, words, letters, numbers, logos, watermarks, UI elements, borders, or frames.";

const NUMBER_WORDS =
  "two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|hundreds|thousand|thousands|million|millions|dozen|dozens|several|a few|a couple of|a pair of|a trio of";
const GROUP_WORDS =
  "army|armies|horde|swarm|pack|herd|flock|team|squad|gang|crew|band|mob|legion|colony|troop|fleet|group|crowd|tribe|clan|pride|platoon|battalion|duo|trio|family";

// Does the name describe more than one fighter? "10 cows", "an army of ants",
// "Batman and Robin". Plurals without a number ("cows") count as one, which
// keeps single fighters from being drawn as crowds.
const GROUP_PATTERN = new RegExp(
  `^\\s*((a|an|the)\\s+)?(\\d|(${NUMBER_WORDS})\\b)|\\b(${GROUP_WORDS})\\b(?!-)|\\s(and|&|\\+)\\s`,
  "i",
);

export function isGroupFighter(fighter) {
  return GROUP_PATTERN.test(fighter);
}

// Builds the image prompt for one fighter. Group inputs ("10 cows") get one
// image showing the whole group, handled here rather than by looping.
// Everything else asks for exactly one character, because image models tend
// to draw crowds when a prompt mentions groups at all.
// `fighter` should already be cleaned with sanitizeFighter().
export function buildImagePrompt(fighter) {
  const subject = isGroupFighter(fighter)
    ? `Fighter: ${fighter}. Show the whole group together in this single image.`
    : `Fighter: ${fighter}. Show exactly one single character, alone, with no other people, creatures, or copies.`;
  return `${subject} ${ART_STYLE_TEMPLATE}`;
}
