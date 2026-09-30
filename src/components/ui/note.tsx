import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Embedded, resolution-independent SVG noise pattern for genuine paper tooth/grain
const PAPER_NOISE_SVG = `data:image/svg+xml;utf8,<svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg"><filter id="noiseFilter"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.28 0"/></filter><rect width="100%" height="100%" filter="url(%23noiseFilter)"/></svg>`;

export type NoteVariant =
  | "yellow"
  | "amber"
  | "cream"
  | "white"
  | "blue"
  | "green"
  | "rose"
  | "purple"
  | "zinc";

export type NoteCorner = "folded" | "curl" | "round" | "cut" | "none";
export type FoldPosition = "top-right" | "bottom-right" | "top-left" | "bottom-left";
export type NoteElevation = "none" | "flat" | "low" | "medium" | "high";
export type NotePattern = "none" | "ruled" | "grid" | "dots";
export type NoteFont = "sans" | "handwriting" | "marker" | "mono";

const VARIANT_HEX_MAP: Record<NoteVariant, { light: string; dark: string; border: string }> = {
  yellow: { light: "#fef08a", dark: "#713f12", border: "rgba(234, 179, 8, 0.4)" },
  amber:  { light: "#fef3c7", dark: "#78350f", border: "rgba(245, 158, 11, 0.35)" },
  cream:  { light: "#fdfcf7", dark: "#202024", border: "rgba(120, 113, 108, 0.25)" },
  white:  { light: "#ffffff", dark: "#18181b", border: "rgba(0, 0, 0, 0.12)" },
  blue:   { light: "#e0f2fe", dark: "#0c4a6e", border: "rgba(56, 189, 248, 0.35)" },
  green:  { light: "#dcfce7", dark: "#14532d", border: "rgba(74, 222, 128, 0.35)" },
  rose:   { light: "#ffe4e6", dark: "#881337", border: "rgba(251, 113, 133, 0.35)" },
  purple: { light: "#f3e8ff", dark: "#581c87", border: "rgba(192, 132, 252, 0.35)" },
  zinc:   { light: "#f4f4f5", dark: "#27272a", border: "rgba(113, 113, 122, 0.3)" },
};

function isColorDark(hexColor?: string): boolean {
  if (!hexColor || !hexColor.startsWith("#")) return false;
  let hex = hexColor.replace("#", "");
  if (hex.length === 3) {
    hex = hex.split("").map((c) => c + c).join("");
  }
  if (hex.length !== 6) return false;
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq < 130;
}

const noteVariants = cva(
  "relative group/note transition-all text-left",
  {
    variants: {
      variant: {
        yellow:
          "bg-[#fef08a] text-[#422006] dark:bg-[#713f12] dark:text-[#fef08a] border-amber-300/70 dark:border-amber-600/40",
        amber:
          "bg-[#fef3c7] text-[#451a03] dark:bg-[#78350f] dark:text-[#fef3c7] border-amber-200/80 dark:border-amber-700/40",
        cream:
          "bg-[#fdfcf7] text-[#292524] dark:bg-[#202024] dark:text-[#f5f5f4] border-stone-200/90 dark:border-white/10",
        white:
          "bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 border-zinc-200/90 dark:border-white/12",
        blue:
          "bg-[#e0f2fe] text-[#082f49] dark:bg-[#0c4a6e] dark:text-[#e0f2fe] border-sky-200/80 dark:border-sky-600/40",
        green:
          "bg-[#dcfce7] text-[#052e16] dark:bg-[#14532d] dark:text-[#dcfce7] border-emerald-200/80 dark:border-emerald-600/40",
        rose:
          "bg-[#ffe4e6] text-[#4c0519] dark:bg-[#881337] dark:text-[#ffe4e6] border-rose-200/80 dark:border-rose-700/40",
        purple:
          "bg-[#f3e8ff] text-[#3b0764] dark:bg-[#581c87] dark:text-[#f3e8ff] border-purple-200/80 dark:border-purple-700/40",
        zinc:
          "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 border-zinc-300/70 dark:border-zinc-700/50",
      },
      elevation: {
        none: "",
        flat: "shadow-xs",
        low: "shadow-[0_1px_2px_rgba(0,0,0,0.06),0_2px_6px_rgba(0,0,0,0.04)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.35)]",
        medium:
          "shadow-[0_1px_3px_rgba(0,0,0,0.06),0_6px_16px_-2px_rgba(0,0,0,0.08),0_2px_4px_-1px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.5)]",
        high:
          "shadow-[0_4px_6px_-1px_rgba(0,0,0,0.08),0_16px_32px_-4px_rgba(0,0,0,0.14),0_6px_12px_-2px_rgba(0,0,0,0.06)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.6)]",
      },
    },
    defaultVariants: {
      variant: "yellow",
      elevation: "medium",
    },
  }
);

