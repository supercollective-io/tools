const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function abbreviateLabel(label: string): string {
  const graphemes = Array.from(segmenter.segment(label), (part) => part.segment);
  return graphemes.length > 28 ? `${graphemes.slice(0, 27).join('')}…` : label;
}
