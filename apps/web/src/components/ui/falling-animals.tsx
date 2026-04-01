"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type FallingAnimalsProps = React.ComponentProps<"div"> & {
  color?: string;
  speed?: number;
  size?: number;
  gap?: number;
};

// 12 animal silhouettes (16x16 viewBox)
const ANIMALS: string[] = [
  // Dog
  "M8 1C6.9 1 6 1.9 6 3v1H4.5C3.7 4 3 4.7 3 5.5V7c0 .3.1.6.3.8L5 9.5V14c0 .6.4 1 1 1h4c.6 0 1-.4 1-1V9.5l1.7-1.7c.2-.2.3-.5.3-.8V5.5C13 4.7 12.3 4 11.5 4H10V3c0-1.1-.9-2-2-2z",
  // Cat
  "M4 2l2 3h4l2-3v6c0 2.8-1.8 5.2-4 5.9-2.2-.7-4-3.1-4-5.9V2zm2 7c.6 0 1-.4 1-1s-.4-1-1-1-1 .4-1 1 .4 1 1 1zm4 0c.6 0 1-.4 1-1s-.4-1-1-1-1 .4-1 1 .4 1 1 1z",
  // Bird
  "M13 3c-1.7 0-3 1.3-3 3 0 .3 0 .6.1.9L7 9H4c-1.1 0-2 .9-2 2s.9 2 2 2h1l2 2h3v-2.1c1.7-.4 3-2 3-3.9 0-.3 0-.6-.1-.9L14 7h-1c0-1.7-1.3-3-3-3h3zm0 4c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1z",
  // Fish
  "M12 4C8.7 4 4 6.7 4 8s4.7 4 8 4c1 0 1.9-.1 2.7-.4L12 8l2.7-3.6C13.9 4.1 13 4 12 4zm1 3c.6 0 1 .4 1 1s-.4 1-1 1-1-.4-1-1 .4-1 1-1zM2 6l2 2-2 2V6z",
  // Rabbit
  "M6 2C5.4 2 5 2.9 5 4v2c-.6.3-1 1-1 1.7V11c0 1.7 1.3 3 3 3h2c1.7 0 3-1.3 3-3V7.7c0-.7-.4-1.4-1-1.7V4c0-1.1-.4-2-1-2-.5 0-1 .5-1 1.5V4H7V3.5C7 2.5 6.5 2 6 2zm0 8c.6 0 1-.4 1-1s-.4-1-1-1-1 .4-1 1 .4 1 1 1zm4 0c.6 0 1-.4 1-1s-.4-1-1-1-1 .4-1 1 .4 1 1 1z",
  // Turtle
  "M8 3C5.2 3 3 5.2 3 8c0 2 1.2 3.7 3 4.5V14h1v-1.1c.3.1.7.1 1 .1s.7 0 1-.1V14h1v-1.5c1.8-.8 3-2.5 3-4.5 0-2.8-2.2-5-5-5zm-2 6c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zm4 0c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1 1 1z",
  // Hamster
  "M8 2C4.7 2 2 4.7 2 8c0 2.3 1.3 4.3 3.2 5.3.4.4 1.1.7 1.8.7h2c.7 0 1.4-.3 1.8-.7C12.7 12.3 14 10.3 14 8c0-3.3-2.7-6-6-6zM6 9c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zm4 0c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1z",
  // Horse
  "M12 2L9 5C7.3 5 6 6.3 6 8v3c0 1.1.9 2 2 2h1v1H8v1h4v-1h-1v-1h1c1.1 0 2-.9 2-2V5l-2-3zm-1 6c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1z",
  // Snake
  "M3 4c0 1.7 1.3 3 3 3h2c.6 0 1 .4 1 1s-.4 1-1 1H6c-1.7 0-3 1.3-3 3s1.3 3 3 3h4c1.7 0 3-1.3 3-3V9c0-.6.4-1 1-1 .6 0 1-.4 1-1s-.4-1-1-1c-1.7 0-3 1.3-3 3v3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1s.4-1 1-1h2c1.7 0 3-1.3 3-3s-1.3-3-3-3H6c-.6 0-1-.4-1-1s.4-1 1-1h2V5H6c-.6 0-1-.4-1-1z",
  // Parrot
  "M10 2C8.3 2 7 3.3 7 5v1H6C4.9 6 4 6.9 4 8v2c0 1.1.9 2 2 2v2l2 1v-3h2c1.1 0 2-.9 2-2V5c0-1.7-1.3-3-3-3zm0 4c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1z",
  // Guinea pig
  "M12 5H6C3.8 5 2 6.8 2 9s1.8 4 4 4h6c2.2 0 4-1.8 4-4s-1.8-4-4-4zM5 10c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zm4 1c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1z",
  // Lizard
  "M14 3l-3 2H8C6.3 5 5 6.3 5 8c0 .7.2 1.4.6 2L3 12v2h2l2-1.4c.6.3 1.3.4 2 .4h2l1 2h2l-1-2.6c.6-.7 1-1.5 1-2.4 0-1-.4-1.9-1-2.6L14 3zm-3 5c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1z",
];

