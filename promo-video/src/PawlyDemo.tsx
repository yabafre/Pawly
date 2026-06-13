import React from "react";
import { AbsoluteFill } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { C, FONT } from "./theme";
import { Scene01ColdOpen } from "./scenes/Scene01ColdOpen";
import { Scene02ExcelCollision } from "./scenes/Scene02ExcelCollision";
import { Scene03Vacuum } from "./scenes/Scene03Vacuum";
import { Scene04Declaration } from "./scenes/Scene04Declaration";
import { Scene05Differentiator } from "./scenes/Scene05Differentiator";
import { Scene06GreedyHonesty } from "./scenes/Scene06GreedyHonesty";
import { Scene07Publish } from "./scenes/Scene07Publish";
import { Scene08EmployeePwa } from "./scenes/Scene08EmployeePwa";
import { Scene09Bookend } from "./scenes/Scene09Bookend";
import { Scene10Cta } from "./scenes/Scene10Cta";
import { SfxTrack } from "./SfxTrack";

// Each scene's standalone duration (frames). Transitions overlap adjacent
// scenes, so the composition total is shorter than the sum — see TOTAL_FRAMES.
const SCENES: { dur: number; Comp: React.FC }[] = [
  { dur: 120, Comp: Scene01ColdOpen },
  { dur: 210, Comp: Scene02ExcelCollision },
  { dur: 180, Comp: Scene03Vacuum },
  { dur: 240, Comp: Scene04Declaration },
  { dur: 330, Comp: Scene05Differentiator },
  { dur: 240, Comp: Scene06GreedyHonesty },
  { dur: 210, Comp: Scene07Publish },
  { dur: 240, Comp: Scene08EmployeePwa },
  { dur: 210, Comp: Scene09Bookend },
  { dur: 240, Comp: Scene10Cta },
];

// One transition between each adjacent pair (9 total). Mostly soft crossfades;
// a single upward slide marks the desktop→mobile shift (scene 7 → 8).
type TKind = "fade" | "slideUp";
const TRANSITIONS: { d: number; kind: TKind }[] = [
  { d: 12, kind: "fade" }, // 1→2  cold open → Excel chaos
  { d: 12, kind: "fade" }, // 2→3  chaos → vacuum
  { d: 14, kind: "fade" }, // 3→4  vacuum → app
  { d: 10, kind: "fade" }, // 4→5  declaration → generation
  { d: 12, kind: "fade" }, // 5→6  generation → honesty
  { d: 12, kind: "fade" }, // 6→7  honesty → publish
  { d: 16, kind: "slideUp" }, // 7→8 desktop → mobile PWA
  { d: 14, kind: "fade" }, // 8→9  mobile → bookend
  { d: 14, kind: "fade" }, // 9→10 bookend → CTA
];

const presentationFor = (kind: TKind) =>
  kind === "slideUp" ? slide({ direction: "from-bottom" }) : fade();

// Composition length: sum of scenes minus the overlap consumed by transitions.
export const TOTAL_FRAMES =
  SCENES.reduce((s, x) => s + x.dur, 0) -
  TRANSITIONS.reduce((s, t) => s + t.d, 0); // 2220 - 116 = 2104

export const PawlyDemo: React.FC = () => (
  <AbsoluteFill style={{ background: C.warmLinen, fontFamily: FONT }}>
    <TransitionSeries>
      {SCENES.flatMap((s, i) => {
        const Comp = s.Comp;
        const nodes: React.ReactNode[] = [
          <TransitionSeries.Sequence key={`s${i}`} durationInFrames={s.dur}>
            <Comp />
          </TransitionSeries.Sequence>,
        ];
        if (i < TRANSITIONS.length) {
          const t = TRANSITIONS[i];
          nodes.push(
            <TransitionSeries.Transition
              key={`t${i}`}
              presentation={presentationFor(t.kind)}
              timing={linearTiming({ durationInFrames: t.d })}
            />,
          );
        }
        return nodes;
      })}
    </TransitionSeries>
    <SfxTrack />
  </AbsoluteFill>
);
