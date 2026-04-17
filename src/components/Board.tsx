import { useMemo, useState } from "react";
import {
  CONTINENTS,
  TERRITORIES,
  TERRITORY_MAP,
  gameIdToSvgId,
  svgIdToGameId,
} from "@/data/board";
import {
  COUNTRIES_TRANSFORM,
  SVG_TERRITORIES,
  SVG_VIEWBOX,
  type SvgTerritory,
} from "@/data/boardSvg";
import { TerritoryToken } from "./Territory";
import { useGameStore } from "@/state/gameStore";
import {
  getValidAttackTargets,
  getValidFortifyTargets,
} from "@/state/gameStore";
import type { TerritoryId } from "@/data/types";
import { cn } from "@/lib/utils";

const OWNER_COLORS = {
  human: "#b23535",
  ai: "#2f6fb7",
  neutral: "#7a6f5a",
};

const OWNER_STROKE = {
  human: "#5a1818",
  ai: "#13325a",
  neutral: "#3a2d1a",
};

/** Base continent tint painted under the ownership colour. */
function continentTint(gameId: string): string {
  const cont = TERRITORY_MAP[gameId]?.continent;
  switch (cont) {
    case "NA":
      return "#d9b275";
    case "SA":
      return "#d08b58";
    case "EU":
      return "#b6ae86";
    case "AF":
      return "#cfa36a";
    case "AS":
      return "#adc27b";
    case "AU":
      return "#c39acf";
    default:
      return "#d9b275";
  }
}

