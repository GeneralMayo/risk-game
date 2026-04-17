// Extract the 42 classic-RISK territory paths from the Wikimedia Risk_board.svg
// and compute an approximate centroid for each (for token placement).
// Emits a single TypeScript file.

import fs from "node:fs";

const svg = fs.readFileSync("/tmp/risk_board.svg", "utf8");

// The countries group sits inside <g inkscape:label="countries" transform="translate(-167.99651,-118.55507)"> ... </g>
const countriesMatch = svg.match(
  /inkscape:label="countries"[\s\S]*?transform="translate\(([-0-9.]+),\s*([-0-9.]+)\)"\s*>([\s\S]*?)<\/g>\s*<g\s+inkscape:groupmode="layer"\s+id="layer5"/
);
if (!countriesMatch) {
  console.error("Couldn't find countries group");
  process.exit(1);
}
const [, txStr, tyStr, inner] = countriesMatch;
const tx = parseFloat(txStr);
const ty = parseFloat(tyStr);

// Grab each <path id="..." d="..."/> pair inside.
const paths = [];
const pathRe = /<path\b[^>]*?>/g;
let m;
while ((m = pathRe.exec(inner))) {
  const tag = m[0];
  const idMatch = tag.match(/\sid="([^"]+)"/);
  const dMatch = tag.match(/\sd="([^"]+)"/);
  if (!idMatch || !dMatch) continue;
  paths.push({ id: idMatch[1], d: dMatch[1] });
}

console.error(`found ${paths.length} paths`);

// Minimal path centroid: average of all (x,y) pairs parsed from the `d`
// attribute. This is a rough approximation but more than good enough to
// centre a troop token within each territory.
function pathCentroid(d) {
  let x = 0,
    y = 0,
    n = 0;
  // Normalise: add spaces around commas so we can tokenise
  const tokens = d
    .replace(/([MmLlHhVvCcSsQqTtAaZz])/g, " $1 ")
    .replace(/,/g, " ")
    .trim()
    .split(/\s+/);
  let cursor = "";
  let i = 0;
  let cx = 0,
    cy = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[A-Za-z]$/.test(t)) {
      cursor = t;
      i++;
      continue;
    }
    // parse values based on cursor command
    const num = parseFloat(t);
    if (isNaN(num)) {
      i++;
      continue;
    }
    // Different commands have different argument counts. For centroid purposes
    // we just accumulate all x/y pairs that reach a final point.
    switch (cursor) {
      case "M":
      case "L":
      case "T": {
        const px = num;
        const py = parseFloat(tokens[i + 1]);
        cx = px;
        cy = py;
        x += cx;
        y += cy;
        n++;
        i += 2;
        if (cursor === "M") cursor = "L";
        break;
      }
      case "m":
      case "l":
      case "t": {
        const px = num;
        const py = parseFloat(tokens[i + 1]);
        cx += px;
        cy += py;
        x += cx;
        y += cy;
        n++;
        i += 2;
        if (cursor === "m") cursor = "l";
        break;
      }
      case "H": {
        cx = num;
        x += cx;
        y += cy;
        n++;
        i += 1;
        break;
      }
      case "h": {
        cx += num;
        x += cx;
        y += cy;
        n++;
        i += 1;
        break;
      }
      case "V": {
        cy = num;
        x += cx;
        y += cy;
        n++;
        i += 1;
        break;
      }
      case "v": {
        cy += num;
        x += cx;
        y += cy;
        n++;
        i += 1;
        break;
      }
      case "C": {
        // absolute cubic: x1 y1 x2 y2 x y
        cx = parseFloat(tokens[i + 4]);
        cy = parseFloat(tokens[i + 5]);
        x += cx;
        y += cy;
        n++;
        i += 6;
        break;
      }
      case "c": {
        cx += parseFloat(tokens[i + 4]);
        cy += parseFloat(tokens[i + 5]);
        x += cx;
        y += cy;
        n++;
        i += 6;
        break;
      }
      case "S":
      case "Q": {
        cx = parseFloat(tokens[i + 2]);
        cy = parseFloat(tokens[i + 3]);
        x += cx;
        y += cy;
        n++;
        i += 4;
        break;
      }
      case "s":
      case "q": {
        cx += parseFloat(tokens[i + 2]);
        cy += parseFloat(tokens[i + 3]);
        x += cx;
        y += cy;
        n++;
        i += 4;
        break;
      }
      case "A": {
        cx = parseFloat(tokens[i + 5]);
        cy = parseFloat(tokens[i + 6]);
        x += cx;
        y += cy;
        n++;
        i += 7;
        break;
      }
      case "a": {
        cx += parseFloat(tokens[i + 5]);
        cy += parseFloat(tokens[i + 6]);
        x += cx;
        y += cy;
        n++;
        i += 7;
        break;
      }
      default:
        i++;
    }
  }
  return { cx: x / n, cy: y / n };
}

