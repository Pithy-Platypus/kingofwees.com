// Shown on the About and Privacy pages.
export const contactEmail = 'kingcat.weesdistrict@gmail.com';

/** The code a build came from on GitHub: the commit in its version (source/version.sh), without a `.dirty` mark. */
export const sourceUrlFor = (version: string) =>
  `https://github.com/Pithy-Platypus/kingofwees.com/tree/${version.split('+')[1].split('.')[0]}`;

// The exact code of the page being read, linked from the About and Privacy pages so anyone can check it.
export const sourceUrl = sourceUrlFor(import.meta.env.VITE_APP_VERSION);
