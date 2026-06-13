import React from "react";
import { Sequence } from "remotion";
import { Audio } from "@remotion/media";

// One-shot sound effects, timed to v2 GLOBAL frames (post-crossfade offsets).
// Restraint: only 3 cues — the click, the 100% chime, the publish. URLs are the
// public @remotion/sfx library assets.
const SFX: { at: number; src: string; volume: number; label: string }[] = [
  {
    at: 74,
    src: "https://remotion.media/mouse-click.wav",
    volume: 0.5,
    label: "S2 clic « Générer le planning »",
  },
  {
    at: 742,
    src: "https://remotion.media/ding.wav",
    volume: 0.45,
    label: "S6 HealthBar atteint 100%",
  },
  {
    at: 752,
    src: "https://remotion.media/switch.wav",
    volume: 0.4,
    label: "S6 clic « Publier »",
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
