import React from "react";
import { AbsoluteFill } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { C, FONT } from "./theme";
import { SfxTrack } from "./SfxTrack";
import { SceneCost } from "./scenes/SceneCost";
import { SceneProof } from "./scenes/SceneProof";
import { SceneWhy } from "./scenes/SceneWhy";
import { SceneDeclare } from "./scenes/SceneDeclare";
import { SceneTruth } from "./scenes/SceneTruth";
import { SceneCalm } from "./scenes/SceneCalm";
import { SceneTeam } from "./scenes/SceneTeam";
import { ScenePromise } from "./scenes/ScenePromise";
import { SceneInvite } from "./scenes/SceneInvite";

// v2 "Le calme retrouvé" — 9 beats, gentle crossfades (content replacement on
// one calm surface). The breathing teal-wash backdrop lives inside each scene,
// so the crossfades keep the film feeling like one continuous surface.
const SCENES: { dur: number; Comp: React.FC }[] = [
  { dur: 60, Comp: SceneCost }, // 1 · Le coût
  { dur: 150, Comp: SceneProof }, // 2 · Un clic — la preuve
  { dur: 150, Comp: SceneWhy }, // 3 · Le pourquoi
  { dur: 150, Comp: SceneDeclare }, // 4 · Déclaré une fois
  { dur: 210, Comp: SceneTruth }, // 5 · La vérité
  { dur: 180, Comp: SceneCalm }, // 6 · Le calme retrouvé
  { dur: 180, Comp: SceneTeam }, // 7 · Côté équipe
  { dur: 180, Comp: ScenePromise }, // 8 · La promesse
  { dur: 300, Comp: SceneInvite }, // 9 · L'invitation
];

const TDUR = 12; // crossfade length between every pair (8 transitions)

export const TOTAL_FRAMES =
  SCENES.reduce((s, x) => s + x.dur, 0) - (SCENES.length - 1) * TDUR;

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
        if (i < SCENES.length - 1) {
          nodes.push(
            <TransitionSeries.Transition
              key={`t${i}`}
              presentation={fade()}
              timing={linearTiming({ durationInFrames: TDUR })}
            />,
          );
        }
        return nodes;
      })}
    </TransitionSeries>
    <SfxTrack />
  </AbsoluteFill>
);
