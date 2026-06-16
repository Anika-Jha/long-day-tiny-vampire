import { useEffect, useRef } from "react";

/**
 * A short, skippable opening cinematic told entirely on a canvas:
 * a coffin rides home on a delivery truck through the night, our tiny vampire
 * tumbles out just as the longest day of the year begins, and the Sun says hello.
 * Calls onDone() when finished or skipped.
 */

type Beat = { t: number; text: string; who?: "sun" | "nox" | "narrator" };

const BEATS: Beat[] = [
  { t: 1.0, text: "It was the night before the June Solstice — the longest day of the year.", who: "narrator" },
  { t: 6.5, text: "A coffin rode home in the back of a delivery truck, fast asleep.", who: "narrator" },
  { t: 12.0, text: "Then — a bump in the road.", who: "narrator" },
  { t: 15.5, text: "...where am I? This isn't my crypt.", who: "nox" },
  { t: 20.0, text: "And over the rooftops, the sun began to rise.", who: "narrator" },
  { t: 25.0, text: "Good morning, little one. You're a long way from home.", who: "sun" },
  { t: 30.0, text: "Don't listen to it. Come on — let's get you back before dark.", who: "nox" },
];

const TOTAL = 35;

export default function Cinematic({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let start = performance.now();

    const resize = () => {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = (now: number) => {
      const t = (now - start) / 1000;
      const W = canvas.width;
      const H = canvas.height;
      const ground = H * 0.78;

      // ---- sky: night → dawn over the cinematic ----
      const dawn = clamp((t - 16) / 10, 0, 1); // 0 night .. 1 dawn
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, mix("#070512", "#2a2350", dawn));
      sky.addColorStop(0.6, mix("#0c0a1a", "#7a4a8a", dawn));
      sky.addColorStop(1, mix("#120a22", "#ffb066", dawn));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // stars fade out as dawn comes
      ctx.save();
      ctx.globalAlpha = (1 - dawn) * 0.9;
      ctx.fillStyle = "#fff";
      for (let i = 0; i < 70; i++) {
        const sx = (i * 137.5) % W;
        const sy = (i * 71.3) % (H * 0.6);
        const tw = 0.5 + 0.5 * Math.sin(t * 2 + i);
        ctx.globalAlpha = (1 - dawn) * 0.6 * tw;
        ctx.fillRect(sx, sy, 2, 2);
      }
      ctx.restore();

      // ---- rising sun (after ~18s) ----
      const sunRise = clamp((t - 18) / 10, 0, 1);
      if (sunRise > 0) {
        const sx = W * 0.74;
        const sy = ground - sunRise * (ground * 0.55);
        const r = Math.min(W, H) * 0.07;
        const grd = ctx.createRadialGradient(sx, sy, 4, sx, sy, r * 3);
        grd.addColorStop(0, "rgba(255,220,150,0.95)");
        grd.addColorStop(0.4, "rgba(255,160,90,0.5)");
        grd.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(sx, sy, r * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffd98a";
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();

        // the Sun's "face" — calm, ancient — appears as it speaks
        const face = clamp((t - 24) / 2, 0, 1);
        if (face > 0) {
          ctx.save();
          ctx.globalAlpha = face * 0.5;
          ctx.fillStyle = "#7a4a1a";
          ctx.beginPath();
          ctx.arc(sx - r * 0.35, sy - r * 0.1, r * 0.1, 0, Math.PI * 2);
          ctx.arc(sx + r * 0.35, sy - r * 0.1, r * 0.1, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#7a4a1a";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sx, sy + r * 0.15, r * 0.4, 0.15 * Math.PI, 0.85 * Math.PI);
          ctx.stroke();
          ctx.restore();
        }
      }

      // ---- ground / road ----
      ctx.fillStyle = mix("#0a0816", "#3a2a44", dawn);
      ctx.fillRect(0, ground, W, H - ground);
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 3;
      ctx.setLineDash([28, 26]);
      ctx.lineDashOffset = -((t * 220) % 54);
      ctx.beginPath();
      ctx.moveTo(0, ground + (H - ground) * 0.45);
      ctx.lineTo(W, ground + (H - ground) * 0.45);
      ctx.stroke();
      ctx.setLineDash([]);

      // ---- the truck with the coffin (drives in 0-12s, bump at 12s) ----
      const truckGone = t > 13.5;
      if (!truckGone) {
        const drive = clamp(t / 7, 0, 1);
        const tx = -260 + drive * (W * 0.55 + 260);
        const bump = t > 12 ? Math.sin((t - 12) * 30) * 6 * clamp(1.5 - (t - 12), 0, 1) : 0;
        drawTruck(ctx, tx, ground - 4 + bump);
      }

      // ---- the tiny vampire falls out (~12-16s) then stands on the road ----
      if (t > 12) {
        const vx = W * 0.42;
        const fall = clamp((t - 12) / 1.6, 0, 1);
        const arc = Math.sin(fall * Math.PI) * 70;
        const vy = ground - 22 - arc * (1 - fall);
        drawVampire(ctx, vx, Math.min(vy, ground - 22));
        // NOX flutters down near the end
        if (t > 28) {
          const bx = vx + 34 + Math.sin(t * 4) * 6;
          const by = ground - 60 + Math.cos(t * 3) * 6;
          drawBat(ctx, bx, by, 16);
        }
      }

      // ---- title flourish near the end ----
      const titleIn = clamp((t - 31) / 2.5, 0, 1);
      if (titleIn > 0) {
        ctx.save();
        ctx.globalAlpha = titleIn;
        ctx.textAlign = "center";
        ctx.fillStyle = "#f1d6ff";
        ctx.font = `900 ${Math.round(Math.min(W, H) * 0.075)}px system-ui`;
        ctx.fillText("Long Day, Tiny Vampire", W / 2, H * 0.32);
        ctx.restore();
      }

      // ---- captions ----
      const beat = [...BEATS].reverse().find((b) => t >= b.t && t < b.t + 4.6);
      if (beat) {
        const local = t - beat.t;
        const a = Math.min(1, local / 0.5) * Math.min(1, (4.6 - local) / 0.6);
        drawCaption(ctx, W, H, beat, a);
      }

      // ---- skip hint ----
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = "#fff";
      ctx.font = "13px system-ui";
      ctx.textAlign = "right";
      ctx.fillText("Press any key to skip →", W - 18, H - 16);
      ctx.restore();

      if (t >= TOTAL) {
        finish();
        return;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const skip = () => finish();
    window.addEventListener("keydown", skip);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", skip);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="absolute inset-0 bg-[#070512]">
      <canvas ref={canvasRef} className="h-full w-full" onClick={finish} />
      <button
        onClick={finish}
        className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-white/30 bg-black/40 px-6 py-2 text-sm font-bold text-white/90 hover:bg-black/60"
      >
        Skip intro
      </button>
    </div>
  );
}

/* ----------------------------- helpers ----------------------------- */
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function mix(a: string, b: string, t: number) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * t);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * t);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function drawCaption(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  beat: Beat,
  alpha: number,
) {
  const isSun = beat.who === "sun";
  const isNox = beat.who === "nox";
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = "center";
  const y = H * 0.86;
  ctx.font = `${beat.who === "narrator" ? "italic " : "600 "}${Math.round(Math.min(W, H) * 0.034)}px system-ui`;
  // soft backing
  const tw = ctx.measureText(beat.text).width;
  ctx.fillStyle = "rgba(8,5,18,0.6)";
  const padX = 22;
  roundRect(ctx, W / 2 - tw / 2 - padX, y - 28, tw + padX * 2, 44, 14);
  ctx.fill();
  ctx.fillStyle = isSun ? "#ffd98a" : isNox ? "#d8c6ff" : "#e9e4f5";
  ctx.fillText(beat.text, W / 2, y);
  ctx.restore();
}

function drawTruck(ctx: CanvasRenderingContext2D, x: number, baseY: number) {
  ctx.save();
  ctx.translate(x, baseY);
  // cab
  ctx.fillStyle = "#3b3050";
  roundRect(ctx, 150, -54, 70, 50, 6);
  ctx.fill();
  ctx.fillStyle = "#a9c7ff";
  roundRect(ctx, 196, -48, 22, 22, 3);
  ctx.fill();
  // cargo box
  ctx.fillStyle = "#2a2340";
  roundRect(ctx, 10, -78, 150, 74, 6);
  ctx.fill();
  // coffin in the back
  ctx.fillStyle = "#5a4030";
  roundRect(ctx, 36, -64, 96, 30, 4);
  ctx.fill();
  ctx.fillStyle = "#caa05a";
  ctx.fillRect(80, -62, 6, 26);
  ctx.fillRect(64, -51, 38, 5);
  // wheels
  ctx.fillStyle = "#111";
  for (const wx of [44, 188]) {
    ctx.beginPath();
    ctx.arc(wx, 0, 13, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#444";
  for (const wx of [44, 188]) {
    ctx.beginPath();
    ctx.arc(wx, 0, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawVampire(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.save();
  ctx.translate(x, y);
  // cloak body
  ctx.fillStyle = "#241640";
  roundRect(ctx, -12, -10, 24, 32, 7);
  ctx.fill();
  // head
  ctx.fillStyle = "#efe7ff";
  ctx.beginPath();
  ctx.arc(0, -16, 10, 0, Math.PI * 2);
  ctx.fill();
  // eyes
  ctx.fillStyle = "#c0392b";
  ctx.beginPath();
  ctx.arc(-3.5, -17, 1.6, 0, Math.PI * 2);
  ctx.arc(3.5, -17, 1.6, 0, Math.PI * 2);
  ctx.fill();
  // little collar
  ctx.fillStyle = "#7a2030";
  ctx.beginPath();
  ctx.moveTo(-10, -8);
  ctx.lineTo(0, -2);
  ctx.lineTo(10, -8);
  ctx.lineTo(8, -12);
  ctx.lineTo(-8, -12);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawBat(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#cbb8ff";
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-s * 0.7, -s * 0.45, -s * 0.85, s * 0.12);
  ctx.quadraticCurveTo(-s * 0.4, 0, 0, s * 0.12);
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(s * 0.7, -s * 0.45, s * 0.85, s * 0.12);
  ctx.quadraticCurveTo(s * 0.4, 0, 0, s * 0.12);
  ctx.fill();
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
