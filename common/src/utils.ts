/** True when there is a wing name worth printing after the 🪂.
 *
 * Lives here, rather than beside the formatter that needed it first, because
 * DescriptionFormatterClient also needs it — and that class exists precisely so
 * that a `'use client'` component can render a preview without dragging
 * ts-postgres and the connection pool into the browser bundle. Importing it
 * from DescriptionFormatter would have undone that.
 */
export function hasWingName(wing: string | null | undefined): wing is string {
  return typeof wing === 'string' && wing.trim().length > 0;
}

/**
 * Formats site names to be more readable and visually appealing
 */
export function formatSiteName(siteName: string): string {
  if (!siteName) return siteName;

  // Convert to proper title case while preserving French accents and special characters
  const titleCase = siteName.toLowerCase()
    .split(' ')
    .map(word => {
      // Don't capitalize common French prepositions/articles in the middle of names
      if (word === 'de' || word === 'la' || word === 'le' || word === 'du' || word === 'des' || word === 'l\'') {
        return word;
      }
      // Capitalize first letter, preserve rest (for accented characters)
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');

  // Always capitalize the first word regardless of whether it's an article
  const words = titleCase.split(' ');
  if (words.length > 0) {
    words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
  }

  // Clean up spacing around hyphens for better readability
  let formatted = words.join(' ')
    .replace(/\s*-\s*/g, ' - ')  // Ensure consistent spacing around hyphens
    .replace(/\s+/g, ' ')        // Remove extra spaces
    .trim();

  return formatted;
}

/**
 * Formats elapsed time from seconds to human readable format
 */
export function elapsedTime(duration_secs: number): string {
    if (duration_secs >= 60 * 60) {
        const hours = Math.floor(duration_secs / (60 * 60))
        const minutes = Math.floor((duration_secs - hours * 60 * 60) / 60)
        return `${hours}h ${minutes}min`
    }
    const minutes = Math.floor(duration_secs / 60)
    return `${minutes}min`
}

/**
 * Formats aggregation result for description display
 */
export function formatAggregationResult(result: { count: number, total_duration_sec: number }): string {
    return `${result.count} ${result.count == 1 ? "flight" : "flights"} / ${elapsedTime(result.total_duration_sec)}`
}