// bbox from same token stream (use min/max of cx/cy)
function pathBBox(d) {
  const tokens = d
    .replace(/([MmLlHhVvCcSsQqTtAaZz])/g, " $1 ")
    .replace(/,/g, " ")
    .trim()
    .split(/\s+/);
  let cursor = "";
  let i = 0;
  let cx = 0,
    cy = 0;
  let xmin = Infinity,
    xmax = -Infinity,
    ymin = Infinity,
    ymax = -Infinity;
  const note = () => {
    if (cx < xmin) xmin = cx;
    if (cx > xmax) xmax = cx;
    if (cy < ymin) ymin = cy;
    if (cy > ymax) ymax = cy;
  };
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[A-Za-z]$/.test(t)) {
      cursor = t;
      i++;
      continue;
    }
    const num = parseFloat(t);
    if (isNaN(num)) {
      i++;
      continue;
    }
    switch (cursor) {
      case "M":
      case "L":
      case "T":
        cx = num;
        cy = parseFloat(tokens[i + 1]);
        note();
        i += 2;
        if (cursor === "M") cursor = "L";
        break;
      case "m":
      case "l":
      case "t":
        cx += num;
        cy += parseFloat(tokens[i + 1]);
        note();
        i += 2;
        if (cursor === "m") cursor = "l";
        break;
      case "H":
        cx = num;
        note();
        i += 1;
        break;
      case "h":
        cx += num;
        note();
        i += 1;
        break;
      case "V":
        cy = num;
        note();
        i += 1;
        break;
      case "v":
        cy += num;
        note();
        i += 1;
        break;
      case "C":
        cx = parseFloat(tokens[i + 4]);
        cy = parseFloat(tokens[i + 5]);
        note();
        i += 6;
        break;
      case "c":
        cx += parseFloat(tokens[i + 4]);
        cy += parseFloat(tokens[i + 5]);
        note();
        i += 6;
        break;
      case "S":
      case "Q":
        cx = parseFloat(tokens[i + 2]);
        cy = parseFloat(tokens[i + 3]);
        note();
        i += 4;
        break;
      case "s":
      case "q":
        cx += parseFloat(tokens[i + 2]);
        cy += parseFloat(tokens[i + 3]);
        note();
        i += 4;
        break;
      case "A":
        cx = parseFloat(tokens[i + 5]);
        cy = parseFloat(tokens[i + 6]);
        note();
        i += 7;
        break;
      case "a":
        cx += parseFloat(tokens[i + 5]);
        cy += parseFloat(tokens[i + 6]);
        note();
        i += 7;
        break;
      default:
        i++;
    }
  }
  return { xmin, xmax, ymin, ymax };
}

// Fix SVG typos: yakursk -> yakutsk
const RENAME = { yakursk: "yakutsk" };

const out = paths.map(({ id, d }) => {
  const renamed = RENAME[id] ?? id;
  const { cx, cy } = pathCentroid(d);
  const bb = pathBBox(d);
  // Apply the countries-group translate so centroid ends up in the viewBox space
  // of the root SVG (instead of the local group's coords).
  return {
    id: renamed,
    d,
    cx: cx + tx,
    cy: cy + ty,
    bbox: {
      xmin: bb.xmin + tx,
      xmax: bb.xmax + tx,
      ymin: bb.ymin + ty,
      ymax: bb.ymax + ty,
    },
  };
});

// Print a concise TypeScript module
let ts = `// AUTO-GENERATED from Wikimedia Commons Risk_board.svg
// (https://upload.wikimedia.org/wikipedia/commons/4/4a/Risk_board.svg)
// Public domain. Do not edit by hand — re-run /tmp/extract_risk.mjs.

export interface SvgTerritory {
  id: string;
  d: string;
  /** Approximate centroid in root SVG viewBox coords (for token placement). */
  cx: number;
  cy: number;
  /** Bounding box in root SVG viewBox coords. */
  bbox: { xmin: number; xmax: number; ymin: number; ymax: number };
}

/** The transform applied to the countries group in the source SVG. */
export const COUNTRIES_TRANSFORM = "translate(${tx}, ${ty})";

/** Root viewBox of the source SVG (before our own framing). */
export const SVG_VIEWBOX = { width: 749.81909, height: 519.06781 };

export const SVG_TERRITORIES: SvgTerritory[] = ${JSON.stringify(
  out,
  (k, v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v),
  2
)};
`;

  const outPath = new URL("../src/data/boardSvg.ts", import.meta.url);
  fs.writeFileSync(outPath, ts);
  console.error(`wrote ${outPath.pathname} (${ts.length} bytes)`);
console.error("sample centroids:");
for (const t of out.slice(0, 5)) {
  console.error(
    `  ${t.id.padEnd(22)} cx=${t.cx.toFixed(1)} cy=${t.cy.toFixed(1)}`
  );
}
