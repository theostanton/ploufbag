/**
 * The product's user-facing name, in one place.
 *
 * It was previously seven literals across five files, and had already drifted:
 * five said "Paraglider Stats" and two said "Parastats". Scattered brand
 * literals are the same shape of problem as the scattered Strava footer
 * domains, which drifted into two separate data-corruption bugs.
 *
 * Deliberately not derived from the domain. `ploufbag.com` is one word because
 * domains have to be; the name is two.
 */
export const BRAND_NAME = "Plouf Bag";
