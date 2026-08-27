import "./index.css";
import { Composition } from "remotion";
import { PawlyDemo, TOTAL_FRAMES } from "./PawlyDemo";

// ~70s @ 30fps, 1920×1080. Duration is derived from the scenes minus
// transition overlaps (TOTAL_FRAMES), so it stays in sync automatically.
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="pawly-design-partner"
        component={PawlyDemo}
        durationInFrames={TOTAL_FRAMES}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