export interface NoteProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof noteVariants> {
  /**
   * Custom solid background color (e.g. "#fef08a", "#ffec99", "rgb(255, 240, 200)").
   * Overrides preset variant background.
   */
  bg?: string;
  /**
   * Custom text color (e.g. "#1e293b"). Defaults to high-contrast matching color.
   */
  textColor?: string;
  /**
   * Corner style like real paper:
   * - "folded": Dog-ear paper fold with 3D flap and shadow
   * - "curl": 3D lifted paper curl shadow at bottom corner
   * - "round": Soft organic rounded corners
   * - "cut": Subtle angled paper corners
   * - "none": Sharp crisp rectangular corners
   */
  corner?: NoteCorner;
  /**
   * Which corner to fold when corner="folded" (default: "top-right")
   */
  foldPosition?: FoldPosition;
  /**
   * Fold size in pixels (default: 26)
   */
  foldSize?: number;
  /**
   * Whether to display tactile paper noise background texture (default: true)
   */
  noise?: boolean;
  /**
   * Paper noise texture intensity ("subtle" | "medium" | "high", default: "medium")
   */
  noiseIntensity?: "subtle" | "medium" | "high";
  /**
   * Custom paper noise opacity (0.0 to 1.0)
   */
  noiseOpacity?: number;
  /**
   * Paper texture pattern: "none", "ruled" (notebook lines), "grid", or "dots" (default: "none")
   */
  pattern?: NotePattern;
  /**
   * Show decorative washi tape (boolean or config object)
   */
  tape?: boolean | { color?: string; position?: "top" | "top-left" | "top-right" };
  /**
   * Show decorative thumbtack / pin (boolean or config object)
   */
  pin?: boolean | { color?: string };
}

