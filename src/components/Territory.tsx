import type { Territory as T } from "@/data/types";
import { cn } from "@/lib/utils";

interface Props {
  territory: T;
  owner: "human" | "ai" | null;
  armies: number;
  selected: boolean;
  hovered: boolean;
}

const COLORS = {
  human: "#c23b3b",
  ai: "#3b7dc2",
  neutral: "#6b6b6b",
};

/**
 * The visual troop token shown on top of the territory path. It's rendered
 * with `pointer-events: none` so clicks fall through to the underlying SVG
 * path (which is the real hit target for a territory).
 */
export function TerritoryToken({
  territory,
  owner,
  armies,
  selected,
  hovered,
}: Props) {
  const base =
    owner === "human" ? COLORS.human : owner === "ai" ? COLORS.ai : COLORS.neutral;

  // Token radius scales a bit with army count so a big stack reads heavier.
  const r = 9 + Math.min(6, armies * 0.25);
  const gid = `gt-${territory.id}`;

  return (
    <g
      className={cn(
        "territory-token pointer-events-none",
        selected && "animate-pulse-ring"
      )}
      transform={`translate(${territory.x},${territory.y})`}
    >
      <defs>
        <radialGradient id={gid} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="40%" stopColor={base} stopOpacity="1" />
          <stop offset="100%" stopColor="#140a04" stopOpacity="1" />
        </radialGradient>
      </defs>

      {/* Drop shadow under the chip */}
      <ellipse
        cx="0"
        cy={r * 0.55}
        rx={r * 0.9}
        ry={r * 0.22}
        fill="rgba(0,0,0,0.45)"
      />

      {/* Chip body */}
      <circle
        r={r}
        fill={`url(#${gid})`}
        stroke={selected ? "#facc15" : hovered ? "#fde68a" : "#140a04"}
        strokeWidth={selected ? 2.2 : hovered ? 1.6 : 1.2}
      />

      {/* Specular highlight */}
      <ellipse
        cx={-r * 0.3}
        cy={-r * 0.35}
        rx={r * 0.55}
        ry={r * 0.2}
        fill="#fff"
        opacity="0.3"
      />

      {/* Inner cream badge */}
      <circle
        r={Math.max(5.5, r * 0.62)}
        fill="#f3e3b8"
        stroke="#1a0f06"
        strokeWidth={0.8}
      />

      {/* Troop count */}
      <text
        x={0}
        y={0.6}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={Math.max(8, r * 0.78)}
        fontWeight={900}
        fill="#1c1208"
        style={{ fontFamily: "Inter, sans-serif" }}
      >
        {armies}
      </text>
    </g>
  );
}