/**
 * Animal-silhouette grid with sine-wave interference for organic opacity drift.
 * Same rendering technique as FallingPattern but stamps animal shapes instead of dots.
 */
export function FallingAnimals({
  color = "#009588",
  speed = 0.8,
  size = 14,
  gap = 48,
  className,
}: FallingAnimalsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const hex = color.replace("#", "");
    const cr = parseInt(hex.substring(0, 2), 16);
    const cg = parseInt(hex.substring(2, 4), 16);
    const cb = parseInt(hex.substring(4, 6), 16);

    // Pre-render each animal as a tiny canvas stamp
    const stampPx = Math.ceil(size * dpr);
    const stampCanvases: HTMLCanvasElement[] = ANIMALS.map((pathStr) => {
      const c = document.createElement("canvas");
      c.width = stampPx;
      c.height = stampPx;
      const sctx = c.getContext("2d")!;
      const scale = (size * dpr) / 16;
      sctx.scale(scale, scale);
      sctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      sctx.fill(new Path2D(pathStr));
      return c;
    });

    let w = 0,
      h = 0,
      cols = 0,
      rows = 0;
    let animalGrid: number[] = [];

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) return;
      w = rect.width;
      h = rect.height;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      cols = Math.ceil(w / gap);
      rows = Math.ceil(h / gap);
      animalGrid = [];
      for (let i = 0; i < cols * rows; i++) {
        // Deterministic pseudo-random per cell
        const hash = ((Math.sin(i * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1;
        animalGrid.push(Math.floor(hash * ANIMALS.length));
      }
    };

    let isInView = true;

    const io = new IntersectionObserver(
      ([entry]) => {
        isInView = entry.isIntersecting;
        if (isInView) animRef.current = requestAnimationFrame(drawLoop);
        else cancelAnimationFrame(animRef.current);
      },
      { threshold: 0 },
    );
    if (canvas) io.observe(canvas);

    const drawLoop = (ts: number) => {
      if (!isInView) return;
      const t = ts * 0.001 * speed;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let row = 0; row < rows; row++) {
        const py = row * gap;
        for (let col = 0; col < cols; col++) {
          const px = col * gap;

          // Sine interference field
          const f1 =
            Math.sin(px * 0.006 + py * 0.004 + t * 0.5) +
            Math.sin(px * 0.004 - py * 0.006 + t * 0.3);
          const f2 =
            Math.sin(px * 0.009 + py * 0.007 - t * 0.4 + 1.5) +
            Math.sin(-px * 0.005 + py * 0.008 + t * 0.35 + 3.0);
          const f3 =
            Math.sin(px * 0.003 + py * 0.01 + t * 0.25 + 5.0) +
            Math.sin(px * 0.007 - py * 0.003 - t * 0.45 + 2.0);

          const field = f1 + f2 * 0.7 + f3 * 0.5;
          const contour = Math.sin(field * 2.5);
          const alpha = 0.04 + (contour * 0.5 + 0.5) * 0.22;

          const idx = animalGrid[row * cols + col] ?? 0;
          ctx.globalAlpha = alpha;
          ctx.drawImage(stampCanvases[idx], px * dpr, py * dpr, stampPx, stampPx);
        }
      }

      ctx.globalAlpha = 1;
      animRef.current = requestAnimationFrame(drawLoop);
    };

    resize();
    animRef.current = requestAnimationFrame(drawLoop);

    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(animRef.current);
      resize();
      animRef.current = requestAnimationFrame(drawLoop);
    });
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
      io.disconnect();
      stampCanvases.length = 0;
    };
  }, [color, speed, size, gap]);

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        aria-hidden="true"
      />
    </div>
  );
}
