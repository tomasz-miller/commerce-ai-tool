/** CSS Color Module named colors used to label hex facet values. */
const CSS_NAMED_COLOR_TABLE = `
Alice Blue:f0f8ff
Antique White:faebd7
Aqua:00ffff
Aquamarine:7fffd4
Azure:f0ffff
Beige:f5f5dc
Bisque:ffe4c4
Black:000000
Blanched Almond:ffebcd
Blue:0000ff
Blue Violet:8a2be2
Brown:a52a2a
Burlywood:deb887
Cadet Blue:5f9ea0
Chartreuse:7fff00
Chocolate:d2691e
Coral:ff7f50
Cornflower Blue:6495ed
Cornsilk:fff8dc
Crimson:dc143c
Dark Blue:00008b
Dark Cyan:008b8b
Dark Goldenrod:b8860b
Dark Gray:a9a9a9
Dark Green:006400
Dark Khaki:bdb76b
Dark Magenta:8b008b
Dark Olive Green:556b2f
Dark Orange:ff8c00
Dark Orchid:9932cc
Dark Red:8b0000
Dark Salmon:e9967a
Dark Sea Green:8fbc8f
Dark Slate Blue:483d8b
Dark Slate Gray:2f4f4f
Dark Turquoise:00ced1
Dark Violet:9400d3
Deep Pink:ff1493
Deep Sky Blue:00bfff
Dim Gray:696969
Dodger Blue:1e90ff
Firebrick:b22222
Floral White:fffaf0
Forest Green:228b22
Gainsboro:dcdcdc
Ghost White:f8f8ff
Gold:ffd700
Goldenrod:daa520
Gray:808080
Green:008000
Green Yellow:adff2f
Honeydew:f0fff0
Hot Pink:ff69b4
Indian Red:cd5c5c
Indigo:4b0082
Ivory:fffff0
Khaki:f0e68c
Lavender:e6e6fa
Lavender Blush:fff0f5
Lawn Green:7cfc00
Lemon Chiffon:fffacd
Light Blue:add8e6
Light Coral:f08080
Light Cyan:e0ffff
Light Goldenrod Yellow:fafad2
Light Gray:d3d3d3
Light Green:90ee90
Light Pink:ffb6c1
Light Salmon:ffa07a
Light Sea Green:20b2aa
Light Sky Blue:87cefa
Light Slate Gray:778899
Light Steel Blue:b0c4de
Light Yellow:ffffe0
Lime:00ff00
Lime Green:32cd32
Linen:faf0e6
Magenta:ff00ff
Maroon:800000
Medium Aquamarine:66cdaa
Medium Blue:0000cd
Medium Orchid:ba55d3
Medium Purple:9370db
Medium Sea Green:3cb371
Medium Slate Blue:7b68ee
Medium Spring Green:00fa9a
Medium Turquoise:48d1cc
Medium Violet Red:c71585
Midnight Blue:191970
Mint Cream:f5fffa
Misty Rose:ffe4e1
Moccasin:ffe4b5
Navajo White:ffdead
Navy:000080
Old Lace:fdf5e6
Olive:808000
Olive Drab:6b8e23
Orange:ffa500
Orange Red:ff4500
Orchid:da70d6
Pale Goldenrod:eee8aa
Pale Green:98fb98
Pale Turquoise:afeeee
Pale Violet Red:db7093
Papaya Whip:ffefd5
Peach Puff:ffdab9
Peru:cd853f
Pink:ffc0cb
Plum:dda0dd
Powder Blue:b0e0e6
Purple:800080
Rebecca Purple:663399
Red:ff0000
Rosy Brown:bc8f8f
Royal Blue:4169e1
Saddle Brown:8b4513
Salmon:fa8072
Sandy Brown:f4a460
Sea Green:2e8b57
Seashell:fff5ee
Sienna:a0522d
Silver:c0c0c0
Sky Blue:87ceeb
Slate Blue:6a5acd
Slate Gray:708090
Snow:fffafa
Spring Green:00ff7f
Steel Blue:4682b4
Tan:d2b48c
Teal:008080
Thistle:d8bfd8
Tomato:ff6347
Turquoise:40e0d0
Violet:ee82ee
Wheat:f5deb3
White:ffffff
White Smoke:f5f5f5
Yellow:ffff00
Yellow Green:9acd32
`;

const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

type NamedColor = { name: string; r: number; g: number; b: number };

const NAMED_COLORS: NamedColor[] = CSS_NAMED_COLOR_TABLE.trim()
  .split("\n")
  .flatMap((line) => {
    const separator = line.indexOf(":");
    if (separator <= 0) {
      return [];
    }
    const name = line.slice(0, separator);
    const hex = line.slice(separator + 1);
    const n = Number.parseInt(hex, 16);
    if (!name || !Number.isFinite(n)) {
      return [];
    }
    return [{ name, r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }];
  });

function parseHexRgb(value: string): [number, number, number] | null {
  const match = HEX_COLOR_RE.exec(value.trim());
  const captured = match?.[1];
  if (!captured) {
    return null;
  }
  const hex =
    captured.length === 3
      ? `${captured[0]}${captured[0]}${captured[1]}${captured[1]}${captured[2]}${captured[2]}`
      : captured;
  const n = Number.parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function nearestCssColor(rgb: [number, number, number]): { name: string; dist: number } | null {
  const first = NAMED_COLORS[0];
  if (!first) {
    return null;
  }
  let bestName = first.name;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const color of NAMED_COLORS) {
    const dist =
      (rgb[0] - color.r) ** 2 + (rgb[1] - color.g) ** 2 + (rgb[2] - color.b) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      bestName = color.name;
      if (dist === 0) {
        return { name: bestName, dist };
      }
    }
  }
  return { name: bestName, dist: bestDist };
}

/** Max squared RGB distance to accept a CSS name instead of the raw hex. */
const MAX_NAMED_COLOR_DISTANCE_SQ = 40 * 40;

const COLOR_LIKE_FACET_NAME = /(?:^|[-_])colou?r(?:[-_]|$)|(?:^|[-_])finish(?:[-_]|$)/i;

/** True when a facet id looks like a color/finish attribute (`color-code`, `finish-code`). */
export function isColorLikeFacetName(name: string): boolean {
  return COLOR_LIKE_FACET_NAME.test(name.trim());
}

/** True when a facet bucket key is a CSS hex color (`#RGB` or `#RRGGBB`). */
export function isHexColorFacetKey(value: string): boolean {
  return HEX_COLOR_RE.test(value.trim());
}

/** Normalized `#rrggbb` for a hex facet key, or `undefined` when not a color. */
export function hexColorSwatchValue(value: string): string | undefined {
  const rgb = parseHexRgb(value);
  if (!rgb) {
    return undefined;
  }
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Human-readable facet chip label. Hex keys on color/finish facets become the
 * nearest CSS color name when close enough; other keys are unchanged.
 */
export function formatFacetBucketLabel(key: string, facetName?: string): string {
  if (facetName !== undefined && !isColorLikeFacetName(facetName)) {
    return key;
  }

  const rgb = parseHexRgb(key);
  if (!rgb) {
    return key;
  }

  const nearest = nearestCssColor(rgb);
  if (!nearest || nearest.dist > MAX_NAMED_COLOR_DISTANCE_SQ) {
    return key;
  }

  return nearest.name;
}
