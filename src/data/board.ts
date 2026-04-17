import type { Continent, Territory } from "./types";
import { SVG_TERRITORIES } from "./boardSvg";

export const CONTINENTS: Record<string, Continent> = {
  NA: { id: "NA", name: "North America", bonus: 5, color: "#e6b35a" },
  SA: { id: "SA", name: "South America", bonus: 2, color: "#d97b4d" },
  EU: { id: "EU", name: "Europe", bonus: 5, color: "#7fa3d8" },
  AF: { id: "AF", name: "Africa", bonus: 3, color: "#c4a269" },
  AS: { id: "AS", name: "Asia", bonus: 7, color: "#8fb87f" },
  AU: { id: "AU", name: "Australia", bonus: 2, color: "#a66cb4" },
};

/**
 * Map our internal game IDs ↔ the IDs used on the Wikimedia Risk_board.svg.
 * The SVG uses `eastern_united_states` / `western_united_states`; the rest
 * match our snake_case ids exactly. (The SVG's `yakursk` typo is fixed up
 * during extraction — see data/boardSvg.ts.)
 */
const GAME_TO_SVG: Record<string, string> = {
  eastern_us: "eastern_united_states",
  western_us: "western_united_states",
};
const SVG_TO_GAME: Record<string, string> = Object.fromEntries(
  Object.entries(GAME_TO_SVG).map(([a, b]) => [b, a])
);

export function gameIdToSvgId(id: string): string {
  return GAME_TO_SVG[id] ?? id;
}
export function svgIdToGameId(id: string): string {
  return SVG_TO_GAME[id] ?? id;
}

/**
 * Look up a token placement in root-SVG viewBox coordinates. We use the
 * midpoint of a blend between path-centroid and bounding-box center, which
 * sits reliably inside the land for irregular shapes (e.g. Alaska, Siam)
 * where the pure centroid can drift offshore.
 *
 * Per-territory manual nudges are allowed for a handful of awkward shapes
 * (narrow isthmuses, crescents) where the computed centre still misses.
 */
const NUDGES: Record<string, { dx?: number; dy?: number }> = {
  // Shifted slightly inland (values in root-SVG viewBox units)
  alaska: { dx: 6, dy: 8 },
  kamchatka: { dx: -4, dy: 0 },
  central_america: { dx: 2, dy: -2 },
  southern_europe: { dx: -3, dy: -2 },
  scandinavia: { dx: 0, dy: -3 },
  siam: { dx: -2, dy: -2 },
  indonesia: { dx: 0, dy: -2 },
  new_guinea: { dx: 3, dy: 0 },
  eastern_australia: { dx: -6, dy: -6 },
};

function centroid(gameId: string): { x: number; y: number } {
  const svgId = gameIdToSvgId(gameId);
  const t = SVG_TERRITORIES.find((s) => s.id === svgId);
  if (!t) throw new Error(`No SVG path for ${gameId} (-> ${svgId})`);
  const bx = (t.bbox.xmin + t.bbox.xmax) / 2;
  const by = (t.bbox.ymin + t.bbox.ymax) / 2;
  // Blend 45% path-centroid + 55% bbox-center — empirically more stable.
  let x = t.cx * 0.45 + bx * 0.55;
  let y = t.cy * 0.45 + by * 0.55;
  const n = NUDGES[gameId];
  if (n) {
    x += n.dx ?? 0;
    y += n.dy ?? 0;
  }
  return { x, y };
}

