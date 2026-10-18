// Hashtags in a caption (BR-FD-10). The server stores a post's tags by parsing the caption with
// the same rule (fn__sync_post_hashtags), so the app parses rather than carrying a second list
// that could disagree with the text on screen.
//
// A tag is '#' followed by 1-64 letters, digits or underscores, and the '#' must not sit right
// after one of those characters: "(#dar)" and "#dar_es" are tags, "C#" and "a#b" are not.
// Matching ignores case and the stored tag is lower case, which is what a tag link opens.

/** One run of the caption: plain text, or a tag that can be tapped. */
export interface CaptionPart {
  text: string;
  /** The tag without its '#', lower-cased, when this part is a tag. */
  tag?: string;
}

const TAG = /(^|[^\p{L}\p{N}_])#([\p{L}\p{N}_]{1,64})/gu;

/**
 * Splits a caption into plain and tag parts, in order. Joining every `text` back together always
 * reproduces the caption exactly, so nothing is lost or duplicated on screen.
 */
export function captionParts(caption: string): CaptionPart[] {
  const parts: CaptionPart[] = [];
  let at = 0;

  for (const match of caption.matchAll(TAG)) {
    const [whole, before = '', tag = ''] = match;
    // The '#' sits after whatever `before` matched (one character, or nothing at the start).
    const start = match.index + before.length;
    if (start > at) parts.push({ text: caption.slice(at, start) });
    parts.push({ text: `#${tag}`, tag: tag.toLowerCase() });
    at = match.index + whole.length;
  }
  if (at < caption.length) parts.push({ text: caption.slice(at) });
  return parts;
}

/** The tags of a caption, lower-cased, in first-seen order and without repeats. */
export function captionTags(caption: string): string[] {
  return [...new Set(captionParts(caption).flatMap((p) => (p.tag ? [p.tag] : [])))];
}

/** Normalises what a user or a link gives us ('#Dar', 'dar') to the stored form ('dar'). */
export function normalizeTag(value: string): string {
  return value.trim().replace(/^#+/, '').toLowerCase();
}