export const Note = React.forwardRef<HTMLDivElement, NoteProps>(
  (
    {
      className,
      variant = "yellow",
      elevation = "medium",
      bg,
      textColor,
      corner = "folded",
      foldPosition = "top-right",
      foldSize = 26,
      noise = true,
      noiseIntensity = "medium",
      noiseOpacity,
      pattern = "none",
      tape,
      pin,
      style,
      children,
      ...props
    },
    ref
  ) => {
    const isCustomBg = Boolean(bg);
    const customDark = isCustomBg ? isColorDark(bg) : false;

    // Effective noise opacity
    const effectiveNoiseOpacity =
      noiseOpacity ??
      (noiseIntensity === "subtle" ? 0.04 : noiseIntensity === "high" ? 0.12 : 0.07);

    // Compute surface clip-path and flap geometries for folded corner
    const { surfaceClipPath, flapPositionStyle, flapClipPath, flapShadow, flapGradient } =
      React.useMemo(() => {
        if (corner !== "folded") {
          return {
            surfaceClipPath: undefined,
            flapPositionStyle: {},
            flapClipPath: undefined,
            flapShadow: undefined,
            flapGradient: undefined,
          };
        }

        const s = foldSize;

        switch (foldPosition) {
          case "top-right":
            return {
              surfaceClipPath: `polygon(0 0, calc(100% - ${s}px) 0, 100% ${s}px, 100% 100%, 0 100%)`,
              flapPositionStyle: { top: 0, right: 0, width: `${s}px`, height: `${s}px` },
              flapClipPath: "polygon(0 0, 0 100%, 100% 100%)",
              flapShadow: "drop-shadow(-2px 3px 2px rgba(0, 0, 0, 0.16))",
              flapGradient:
                "linear-gradient(225deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.06) 45%, rgba(255,255,255,0.25) 100%)",
            };
          case "bottom-right":
            return {
              surfaceClipPath: `polygon(0 0, 100% 0, 100% calc(100% - ${s}px), calc(100% - ${s}px) 100%, 0 100%)`,
              flapPositionStyle: { bottom: 0, right: 0, width: `${s}px`, height: `${s}px` },
              flapClipPath: "polygon(0 0, 100% 0, 0 100%)",
              flapShadow: "drop-shadow(-2px -3px 2px rgba(0, 0, 0, 0.16))",
              flapGradient:
                "linear-gradient(135deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.06) 45%, rgba(255,255,255,0.25) 100%)",
            };
          case "top-left":
            return {
              surfaceClipPath: `polygon(0 ${s}px, ${s}px 0, 100% 0, 100% 100%, 0 100%)`,
              flapPositionStyle: { top: 0, left: 0, width: `${s}px`, height: `${s}px` },
              flapClipPath: "polygon(100% 0, 0 100%, 100% 100%)",
              flapShadow: "drop-shadow(2px 3px 2px rgba(0, 0, 0, 0.16))",
              flapGradient:
                "linear-gradient(315deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.06) 45%, rgba(255,255,255,0.25) 100%)",
            };
          case "bottom-left":
            return {
              surfaceClipPath: `polygon(0 0, 100% 0, 100% 100%, ${s}px 100%, 0 calc(100% - ${s}px))`,
              flapPositionStyle: { bottom: 0, left: 0, width: `${s}px`, height: `${s}px` },
              flapClipPath: "polygon(0 0, 100% 0, 100% 100%)",
              flapShadow: "drop-shadow(2px -3px 2px rgba(0, 0, 0, 0.16))",
              flapGradient:
                "linear-gradient(45deg, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.06) 45%, rgba(255,255,255,0.25) 100%)",
            };
        }
      }, [corner, foldPosition, foldSize]);

    // Background color for the folded underside flap
    const flapBaseColor = React.useMemo(() => {
      if (bg) return bg;
      const v = (variant as NoteVariant) || "yellow";
      return VARIANT_HEX_MAP[v]?.light || "#fef08a";
    }, [bg, variant]);

    // Pattern background styling
    const patternStyle: React.CSSProperties | undefined = React.useMemo(() => {
      if (pattern === "ruled") {
        return {
          backgroundImage:
            "repeating-linear-gradient(transparent, transparent 23px, rgba(0, 0, 0, 0.08) 23px, rgba(0, 0, 0, 0.08) 24px)",
          backgroundSize: "100% 24px",
        };
      }
      if (pattern === "grid") {
        return {
          backgroundImage:
            "linear-gradient(to right, rgba(0, 0, 0, 0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(0, 0, 0, 0.06) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        };
      }
      if (pattern === "dots") {
        return {
          backgroundImage: "radial-gradient(rgba(0, 0, 0, 0.1) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        };
      }
      return undefined;
    }, [pattern]);

    return (
      <div
        ref={ref}
        data-slot="note"
        className={cn(
          noteVariants({ variant: isCustomBg ? undefined : variant, elevation }),
          corner === "round" && "rounded-2xl border",
          corner === "cut" && "rounded-sm border",
          corner === "none" && "rounded-none border",
          corner === "folded" && "rounded-sm",
          corner === "curl" && "rounded-xl border",
          className
        )}
        style={{
          ...(isCustomBg
            ? {
                backgroundColor: bg,
                color: textColor || (customDark ? "#fafafa" : "#18181b"),
                borderColor: customDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)",
              }
            : textColor
            ? { color: textColor }
            : {}),
          ...style,
        }}
        {...props}
      >
        {/* Curled Paper Corner Lift Shadow (corner="curl") */}
        {corner === "curl" && (
          <div
            className="pointer-events-none absolute -bottom-1.5 right-2 h-6 w-2/5 -rotate-2 rounded-[50%] bg-black/25 blur-[4px] dark:bg-black/60 transition-all select-none"
            aria-hidden="true"
          />
        )}

        {/* Paper Surface Shell with Clipping */}
        <div
          className="relative z-1 w-full h-full rounded-[inherit] overflow-hidden"
          style={{
            clipPath: surfaceClipPath,
          }}
        >
          {/* Optional Ruled / Grid / Dot Grid Pattern Overlay */}
          {pattern !== "none" && patternStyle && (
            <div
              className="pointer-events-none absolute inset-0 z-0 opacity-80 select-none"
              style={patternStyle}
              aria-hidden="true"
            />
          )}

          {/* Authentic Tactile Paper Noise Texture */}
          {noise && (
            <div
              className="pointer-events-none absolute inset-0 z-0 select-none mix-blend-multiply dark:mix-blend-overlay"
              style={{
                backgroundImage: `url("${PAPER_NOISE_SVG}")`,
                backgroundRepeat: "repeat",
                backgroundSize: "160px 160px",
                opacity: effectiveNoiseOpacity,
              }}
              aria-hidden="true"
            />
          )}

          {/* Children container with default comfortable note padding */}
          <div className="relative z-2 p-5">{children}</div>
        </div>

        {/* 3D Folded Dog-Ear Flap (corner="folded") */}
        {corner === "folded" && (
          <div
            className="pointer-events-none absolute z-10 select-none"
            style={flapPositionStyle}
            aria-hidden="true"
          >
            <div
              className="w-full h-full"
              style={{
                clipPath: flapClipPath,
                backgroundColor: flapBaseColor,
                backgroundImage: flapGradient,
                filter: flapShadow,
              }}
            />
          </div>
        )}

        {/* Decorative Washi Tape */}
        {tape && (
          <NoteTape
            color={typeof tape === "object" ? tape.color : undefined}
            position={typeof tape === "object" ? tape.position : "top"}
          />
        )}

        {/* Decorative Pushpin */}
        {pin && (
          <NotePin color={typeof pin === "object" ? pin.color : undefined} />
        )}
      </div>
    );
  }
);
Note.displayName = "Note";

/* =========================================================================
   Compound Subcomponents: NoteHeader, NoteTitle, NoteDescription, NoteContent, NoteFooter
   ========================================================================= */

export const NoteHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="note-header"
    className={cn("flex items-start justify-between gap-3 pb-3 select-none", className)}
    {...props}
  />
));
NoteHeader.displayName = "NoteHeader";

