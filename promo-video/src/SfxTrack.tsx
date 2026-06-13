import React from "react";
import { Sequence } from "remotion";
import { Audio } from "@remotion/media";

// One-shot sound effects, timed to the composition's GLOBAL frames
// (already accounting for the transition overlaps in PawlyDemo).
// URLs are the public @remotion/sfx library assets.
const SFX: { at: number; src: string; volume: number; label: string }[] = [
  {
    at: 278,
    src: "https://remotion.media/whip.wav",
    volume: 0.5,
    label: "S2 collision École↔Clinique",
  },
  {
    at: 732,
    src: "https://remotion.media/mouse-click.wav",
    volume: 0.6,
    label: "S5 clic « Générer le planning »",
  },
  {
    at: 1328,
    src: "https://remotion.media/ding.wav",
    volume: 0.5,
    label: "S7 HealthBar atteint 100%",
  },
  {
    at: 1378,
    src: "https://remotion.media/switch.wav",
    volume: 0.5,
    label: "S7 clic « Publier »",
  },
  {
    at: 1438,
    src: "https://remotion.media/whoosh.wav",
    volume: 0.45,
    label: "S7→S8 slide desktop→mobile",
  },
];

export const SfxTrack: React.FC = () => (
  <>
    {SFX.map((s, i) => (
      <Sequence key={i} from={s.at}>
        <Audio src={s.src} volume={s.volume} />
      </Sequence>
    ))}
  </>
);