// 42 classic Risk territories with canonical adjacencies. Coordinates come
// from the Wikimedia SVG centroids — they stay in sync with the paths
// automatically.
const DEFS: Array<Omit<Territory, "x" | "y">> = [
  // --- NORTH AMERICA (9) ---
  { id: "alaska", name: "Alaska", continent: "NA",
    neighbors: ["northwest_territory", "alberta", "kamchatka"] },
  { id: "northwest_territory", name: "Northwest Territory", continent: "NA",
    neighbors: ["alaska", "alberta", "ontario", "greenland"] },
  { id: "greenland", name: "Greenland", continent: "NA",
    neighbors: ["northwest_territory", "ontario", "quebec", "iceland"] },
  { id: "alberta", name: "Alberta", continent: "NA",
    neighbors: ["alaska", "northwest_territory", "ontario", "western_us"] },
  { id: "ontario", name: "Ontario", continent: "NA",
    neighbors: ["northwest_territory", "greenland", "alberta", "quebec", "western_us", "eastern_us"] },
  { id: "quebec", name: "Quebec", continent: "NA",
    neighbors: ["greenland", "ontario", "eastern_us"] },
  { id: "western_us", name: "Western United States", continent: "NA",
    neighbors: ["alberta", "ontario", "eastern_us", "central_america"] },
  { id: "eastern_us", name: "Eastern United States", continent: "NA",
    neighbors: ["ontario", "quebec", "western_us", "central_america"] },
  { id: "central_america", name: "Central America", continent: "NA",
    neighbors: ["western_us", "eastern_us", "venezuela"] },

  // --- SOUTH AMERICA (4) ---
  { id: "venezuela", name: "Venezuela", continent: "SA",
    neighbors: ["central_america", "peru", "brazil"] },
  { id: "brazil", name: "Brazil", continent: "SA",
    neighbors: ["venezuela", "peru", "argentina", "north_africa"] },
  { id: "peru", name: "Peru", continent: "SA",
    neighbors: ["venezuela", "brazil", "argentina"] },
  { id: "argentina", name: "Argentina", continent: "SA",
    neighbors: ["peru", "brazil"] },

  // --- EUROPE (7) ---
  { id: "iceland", name: "Iceland", continent: "EU",
    neighbors: ["greenland", "great_britain", "scandinavia"] },
  { id: "great_britain", name: "Great Britain", continent: "EU",
    neighbors: ["iceland", "scandinavia", "northern_europe", "western_europe"] },
  { id: "scandinavia", name: "Scandinavia", continent: "EU",
    neighbors: ["iceland", "great_britain", "northern_europe", "ukraine"] },
  { id: "northern_europe", name: "Northern Europe", continent: "EU",
    neighbors: ["great_britain", "scandinavia", "ukraine", "southern_europe", "western_europe"] },
  { id: "western_europe", name: "Western Europe", continent: "EU",
    neighbors: ["great_britain", "northern_europe", "southern_europe", "north_africa"] },
  { id: "southern_europe", name: "Southern Europe", continent: "EU",
    neighbors: ["northern_europe", "ukraine", "western_europe", "north_africa", "egypt", "middle_east"] },
  { id: "ukraine", name: "Ukraine", continent: "EU",
    neighbors: ["scandinavia", "northern_europe", "southern_europe", "middle_east", "afghanistan", "ural"] },

  // --- AFRICA (6) ---
  { id: "north_africa", name: "North Africa", continent: "AF",
    neighbors: ["brazil", "western_europe", "southern_europe", "egypt", "east_africa", "congo"] },
  { id: "egypt", name: "Egypt", continent: "AF",
    neighbors: ["southern_europe", "middle_east", "north_africa", "east_africa"] },
  { id: "east_africa", name: "East Africa", continent: "AF",
    neighbors: ["egypt", "middle_east", "north_africa", "congo", "south_africa", "madagascar"] },
  { id: "congo", name: "Congo", continent: "AF",
    neighbors: ["north_africa", "east_africa", "south_africa"] },
  { id: "south_africa", name: "South Africa", continent: "AF",
    neighbors: ["congo", "east_africa", "madagascar"] },
  { id: "madagascar", name: "Madagascar", continent: "AF",
    neighbors: ["east_africa", "south_africa"] },

  // --- ASIA (12) ---
  { id: "ural", name: "Ural", continent: "AS",
    neighbors: ["ukraine", "siberia", "afghanistan", "china"] },
  { id: "siberia", name: "Siberia", continent: "AS",
    neighbors: ["ural", "yakutsk", "irkutsk", "mongolia", "china"] },
  { id: "yakutsk", name: "Yakutsk", continent: "AS",
    neighbors: ["siberia", "kamchatka", "irkutsk"] },
  { id: "kamchatka", name: "Kamchatka", continent: "AS",
    neighbors: ["yakutsk", "irkutsk", "mongolia", "japan", "alaska"] },
  { id: "irkutsk", name: "Irkutsk", continent: "AS",
    neighbors: ["siberia", "yakutsk", "kamchatka", "mongolia"] },
  { id: "mongolia", name: "Mongolia", continent: "AS",
    neighbors: ["siberia", "kamchatka", "irkutsk", "japan", "china"] },
  { id: "japan", name: "Japan", continent: "AS",
    neighbors: ["kamchatka", "mongolia"] },
  { id: "afghanistan", name: "Afghanistan", continent: "AS",
    neighbors: ["ukraine", "ural", "china", "india", "middle_east"] },
  { id: "middle_east", name: "Middle East", continent: "AS",
    neighbors: ["southern_europe", "ukraine", "egypt", "east_africa", "afghanistan", "india"] },
  { id: "india", name: "India", continent: "AS",
    neighbors: ["afghanistan", "china", "middle_east", "siam"] },
  { id: "china", name: "China", continent: "AS",
    neighbors: ["ural", "siberia", "mongolia", "afghanistan", "india", "siam"] },
  { id: "siam", name: "Siam", continent: "AS",
    neighbors: ["india", "china", "indonesia"] },

  // --- AUSTRALIA (4) ---
  { id: "indonesia", name: "Indonesia", continent: "AU",
    neighbors: ["siam", "new_guinea", "western_australia"] },
  { id: "new_guinea", name: "New Guinea", continent: "AU",
    neighbors: ["indonesia", "western_australia", "eastern_australia"] },
  { id: "western_australia", name: "Western Australia", continent: "AU",
    neighbors: ["indonesia", "new_guinea", "eastern_australia"] },
  { id: "eastern_australia", name: "Eastern Australia", continent: "AU",
    neighbors: ["new_guinea", "western_australia"] },
];

export const TERRITORIES: Territory[] = DEFS.map((d) => {
  const c = centroid(d.id);
  return { ...d, x: c.x, y: c.y };
});

export const TERRITORY_MAP: Record<string, Territory> = Object.fromEntries(
  TERRITORIES.map((t) => [t.id, t])
);

export function getContinentTerritories(continentId: string): Territory[] {
  return TERRITORIES.filter((t) => t.continent === continentId);
}

// Sanity check: all neighbor references are symmetric and point to real
// territories, and every territory has a matching SVG path.
export function validateBoard(): string[] {
  const errors: string[] = [];
  const ids = new Set(TERRITORIES.map((t) => t.id));
  for (const t of TERRITORIES) {
    for (const n of t.neighbors) {
      if (!ids.has(n)) errors.push(`${t.id} -> unknown neighbor ${n}`);
      const nb = TERRITORY_MAP[n];
      if (nb && !nb.neighbors.includes(t.id)) {
        errors.push(`${t.id} <-> ${n} not symmetric`);
      }
    }
    const svgId = gameIdToSvgId(t.id);
    if (!SVG_TERRITORIES.some((s) => s.id === svgId)) {
      errors.push(`${t.id}: missing SVG path for ${svgId}`);
    }
  }
  if (TERRITORIES.length !== 42)
    errors.push(`Expected 42 territories, got ${TERRITORIES.length}`);
  return errors;
}