export interface NoteTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  font?: NoteFont;
}

export const NoteTitle = React.forwardRef<HTMLHeadingElement, NoteTitleProps>(
  ({ className, font = "marker", style, ...props }, ref) => {
    const fontStyle = React.useMemo(() => {
      switch (font) {
        case "marker":
          return { fontFamily: "'Shantell Sans', cursive, sans-serif" };
        case "handwriting":
          return { fontFamily: "'Caveat', cursive, sans-serif", fontSize: "1.25rem" };
        case "mono":
          return { fontFamily: "monospace" };
        case "sans":
        default:
          return {};
      }
    }, [font]);

    return (
      <h3
        ref={ref}
        data-slot="note-title"
        className={cn("text-base font-semibold leading-snug tracking-tight", className)}
        style={{ ...fontStyle, ...style }}
        {...props}
      />
    );
  }
);
NoteTitle.displayName = "NoteTitle";

export const NoteDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    data-slot="note-description"
    className={cn("text-xs opacity-75 leading-relaxed", className)}
    {...props}
  />
));
NoteDescription.displayName = "NoteDescription";

export const NoteContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="note-content"
    className={cn("text-sm leading-relaxed", className)}
    {...props}
  />
));
NoteContent.displayName = "NoteContent";

export const NoteFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-slot="note-footer"
    className={cn("flex items-center justify-between pt-3 mt-3 border-t border-black/10 dark:border-white/10 text-xs opacity-80", className)}
    {...props}
  />
));
NoteFooter.displayName = "NoteFooter";

/* =========================================================================
   Accents: NoteTape, NotePin
   ========================================================================= */

export interface NoteTapeProps extends React.HTMLAttributes<HTMLDivElement> {
  color?: string;
  position?: "top" | "top-left" | "top-right";
}

export function NoteTape({
  color = "rgba(255, 255, 255, 0.55)",
  position = "top",
  className,
  style,
  ...props
}: NoteTapeProps) {
  const positionClasses = {
    top: "top-[-10px] left-1/2 -translate-x-1/2 -rotate-1",
    "top-left": "top-[-8px] left-3 -rotate-6",
    "top-right": "top-[-8px] right-3 rotate-6",
  }[position];

  return (
    <div
      data-slot="note-tape"
      className={cn(
        "pointer-events-none absolute z-20 h-5 w-24 rounded-xs backdrop-blur-[2px] shadow-[0_1px_3px_rgba(0,0,0,0.12)] border-y border-white/40 select-none",
        positionClasses,
        className
      )}
      style={{
        backgroundColor: color,
        ...style,
      }}
      aria-hidden="true"
      {...props}
    />
  );
}

export interface NotePinProps extends React.HTMLAttributes<HTMLDivElement> {
  color?: string;
}

export function NotePin({ color = "#ef4444", className, style, ...props }: NotePinProps) {
  return (
    <div
      data-slot="note-pin"
      className={cn(
        "pointer-events-none absolute -top-2.5 left-1/2 -translate-x-1/2 z-20 flex items-center justify-center select-none",
        className
      )}
      aria-hidden="true"
      {...props}
    >
      {/* 3D Pushpin head */}
      <div
        className="size-4 rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.28),inset_0_1px_1px_rgba(255,255,255,0.6)] border border-black/15 flex items-center justify-center"
        style={{
          backgroundColor: color,
          ...style,
        }}
      >
        <div className="size-1.5 rounded-full bg-white/70" />
      </div>
      {/* Subtle metallic needle shadow cast below */}
      <div className="absolute top-3.5 left-1/2 -translate-x-1/2 w-0.5 h-1.5 bg-black/30 blur-[0.5px]" />
    </div>
  );
}