export function Board({
  onTerritoryClick,
  aiActing = false,
}: {
  onTerritoryClick: (id: TerritoryId) => void;
  aiActing?: boolean;
}) {
  const state = useGameStore();
  const { board, selectedTerritory, phase, currentPlayer, lastBattle } = state;
  const [hover, setHover] = useState<TerritoryId | null>(null);

  // Deduped adjacency edges (centroid-to-centroid lines)
  const edges = useMemo(() => {
    const out: Array<{ a: string; b: string }> = [];
    const seen = new Set<string>();
    for (const t of TERRITORIES) {
      for (const n of t.neighbors) {
        const key = [t.id, n].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ a: t.id, b: n });
      }
    }
    return out;
  }, []);

  const validTargets = useMemo(() => {
    if (!selectedTerritory) return new Set<string>();
    if (phase === "attack" && board.owner[selectedTerritory] === currentPlayer) {
      return new Set(getValidAttackTargets(state, selectedTerritory));
    }
    if (phase === "fortify" && board.owner[selectedTerritory] === currentPlayer) {
      return new Set(getValidFortifyTargets(state, selectedTerritory));
    }
    return new Set<string>();
  }, [state, selectedTerritory, phase, currentPlayer, board]);

  const hoveredTerritory = hover ? TERRITORY_MAP[hover] : null;
  const hoveredArmies = hover ? board.armies[hover] : 0;
  const hoveredOwner = hover ? board.owner[hover] : null;

  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden rounded-lg border border-wood/60 shadow-2xl transition-[filter] duration-300",
        aiActing && "brightness-[0.78] saturate-[0.9]"
      )}
    >
      <svg
        viewBox={`0 0 ${SVG_VIEWBOX.width} ${SVG_VIEWBOX.height}`}
        className={cn(
          "block h-full w-full select-none transition-[filter] duration-300",
          aiActing && "pointer-events-none"
        )}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Arrow marker for last-battle attack line */}
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="10"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="#ef4444" />
          </marker>

          {/* Deep ocean */}
          <radialGradient id="ocean-glow" cx="50%" cy="50%" r="70%">
            <stop offset="0%" stopColor="#1c5345" />
            <stop offset="60%" stopColor="#0f3d2e" />
            <stop offset="100%" stopColor="#07221a" />
          </radialGradient>
          <pattern
            id="waves"
            x="0"
            y="0"
            width="30"
            height="15"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 7 Q 7.5 1.5 15 7 T 30 7"
              stroke="rgba(140, 200, 180, 0.06)"
              strokeWidth="0.6"
              fill="none"
            />
          </pattern>

          {/* Parchment texture used as base layer on every territory */}
          <pattern
            id="parchment"
            x="0"
            y="0"
            width="100"
            height="100"
            patternUnits="userSpaceOnUse"
          >
            <rect width="100" height="100" fill="#ead4a2" />
            <circle cx="18" cy="28" r="16" fill="#d8bd83" opacity="0.35" />
            <circle cx="72" cy="62" r="20" fill="#c9a75e" opacity="0.3" />
            <circle cx="42" cy="88" r="10" fill="#b78e4a" opacity="0.25" />
          </pattern>

          {/* Soft drop shadow under the whole landmass */}
          <filter
            id="land-shadow"
            x="-5%"
            y="-5%"
            width="110%"
            height="110%"
          >
            <feGaussianBlur in="SourceAlpha" stdDeviation="1.4" />
            <feOffset dx="1" dy="2" result="offsetblur" />
            <feFlood floodColor="#000" floodOpacity="0.55" />
            <feComposite in2="offsetblur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Glow used for selected / hovered territories */}
          <filter id="glow-gold">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feFlood floodColor="#facc15" floodOpacity="0.9" />
            <feComposite in2="b" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glow-red">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feFlood floodColor="#ef4444" floodOpacity="0.9" />
            <feComposite in2="b" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Ocean base */}
        <rect
          x="0"
          y="0"
          width={SVG_VIEWBOX.width}
          height={SVG_VIEWBOX.height}
          fill="url(#ocean-glow)"
        />
        <rect
          x="0"
          y="0"
          width={SVG_VIEWBOX.width}
          height={SVG_VIEWBOX.height}
          fill="url(#waves)"
        />

        {/* Subtle lat/long grid */}
        <g opacity="0.07" stroke="rgba(233, 220, 193, 0.35)" strokeWidth="0.3">
          {Array.from({ length: 10 }).map((_, i) => (
            <line
              key={`lon-${i}`}
              x1={(SVG_VIEWBOX.width / 10) * i}
              y1={0}
              x2={(SVG_VIEWBOX.width / 10) * i}
              y2={SVG_VIEWBOX.height}
            />
          ))}
          {Array.from({ length: 6 }).map((_, i) => (
            <line
              key={`lat-${i}`}
              x1={0}
              y1={(SVG_VIEWBOX.height / 6) * i}
              x2={SVG_VIEWBOX.width}
              y2={(SVG_VIEWBOX.height / 6) * i}
            />
          ))}
        </g>

        {/* Landmasses: two-pass render — parchment base, then ownership tint. */}
        <g transform={COUNTRIES_TRANSFORM} filter="url(#land-shadow)">
          {/* Base parchment fill for every territory */}
          {SVG_TERRITORIES.map((t) => (
            <path
              key={`b-${t.id}`}
              d={t.d}
              fill="url(#parchment)"
              stroke="none"
            />
          ))}
          {/* Continent tint layer (low opacity) */}
          {SVG_TERRITORIES.map((t) => {
            const gameId = svgIdToGameId(t.id);
            return (
              <path
                key={`c-${t.id}`}
                d={t.d}
                fill={continentTint(gameId)}
                fillOpacity={0.38}
                stroke="none"
              />
            );
          })}
        </g>

        {/* Interactive ownership layer + territory borders */}
        <g transform={COUNTRIES_TRANSFORM}>
          {SVG_TERRITORIES.map((t) => {
            const gameId = svgIdToGameId(t.id);
            const owner = board.owner[gameId];
            const isSelected = selectedTerritory === gameId;
            const isTarget = validTargets.has(gameId);
            const isHover = hover === gameId;
            const fill =
              owner === "human"
                ? OWNER_COLORS.human
                : owner === "ai"
                  ? OWNER_COLORS.ai
                  : "transparent";
            const strokeCol =
              owner === "human"
                ? OWNER_STROKE.human
                : owner === "ai"
                  ? OWNER_STROKE.ai
                  : OWNER_STROKE.neutral;
            return (
              <path
                key={t.id}
                id={`territory-${gameId}`}
                d={t.d}
                fill={owner ? fill : "#e6d3a0"}
                fillOpacity={
                  isSelected ? 0.82 : isHover ? 0.68 : owner ? 0.5 : 0.001
                }
                stroke={isSelected ? "#facc15" : isTarget ? "#ef4444" : strokeCol}
                strokeWidth={isSelected || isTarget ? 2 : 0.9}
                strokeLinejoin="round"
                pointerEvents="all"
                className={cn(
                  "cursor-pointer transition-[fill-opacity,stroke] duration-150",
                  isSelected && "drop-shadow-[0_0_10px_rgba(250,204,21,0.9)]",
                  isTarget && "drop-shadow-[0_0_8px_rgba(239,68,68,0.9)]"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onTerritoryClick(gameId);
                }}
                onMouseEnter={() => setHover(gameId)}
                onMouseLeave={() =>
                  setHover((h) => (h === gameId ? null : h))
                }
              />
            );
          })}
        </g>

        {/* Adjacency lines (centroid-to-centroid, dashed, faint) */}
        <g pointerEvents="none">
          {edges.map((e, idx) => {
            const ta = TERRITORY_MAP[e.a];
            const tb = TERRITORY_MAP[e.b];
            if (!ta || !tb) return null;
            const wrap = Math.abs(ta.x - tb.x) > SVG_VIEWBOX.width * 0.55;
            if (wrap) {
              // Kamchatka ↔ Alaska wrap-around — draw two short stubs to the
              // map edges so the connection is still legible.
              const leftNode = ta.x < tb.x ? ta : tb;
              const rightNode = ta.x < tb.x ? tb : ta;
              return (
                <g key={idx}>
                  <line
                    className="connection-line"
                    x1={leftNode.x}
                    y1={leftNode.y}
                    x2={-6}
                    y2={leftNode.y}
                  />
                  <line
                    className="connection-line"
                    x1={rightNode.x}
                    y1={rightNode.y}
                    x2={SVG_VIEWBOX.width + 6}
                    y2={rightNode.y}
                  />
                </g>
              );
            }
            return (
              <line
                key={idx}
                className="connection-line"
                x1={ta.x}
                y1={ta.y}
                x2={tb.x}
                y2={tb.y}
              />
            );
          })}
        </g>

        {/* Attack preview arrow: selected (attack phase) → valid target on hover */}
        {phase === "attack" &&
          selectedTerritory &&
          hover &&
          validTargets.has(hover) && (
            <line
              className="attack-arrow"
              x1={TERRITORY_MAP[selectedTerritory].x}
              y1={TERRITORY_MAP[selectedTerritory].y}
              x2={TERRITORY_MAP[hover].x}
              y2={TERRITORY_MAP[hover].y}
            />
          )}

        {/* Last battle arrow */}
        {lastBattle && Date.now() - lastBattle.timestamp < 2500 && (
          <line
            className="attack-arrow"
            x1={TERRITORY_MAP[lastBattle.from].x}
            y1={TERRITORY_MAP[lastBattle.from].y}
            x2={TERRITORY_MAP[lastBattle.to].x}
            y2={TERRITORY_MAP[lastBattle.to].y}
          />
        )}

        {/* Troop tokens (+ invisible click target so the chip itself is
            clickable even if it sits on the edge of an irregular land shape) */}
        {TERRITORIES.map((t) => (
          <g key={t.id}>
            <circle
              cx={t.x}
              cy={t.y}
              r={16}
              fill="transparent"
              pointerEvents="all"
              className="cursor-pointer"
              onClick={(e) => {
                e.stopPropagation();
                onTerritoryClick(t.id);
              }}
              onMouseEnter={() => setHover(t.id)}
              onMouseLeave={() =>
                setHover((h) => (h === t.id ? null : h))
              }
            />
            <TerritoryToken
              territory={t}
              owner={board.owner[t.id]}
              armies={board.armies[t.id]}
              selected={selectedTerritory === t.id}
              hovered={hover === t.id}
            />
          </g>
        ))}

        {/* Continent labels in ocean */}
        {[
          { id: "NA", x: 80, y: 30 },
          { id: "SA", x: 155, y: 365 },
          { id: "EU", x: 355, y: 30 },
          { id: "AF", x: 340, y: 270 },
          { id: "AS", x: 480, y: 30 },
          { id: "AU", x: 580, y: 315 },
        ].map(({ id, x, y }) => {
          const c = CONTINENTS[id];
          return (
            <g key={id} pointerEvents="none">
              <text
                x={x}
                y={y}
                fontSize={11}
                fontWeight={700}
                fill="#e9dcc1"
                opacity={0.55}
                style={{
                  fontFamily: "Cinzel, serif",
                  letterSpacing: 2,
                }}
              >
                {c.name.toUpperCase()} · +{c.bonus}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Transparent click-absorbing layer during AI turn so any stray click
          on the map feels like a soft "no-op" rather than a silent failure. */}
      {aiActing && (
        <button
          type="button"
          aria-label="AI is taking their turn"
          onClick={() =>
            useGameStore.getState().showHint("AI's turn — please wait.", "info")
          }
          className="absolute inset-0 z-[5] cursor-not-allowed bg-transparent"
        />
      )}

      {/* Pill tooltip, always at the top of the board — never covers the map */}
      {hoveredTerritory && !aiActing && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 animate-fade-in">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-[#140a04]/90 px-3 py-1 text-xs shadow-lg backdrop-blur-sm">
            <span
              className="h-2 w-2 rounded-full"
              style={{
                background:
                  hoveredOwner === "human"
                    ? "#c23b3b"
                    : hoveredOwner === "ai"
                      ? "#3b7dc2"
                      : "#666",
              }}
            />
            <span
              className="font-display tracking-widest text-accent"
              style={{ letterSpacing: 1.4 }}
            >
              {hoveredTerritory.name}
            </span>
            <span className="text-muted-foreground">
              {hoveredArmies} {hoveredArmies === 1 ? "army" : "armies"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// (Internally referenced for bundling)
export type { SvgTerritory };
export { gameIdToSvgId };
