import { Application, Container, Graphics, Text } from "pixi.js";
import type {
  Appearance,
  Direction,
  GlassesStyle,
  HairStyle,
  HatStyle,
  Player,
  SkinTone,
} from "@shared/types";

const SPEED_PX_PER_SEC = 180;
const TILE = 32;

// ─── Cosmetic palettes ─────────────────────────────────────────────────────
// Centralised so every consumer (PlayerSprite, future preview screen, the
// occupant chip on seats…) renders the same colours.

export const SKIN_TONE_HEX: Record<SkinTone, number> = {
  pale: 0xfde4cf,
  beige: 0xf2c4a3,
  tan: 0xd6996b,
  brown: 0x9c6b46,
  dark: 0x5c3a26,
};

export const DEFAULT_HAIR_HEX = 0x3f3f46;

export type PortalStyle =
  | "default"
  | "casino"
  | "rpg"
  | "tcg"
  | "imperium"
  | "skyline"
  | "back";

export type PortalLandmark = {
  kind: "portal";
  id: string;
  x: number;
  y: number;
  color: number;
  label: string;
  href?: string;
  style?: PortalStyle;
};

export type TableLandmark = {
  kind: "table";
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  feltColor: number;
  accentColor: number;
  label: string;
  seats: number;
  href?: string;
};

export type SeatLandmark = {
  kind: "seat";
  id: string;
  seatIndex: number;
  x: number;
  y: number;
};

export type Landmark = PortalLandmark | TableLandmark | SeatLandmark;

export type AmbianceStyle = "plaza" | "casino" | "neutral";

export interface SceneConfig {
  width: number;
  height: number;
  backgroundColor: number;
  floorColor: number;
  floorAccentColor: number;
  floorAccentAlpha: number;
  landmarks: Landmark[];
  ambiance?: AmbianceStyle;
}

// Convert 0xRRGGBB → {h, s, l} in [0,360], [0,1], [0,1].
function hexToHsl(hex: number): { h: number; s: number; l: number } {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  return { h, s, l };
}

function hslToHex(h: number, s: number, l: number): number {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const ir = Math.round((r + m) * 255);
  const ig = Math.round((g + m) * 255);
  const ib = Math.round((b + m) * 255);
  return (ir << 16) | (ig << 8) | ib;
}

function shiftColor(hex: number, dh: number, dl: number): number {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h + dh, s, l + dl);
}

class PlayerSprite extends Container {
  private shadow = new Graphics();
  private halo = new Graphics();
  private bodyRoot = new Container();
  private leftLeg = new Graphics();
  private rightLeg = new Graphics();
  private leftArm = new Graphics();
  private rightArm = new Graphics();
  private torso = new Graphics();
  private head = new Graphics();
  private face = new Graphics();
  private hatGfx = new Graphics();
  private glassesGfx = new Graphics();
  private nameLabel: Text;
  private nameBg: Graphics;

  private targetX: number;
  private targetY: number;
  private walkPhase = 0;
  private isMoving = false;
  private haloPhase = Math.random() * Math.PI * 2;

  private bodyColor: number;
  private accentColor: number;
  private skinColor: number;
  private hairColor: number;
  private hairStyle: HairStyle;
  private hatStyle: HatStyle;
  private glassesStyle: GlassesStyle;

  public direction: Direction;
  public readonly playerId: string;

  constructor(player: Player) {
    super();
    this.playerId = player.id;
    this.position.set(player.x, player.y);
    this.targetX = player.x;
    this.targetY = player.y;
    this.direction = player.direction;

    const baseBody = parseInt(player.color.slice(1), 16);
    const a = player.appearance;
    this.bodyColor = a?.bodyColor
      ? parseInt(a.bodyColor.slice(1), 16)
      : baseBody;
    this.accentColor = shiftColor(this.bodyColor, -25, -0.12);
    this.skinColor = SKIN_TONE_HEX[a?.skinTone ?? "pale"];
    this.hairColor = a?.hairColor
      ? parseInt(a.hairColor.slice(1), 16)
      : shiftColor(this.bodyColor, 35, -0.25);
    this.hairStyle = a?.hairStyle ?? "short";
    this.hatStyle = a?.hat ?? "none";
    this.glassesStyle = a?.glasses ?? "none";

    // Subtle ground halo pulses with the avatar.
    this.addChild(this.halo);

    // Hard ellipse shadow.
    this.shadow.ellipse(0, 8, 16, 5).fill({ color: 0x000000, alpha: 0.45 });
    this.addChild(this.shadow);

    this.bodyRoot.addChild(this.leftLeg);
    this.bodyRoot.addChild(this.rightLeg);
    this.bodyRoot.addChild(this.leftArm);
    this.bodyRoot.addChild(this.rightArm);
    this.bodyRoot.addChild(this.torso);
    this.bodyRoot.addChild(this.head);
    this.bodyRoot.addChild(this.face);
    this.bodyRoot.addChild(this.glassesGfx);
    this.bodyRoot.addChild(this.hatGfx);
    this.addChild(this.bodyRoot);

    this.nameBg = new Graphics();
    this.addChild(this.nameBg);

    this.nameLabel = new Text({
      text: player.name,
      style: {
        fontFamily: "system-ui, sans-serif",
        fontSize: 11,
        fontWeight: "700",
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 3 },
      },
    });
    this.nameLabel.anchor.set(0.5, 1);
    this.nameLabel.position.set(0, -28);
    this.addChild(this.nameLabel);

    this.redrawNameBg();
    this.redrawBody(0, 0);
  }

  setTarget(x: number, y: number, direction: Direction) {
    this.targetX = x;
    this.targetY = y;
    this.direction = direction;
  }

  setName(name: string) {
    this.nameLabel.text = name;
    this.redrawNameBg();
  }

  private redrawNameBg() {
    const w = this.nameLabel.width + 10;
    const h = 14;
    this.nameBg.clear();
    this.nameBg
      .roundRect(-w / 2, -28 - h, w, h, 4)
      .fill({ color: 0x000000, alpha: 0.55 })
      .stroke({ color: 0xffffff, width: 1, alpha: 0.15 });
  }

  /**
   * Redraw the avatar according to `direction` and walk phase.
   * `legSwing` and `armSwing` are added/subtracted from neutral so the
   * limbs visibly swing while moving.
   */
  private redrawBody(legSwing: number, armSwing: number) {
    const dir = this.direction;
    const facingSide = dir === "left" || dir === "right";
    const flipX = dir === "left" ? -1 : 1;

    // ── Legs ──────────────────────────────────────────────────────────────
    this.leftLeg.clear();
    this.rightLeg.clear();
    if (facingSide) {
      // Side view: one leg forward, one back.
      this.leftLeg
        .roundRect(-3, -1, 6, 11, 2)
        .fill(this.accentColor);
      this.leftLeg.position.set(-2 * flipX, 4 + legSwing);
      this.rightLeg
        .roundRect(-3, -1, 6, 11, 2)
        .fill(this.accentColor);
      this.rightLeg.position.set(2 * flipX, 4 - legSwing);
    } else {
      this.leftLeg
        .roundRect(-3.5, 0, 7, 11, 2)
        .fill(this.accentColor);
      this.leftLeg.position.set(-3, 4 + (legSwing > 0 ? legSwing : 0));
      this.rightLeg
        .roundRect(-3.5, 0, 7, 11, 2)
        .fill(this.accentColor);
      this.rightLeg.position.set(3, 4 - (legSwing > 0 ? legSwing : 0));
    }

    // ── Torso ────────────────────────────────────────────────────────────
    this.torso.clear();
    this.torso
      .roundRect(-8, -4, 16, 14, 5)
      .fill(this.bodyColor)
      .stroke({ color: 0x000000, width: 1.2, alpha: 0.35 });

    // Subtle shoulder highlight band.
    this.torso
      .roundRect(-7, -3, 14, 3, 2)
      .fill({ color: 0xffffff, alpha: 0.18 });

    // ── Arms ─────────────────────────────────────────────────────────────
    this.leftArm.clear();
    this.rightArm.clear();
    if (facingSide) {
      // Single visible arm in profile, swinging.
      this.rightArm
        .roundRect(-2.5, -1, 5, 9, 2)
        .fill(this.bodyColor)
        .stroke({ color: 0x000000, width: 1, alpha: 0.3 });
      this.rightArm.position.set(0, -1 + armSwing * 0.5);
      this.rightArm.rotation = (armSwing / 6) * flipX;
      this.leftArm.visible = false;
    } else {
      this.leftArm.visible = true;
      this.leftArm
        .roundRect(-2.5, -1, 5, 11, 2)
        .fill(this.bodyColor)
        .stroke({ color: 0x000000, width: 1, alpha: 0.3 });
      this.leftArm.position.set(-9, -1);
      this.leftArm.rotation = (armSwing / 8);
      this.rightArm
        .roundRect(-2.5, -1, 5, 11, 2)
        .fill(this.bodyColor)
        .stroke({ color: 0x000000, width: 1, alpha: 0.3 });
      this.rightArm.position.set(9, -1);
      this.rightArm.rotation = -(armSwing / 8);
    }

    // ── Head ─────────────────────────────────────────────────────────────
    this.head.clear();
    this.head
      .circle(0, -12, 7)
      .fill(this.skinColor)
      .stroke({ color: 0x000000, width: 1.2, alpha: 0.35 });

    // Hair — depends on style + direction. "bald" skips entirely.
    this.drawHair(dir, flipX);

    // ── Face ─────────────────────────────────────────────────────────────
    this.face.clear();
    if (dir === "down") {
      this.face.circle(-2.5, -12, 1.1).fill(0x111111);
      this.face.circle(2.5, -12, 1.1).fill(0x111111);
      this.face
        .moveTo(-1.5, -9.5)
        .lineTo(1.5, -9.5)
        .stroke({ color: 0x111111, width: 1, alpha: 0.7 });
    } else if (dir === "up") {
      // back of head — no face.
    } else {
      // Single visible eye on the facing side.
      this.face.circle(2.4 * flipX, -12, 1.2).fill(0x111111);
    }

    // ── Glasses & hat (drawn on top of head/face) ────────────────────────
    this.drawGlasses(dir, flipX);
    this.drawHat(dir, flipX);
  }

  /** Hair shapes use the head centre at (0, -12) with radius 7 as anchor. */
  private drawHair(dir: Direction, flipX: number) {
    if (this.hairStyle === "bald") return;
    const c = this.hairColor;

    if (this.hairStyle === "mohawk") {
      // Strip down the centre — visible from any angle except dead-on back.
      if (dir === "up") {
        this.head.roundRect(-2, -19, 4, 8, 1.5).fill(c);
      } else if (dir === "down") {
        this.head.roundRect(-2, -20, 4, 8, 1.5).fill(c);
        // Slight tuft on top.
        this.head.circle(0, -20, 2.5).fill(c);
      } else {
        // Side: visible spikes silhouette.
        this.head.roundRect(-2, -21, 4, 9, 1.5).fill(c);
        this.head
          .moveTo(-2, -19)
          .lineTo(0, -22)
          .lineTo(2, -19)
          .closePath()
          .fill(c);
      }
      return;
    }

    if (this.hairStyle === "bun") {
      // Cap + small bun on top-back.
      if (dir === "up") {
        this.head.circle(0, -12, 7).fill(c);
        this.head.circle(0, -19, 3).fill(c);
      } else if (dir === "down") {
        this.head
          .arc(0, -12, 7, Math.PI, 2 * Math.PI)
          .lineTo(7, -12)
          .lineTo(-7, -12)
          .closePath()
          .fill(c);
        this.head.roundRect(-7, -14, 14, 4, 2).fill(c);
        // Bun visible just above head.
        this.head.circle(0, -19, 2.5).fill(c);
      } else {
        const back = -flipX;
        this.head.roundRect(-7, -19, 14, 7, 4).fill(c);
        this.head.circle(back * 5, -19, 3).fill(c);
      }
      return;
    }

    if (this.hairStyle === "long") {
      // Cap + locks falling on shoulders.
      if (dir === "up") {
        this.head.circle(0, -12, 7).fill(c);
        // Hair flowing down past head.
        this.head.roundRect(-7, -12, 14, 9, 3).fill(c);
      } else if (dir === "down") {
        this.head
          .arc(0, -12, 7, Math.PI, 2 * Math.PI)
          .lineTo(7, -12)
          .lineTo(-7, -12)
          .closePath()
          .fill(c);
        this.head.roundRect(-7, -14, 14, 4, 2).fill(c);
        // Side strands framing the face.
        this.head.roundRect(-8, -13, 3, 9, 1.5).fill(c);
        this.head.roundRect(5, -13, 3, 9, 1.5).fill(c);
      } else {
        const back = -flipX;
        this.head.roundRect(-7, -19, 14, 7, 4).fill(c);
        this.head.roundRect(back * 4 - 2, -16, 4, 12, 2).fill(c);
      }
      return;
    }

    // Default "short" — same as the legacy default.
    if (dir === "up") {
      this.head.circle(0, -12, 7).fill(c);
    } else if (dir === "down") {
      this.head
        .arc(0, -12, 7, Math.PI, 2 * Math.PI)
        .lineTo(7, -12)
        .lineTo(-7, -12)
        .closePath()
        .fill(c);
      this.head.roundRect(-7, -14, 14, 4, 2).fill(c);
    } else {
      const back = -flipX;
      this.head.roundRect(-7, -19, 14, 7, 4).fill(c);
      this.head.roundRect(back * 4 - 1, -16, 4, 6, 2).fill(c);
    }
  }

  private drawHat(dir: Direction, flipX: number) {
    this.hatGfx.clear();
    if (this.hatStyle === "none") return;

    if (this.hatStyle === "cap") {
      // Backwards/forwards cap. Visor only visible from front + sides.
      const peakColor = shiftColor(this.bodyColor, 0, -0.12);
      this.hatGfx
        .roundRect(-7, -22, 14, 6, 3)
        .fill(this.bodyColor)
        .stroke({ color: 0x000000, width: 1, alpha: 0.4 });
      if (dir === "down") {
        this.hatGfx.roundRect(-8, -17, 16, 2.5, 1).fill(peakColor);
      } else if (dir === "left" || dir === "right") {
        this.hatGfx.roundRect(flipX * 2, -17, flipX * 9, 2.5, 1).fill(peakColor);
      }
      // Stripe.
      this.hatGfx
        .roundRect(-7, -20, 14, 1.5, 0.7)
        .fill({ color: 0xffffff, alpha: 0.25 });
      return;
    }

    if (this.hatStyle === "crown") {
      // Gold crown — 3 spikes.
      const gold = 0xfacc15;
      this.hatGfx
        .roundRect(-7, -20, 14, 4, 1.5)
        .fill(gold)
        .stroke({ color: 0x000000, width: 1, alpha: 0.45 });
      this.hatGfx
        .moveTo(-7, -20)
        .lineTo(-5, -25)
        .lineTo(-3, -20)
        .closePath()
        .fill(gold);
      this.hatGfx
        .moveTo(-1, -20)
        .lineTo(0, -27)
        .lineTo(1, -20)
        .closePath()
        .fill(gold);
      this.hatGfx
        .moveTo(3, -20)
        .lineTo(5, -25)
        .lineTo(7, -20)
        .closePath()
        .fill(gold);
      // Gem in centre.
      this.hatGfx.circle(0, -18, 1.5).fill(0xef4444);
      return;
    }

    if (this.hatStyle === "wizard") {
      // Pointy purple hat with a brim.
      const hat = 0x6d28d9;
      this.hatGfx
        .moveTo(-9, -19)
        .lineTo(-4, -19)
        .lineTo(0, -32)
        .lineTo(4, -19)
        .lineTo(9, -19)
        .closePath()
        .fill(hat)
        .stroke({ color: 0x000000, width: 1, alpha: 0.45 });
      // Star.
      this.hatGfx.circle(0, -25, 1.4).fill(0xfde68a);
      return;
    }

    if (this.hatStyle === "headband") {
      // Thin colored band across forehead.
      const band = shiftColor(this.bodyColor, 60, 0.05);
      this.hatGfx
        .roundRect(-7, -16, 14, 2.5, 1)
        .fill(band)
        .stroke({ color: 0x000000, width: 0.8, alpha: 0.4 });
      // Knot on the side (visible on profile back side).
      if (dir === "left" || dir === "right") {
        this.hatGfx.circle(-flipX * 7, -15, 1.4).fill(band);
      }
      return;
    }

    if (this.hatStyle === "horns") {
      // Demon horns — 2 small dark cones.
      const horn = 0x1f2937;
      this.hatGfx
        .moveTo(-5, -18)
        .lineTo(-3, -25)
        .lineTo(-1, -18)
        .closePath()
        .fill(horn)
        .stroke({ color: 0x000000, width: 0.8, alpha: 0.5 });
      this.hatGfx
        .moveTo(1, -18)
        .lineTo(3, -25)
        .lineTo(5, -18)
        .closePath()
        .fill(horn)
        .stroke({ color: 0x000000, width: 0.8, alpha: 0.5 });
    }
  }

  private drawGlasses(dir: Direction, flipX: number) {
    this.glassesGfx.clear();
    if (this.glassesStyle === "none") return;
    if (dir === "up") return; // back of head, glasses not visible

    if (this.glassesStyle === "round") {
      const stroke = { color: 0x111111, width: 1.2, alpha: 0.95 };
      if (dir === "down") {
        this.glassesGfx.circle(-3, -12, 2).stroke(stroke);
        this.glassesGfx.circle(3, -12, 2).stroke(stroke);
        this.glassesGfx
          .moveTo(-1, -12)
          .lineTo(1, -12)
          .stroke(stroke);
      } else {
        this.glassesGfx.circle(2.4 * flipX, -12, 2).stroke(stroke);
        // Temple piece.
        this.glassesGfx
          .moveTo(2.4 * flipX + flipX * 2, -12)
          .lineTo(7 * flipX, -12)
          .stroke(stroke);
      }
      return;
    }

    if (this.glassesStyle === "shades") {
      const fill = 0x0f172a;
      if (dir === "down") {
        this.glassesGfx
          .roundRect(-6, -13.5, 5.5, 3, 1)
          .fill(fill)
          .stroke({ color: 0x000000, width: 1, alpha: 0.5 });
        this.glassesGfx
          .roundRect(0.5, -13.5, 5.5, 3, 1)
          .fill(fill)
          .stroke({ color: 0x000000, width: 1, alpha: 0.5 });
      } else {
        this.glassesGfx
          .roundRect(flipX * 0.5, -13.5, flipX * 5.5, 3, 1)
          .fill(fill)
          .stroke({ color: 0x000000, width: 1, alpha: 0.5 });
      }
      return;
    }

    if (this.glassesStyle === "monocle") {
      const stroke = { color: 0xfacc15, width: 1.4, alpha: 1 };
      if (dir === "down") {
        this.glassesGfx.circle(3, -12, 2.4).stroke(stroke);
        this.glassesGfx
          .moveTo(3, -9.5)
          .lineTo(4, -7)
          .stroke({ color: 0xfacc15, width: 0.8, alpha: 0.8 });
      } else {
        this.glassesGfx.circle(2.4 * flipX, -12, 2.4).stroke(stroke);
      }
    }
  }

  /** Update cosmetic config and force a redraw — used by the live preview
   *  on the customisation screen. */
  setAppearance(appearance: Appearance | undefined) {
    if (appearance?.bodyColor) {
      this.bodyColor = parseInt(appearance.bodyColor.slice(1), 16);
      this.accentColor = shiftColor(this.bodyColor, -25, -0.12);
    }
    this.skinColor = SKIN_TONE_HEX[appearance?.skinTone ?? "pale"];
    this.hairColor = appearance?.hairColor
      ? parseInt(appearance.hairColor.slice(1), 16)
      : shiftColor(this.bodyColor, 35, -0.25);
    this.hairStyle = appearance?.hairStyle ?? "short";
    this.hatStyle = appearance?.hat ?? "none";
    this.glassesStyle = appearance?.glasses ?? "none";
    this.redrawBody(0, 0);
  }

  tick(dtMs: number) {
    const dx = this.targetX - this.position.x;
    const dy = this.targetY - this.position.y;
    const dist = Math.hypot(dx, dy);
    const wasMoving = this.isMoving;

    if (dist < 0.25) {
      this.position.set(this.targetX, this.targetY);
      this.isMoving = false;
    } else {
      const move = (SPEED_PX_PER_SEC * dtMs) / 1000;
      if (move >= dist) {
        this.position.set(this.targetX, this.targetY);
        this.isMoving = false;
      } else {
        this.position.x += (dx / dist) * move;
        this.position.y += (dy / dist) * move;
        this.isMoving = true;
      }
      this.zIndex = this.position.y;
    }

    // Walk phase progresses while moving, decays when idle.
    if (this.isMoving) {
      this.walkPhase += dtMs * 0.012;
    } else {
      this.walkPhase *= Math.max(0, 1 - dtMs * 0.008);
    }

    // Halo pulse independent of motion.
    this.haloPhase += dtMs * 0.002;

    const legSwing = Math.sin(this.walkPhase) * 3;
    const armSwing = Math.sin(this.walkPhase) * 4;
    const bounce = -Math.abs(Math.sin(this.walkPhase)) * 1.2;

    this.bodyRoot.y = bounce;
    this.redrawBody(legSwing, armSwing);

    // Halo redraw — cheap, single ring.
    const halo = 0.55 + Math.sin(this.haloPhase) * 0.1;
    this.halo.clear();
    this.halo
      .ellipse(0, 6, 22, 8)
      .fill({ color: this.bodyColor, alpha: 0.18 * halo });
    this.halo
      .ellipse(0, 6, 32, 11)
      .fill({ color: this.bodyColor, alpha: 0.08 * halo });
  }

  currentPosition() {
    return { x: this.position.x, y: this.position.y };
  }
}

export type SeatOccupant = {
  playerId: string;
  playerName: string;
  color: string;
};

type AnimatedPortal = {
  ring: Graphics;
  glow: Graphics;
  inner: Graphics | null;
  particles: Graphics | null;
  baseColor: number;
  phase: number;
};

type AmbianceParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  alpha: number;
  drift: number;
};

type Burst = {
  // World-space anchor where the burst was spawned.
  cx: number;
  cy: number;
  // Per-particle radial velocities + lifetime ratio (0 → 1).
  particles: { angle: number; speed: number; life: number; color: number }[];
  // ms remaining; particles die at 0.
  ttlMs: number;
  totalMs: number;
};

export class GameScene {
  private app: Application | null = null;
  private world = new Container();
  private floor = new Graphics();
  private ambianceLayer = new Graphics();
  private landmarksLayer = new Container();
  private playersLayer = new Container();
  private particlesLayer = new Graphics();
  private burstsLayer = new Graphics();
  private sprites = new Map<string, PlayerSprite>();
  private seatContainers = new Map<number, Container>();
  private readonly config: SceneConfig;
  private selfId: string | null = null;
  private pendingLandmark: Landmark | null = null;
  private pendingArrivalX: number | null = null;
  private pendingArrivalY: number | null = null;

  // Animated portal effects (pulse + particle motion).
  private animatedPortals: AnimatedPortal[] = [];
  private ambianceParticles: AmbianceParticle[] = [];
  private bursts: Burst[] = [];
  private elapsedMs = 0;

  onClickMove?: (x: number, y: number) => void;
  onLandmarkArrival?: (landmark: Landmark) => void;

  constructor(config: SceneConfig) {
    this.config = config;
  }

  setSelfId(id: string) {
    this.selfId = id;
  }

  async init(host: HTMLElement) {
    this.app = new Application();
    await this.app.init({
      width: this.config.width,
      height: this.config.height,
      backgroundColor: this.config.backgroundColor,
      antialias: true,
      resolution: Math.min(2, window.devicePixelRatio ?? 1),
      autoDensity: true,
    });

    host.innerHTML = "";
    host.appendChild(this.app.canvas);

    this.drawFloor();
    this.drawAmbianceBase();
    this.spawnAmbianceParticles();
    this.drawLandmarks();

    this.playersLayer.sortableChildren = true;

    this.app.stage.addChild(this.floor);
    this.app.stage.addChild(this.ambianceLayer);
    this.app.stage.addChild(this.world);
    this.world.addChild(this.landmarksLayer);
    this.world.addChild(this.playersLayer);
    this.world.addChild(this.burstsLayer);
    this.app.stage.addChild(this.particlesLayer);

    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on("pointerdown", (e) => {
      const p = e.getLocalPosition(this.world);
      this.pendingLandmark = null;
      this.pendingArrivalX = null;
      this.pendingArrivalY = null;
      this.onClickMove?.(p.x, p.y);
    });

    this.app.ticker.add(() => {
      const dt = this.app!.ticker.deltaMS;
      this.elapsedMs += dt;
      for (const sprite of this.sprites.values()) sprite.tick(dt);
      this.tickPortals(dt);
      this.tickAmbiance(dt);
      this.tickBursts(dt);
      this.checkLandmarkArrival();
    });
  }

  private checkLandmarkArrival() {
    if (
      !this.pendingLandmark ||
      this.pendingArrivalX === null ||
      this.pendingArrivalY === null ||
      !this.selfId
    )
      return;
    const sprite = this.sprites.get(this.selfId);
    if (!sprite) return;
    const pos = sprite.currentPosition();
    const dx = pos.x - this.pendingArrivalX;
    const dy = pos.y - this.pendingArrivalY;
    if (Math.hypot(dx, dy) < 6) {
      const landmark = this.pendingLandmark;
      this.pendingLandmark = null;
      this.pendingArrivalX = null;
      this.pendingArrivalY = null;
      this.onLandmarkArrival?.(landmark);
    }
  }

  private drawFloor() {
    const g = this.floor;
    const { width, height, floorColor, floorAccentColor, floorAccentAlpha } =
      this.config;
    g.clear();
    g.rect(0, 0, width, height).fill(floorColor);

    for (let x = 0; x < width; x += TILE) {
      for (let y = 0; y < height; y += TILE) {
        const odd = ((x / TILE) & 1) ^ ((y / TILE) & 1);
        if (odd) {
          g.rect(x, y, TILE, TILE).fill({
            color: floorAccentColor,
            alpha: floorAccentAlpha,
          });
        }
      }
    }

    g.rect(0, 0, width, height).stroke({
      color: 0xffffff,
      alpha: 0.05,
      width: 1,
    });
  }

  private drawAmbianceBase() {
    const g = this.ambianceLayer;
    const { width, height, ambiance } = this.config;
    const cx = width / 2;
    const cy = height / 2;
    g.clear();

    if (ambiance === "plaza") {
      // Soft circular glow at the spawn centre — concentric rings give
      // depth without a single heavy gradient.
      const baseRadius = Math.min(width, height) * 0.42;
      for (let i = 0; i < 6; i++) {
        const t = i / 6;
        g.circle(cx, cy, baseRadius * (1 - t * 0.85)).fill({
          color: 0xa78bfa,
          alpha: 0.012 + t * 0.018,
        });
      }

      // Central spawn ring — visual anchor the player lands on.
      const ringR = 64;
      g.circle(cx, cy, ringR).fill({ color: 0x1a1830, alpha: 0.55 });
      g.circle(cx, cy, ringR).stroke({
        color: 0x8b5cf6,
        width: 2,
        alpha: 0.6,
      });
      g.circle(cx, cy, ringR - 8).stroke({
        color: 0xc4b5fd,
        width: 1,
        alpha: 0.35,
      });
      // Inner crosshair pattern.
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const x1 = cx + Math.cos(a) * 18;
        const y1 = cy + Math.sin(a) * 18;
        const x2 = cx + Math.cos(a) * 30;
        const y2 = cy + Math.sin(a) * 30;
        g.moveTo(x1, y1)
          .lineTo(x2, y2)
          .stroke({ color: 0xc4b5fd, width: 1, alpha: 0.45 });
      }
      // Tiny rune star at exact centre.
      g.circle(cx, cy, 4).fill({ color: 0xfde68a, alpha: 0.85 });
      g.circle(cx, cy, 8).stroke({
        color: 0xfde68a,
        width: 1,
        alpha: 0.4,
      });

      // Vignette at corners — 4 dark filled wedges.
      const vignetteAlpha = 0.32;
      g.rect(0, 0, width, height).stroke({
        color: 0x000000,
        width: 80,
        alpha: vignetteAlpha,
      });
    } else if (ambiance === "casino") {
      // Warm radial glow.
      const baseRadius = Math.min(width, height) * 0.5;
      for (let i = 0; i < 5; i++) {
        const t = i / 5;
        g.circle(cx, cy, baseRadius * (1 - t * 0.8)).fill({
          color: 0xef4444,
          alpha: 0.015 + t * 0.022,
        });
      }

      // Diagonal stripe pattern at low alpha — evokes a casino carpet.
      const stripeStep = 48;
      for (
        let d = -height;
        d < width + height;
        d += stripeStep
      ) {
        g.moveTo(d, 0)
          .lineTo(d - height, height)
          .stroke({ color: 0xef4444, width: 12, alpha: 0.04 });
      }

      // Central spawn medallion (compact version of plaza centre).
      g.circle(cx, cy, 56).fill({ color: 0x2a0a0a, alpha: 0.55 });
      g.circle(cx, cy, 56).stroke({
        color: 0xfca5a5,
        width: 2,
        alpha: 0.5,
      });
      g.circle(cx, cy, 48).stroke({
        color: 0xfde68a,
        width: 1,
        alpha: 0.35,
      });
      // Centre chip.
      g.circle(cx, cy, 5).fill({ color: 0xfde68a, alpha: 0.9 });
      g.circle(cx, cy, 5).stroke({
        color: 0x7c2d12,
        width: 1.5,
        alpha: 0.7,
      });

      g.rect(0, 0, width, height).stroke({
        color: 0x000000,
        width: 80,
        alpha: 0.32,
      });
    }
  }

  private spawnAmbianceParticles() {
    const { width, height, ambiance } = this.config;
    if (ambiance !== "plaza" && ambiance !== "casino") return;
    const count = ambiance === "plaza" ? 36 : 24;
    for (let i = 0; i < count; i++) {
      this.ambianceParticles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.05,
        vy: -0.03 - Math.random() * 0.04,
        r: 0.6 + Math.random() * 1.4,
        alpha: 0.2 + Math.random() * 0.4,
        drift: Math.random() * Math.PI * 2,
      });
    }
  }

  /**
   * Spawn a short-lived burst of particles at (x, y). Used as the arrival
   * "poof" when a new player joins the room. The burst is automatically
   * cleaned up when its TTL hits 0.
   */
  spawnArrivalBurst(x: number, y: number, color: number) {
    const count = 14;
    const particles: Burst["particles"] = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 60 + Math.random() * 50; // px/s
      particles.push({ angle, speed, life: 1, color });
    }
    this.bursts.push({
      cx: x,
      cy: y,
      particles,
      ttlMs: 700,
      totalMs: 700,
    });
  }

  private tickBursts(dtMs: number) {
    if (this.bursts.length === 0) {
      this.burstsLayer.clear();
      return;
    }
    const g = this.burstsLayer;
    g.clear();
    const stillAlive: Burst[] = [];
    for (const b of this.bursts) {
      b.ttlMs -= dtMs;
      if (b.ttlMs <= 0) continue;
      const t = 1 - b.ttlMs / b.totalMs; // 0 → 1
      const alpha = 1 - t;
      const ring = 32 * t;
      // Outer expanding ring.
      g.circle(b.cx, b.cy, ring).stroke({
        color: b.particles[0].color,
        width: 2,
        alpha: alpha * 0.6,
      });
      for (const p of b.particles) {
        const r = (p.speed * (b.totalMs - b.ttlMs)) / 1000;
        const px = b.cx + Math.cos(p.angle) * r;
        const py = b.cy + Math.sin(p.angle) * r;
        g.circle(px, py, 2 + (1 - t) * 1.5).fill({
          color: p.color,
          alpha,
        });
      }
      stillAlive.push(b);
    }
    this.bursts = stillAlive;
  }

  private tickAmbiance(dtMs: number) {
    if (this.ambianceParticles.length === 0) return;
    const { width, height, ambiance } = this.config;
    const color = ambiance === "casino" ? 0xfca5a5 : 0xc4b5fd;
    const g = this.particlesLayer;
    g.clear();

    for (const p of this.ambianceParticles) {
      p.drift += dtMs * 0.001;
      p.x += p.vx * dtMs + Math.sin(p.drift) * 0.05;
      p.y += p.vy * dtMs;
      if (p.y < -5) {
        p.y = height + 5;
        p.x = Math.random() * width;
      }
      if (p.x < -5) p.x = width + 5;
      if (p.x > width + 5) p.x = -5;
      const flicker = 0.7 + Math.sin(p.drift * 3) * 0.3;
      g.circle(p.x, p.y, p.r).fill({
        color,
        alpha: p.alpha * flicker,
      });
    }
  }

  private tickPortals(dtMs: number) {
    for (const p of this.animatedPortals) {
      p.phase += dtMs * 0.003;
      const pulse = 0.5 + Math.sin(p.phase) * 0.5;
      p.glow.alpha = 0.55 + pulse * 0.45;
      p.ring.alpha = 0.7 + pulse * 0.3;
      if (p.inner) {
        p.inner.rotation += dtMs * 0.0008;
      }
      if (p.particles) {
        // Particles redrawn each tick to orbit the portal.
        p.particles.clear();
        for (let i = 0; i < 5; i++) {
          const a = (p.phase * 0.7) + (i / 5) * Math.PI * 2;
          const r = 26 + Math.sin(p.phase * 2 + i) * 4;
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r * 0.55;
          p.particles
            .circle(x, y, 1.6)
            .fill({ color: p.baseColor, alpha: 0.85 });
        }
      }
    }
  }

  private drawLandmarks() {
    for (const landmark of this.config.landmarks) {
      if (landmark.kind === "portal") {
        this.drawPortal(landmark);
      } else if (landmark.kind === "table") {
        this.drawTable(landmark);
      } else if (landmark.kind === "seat") {
        this.drawSeat(landmark);
      }
    }
  }

  private drawSeat(seat: SeatLandmark) {
    const container = new Container();
    container.position.set(seat.x, seat.y);

    const chairBack = new Graphics();
    chairBack
      .roundRect(-16, -22, 32, 14, 4)
      .fill({ color: 0x3f3f46, alpha: 0.9 })
      .stroke({ color: 0xffffff, width: 1, alpha: 0.2 });
    container.addChild(chairBack);

    const seatPad = new Graphics();
    seatPad
      .roundRect(-18, -10, 36, 18, 6)
      .fill({ color: 0x27272a, alpha: 0.95 })
      .stroke({ color: 0xffffff, width: 1, alpha: 0.25 });
    container.addChild(seatPad);

    const label = new Text({
      text: `#${seat.seatIndex + 1}`,
      style: {
        fontFamily: "system-ui, sans-serif",
        fontSize: 9,
        fontWeight: "700",
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 2 },
      },
    });
    label.anchor.set(0.5, 0.5);
    label.position.set(0, 0);
    label.alpha = 0.55;
    container.addChild(label);

    container.eventMode = "static";
    container.cursor = "pointer";
    container.hitArea = {
      contains: (x, y) => Math.abs(x) <= 24 && y >= -28 && y <= 14,
    };
    container.on("pointerdown", (e) => {
      e.stopPropagation();
      const approachY = seat.y + 35;
      this.pendingLandmark = seat;
      this.pendingArrivalX = seat.x;
      this.pendingArrivalY = approachY;
      this.onClickMove?.(seat.x, approachY);
    });
    container.on("pointerover", () => {
      seatPad.alpha = 1;
      chairBack.alpha = 1;
    });
    container.on("pointerout", () => {
      seatPad.alpha = 0.95;
      chairBack.alpha = 0.9;
    });

    this.landmarksLayer.addChild(container);
    this.seatContainers.set(seat.seatIndex, container);
  }

  updateSeat(seatIndex: number, occupant: SeatOccupant | null) {
    const container = this.seatContainers.get(seatIndex);
    if (!container) return;

    const existing = container.children.find(
      (c) => (c as Container & { __isOccupant?: boolean }).__isOccupant,
    );
    if (existing) {
      container.removeChild(existing);
      existing.destroy({ children: true });
    }

    if (!occupant) return;

    const occupantContainer = new Container() as Container & {
      __isOccupant: boolean;
    };
    occupantContainer.__isOccupant = true;

    const color = parseInt(occupant.color.slice(1), 16);
    const accent = shiftColor(color, -25, -0.12);

    const torso = new Graphics();
    torso
      .roundRect(-7, -16, 14, 12, 5)
      .fill(color)
      .stroke({ color: 0x000000, width: 1, alpha: 0.4 });
    occupantContainer.addChild(torso);

    const head = new Graphics();
    head
      .circle(0, -22, 6)
      .fill(0xfde4cf)
      .stroke({ color: 0x000000, width: 1, alpha: 0.4 });
    head
      .arc(0, -22, 6, Math.PI, 2 * Math.PI)
      .lineTo(6, -22)
      .lineTo(-6, -22)
      .closePath()
      .fill(accent);
    head.circle(-2, -22, 0.9).fill(0x111111);
    head.circle(2, -22, 0.9).fill(0x111111);
    occupantContainer.addChild(head);

    const nameLabel = new Text({
      text: occupant.playerName,
      style: {
        fontFamily: "system-ui, sans-serif",
        fontSize: 10,
        fontWeight: "700",
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 2 },
      },
    });
    nameLabel.anchor.set(0.5, 1);
    nameLabel.position.set(0, -32);
    occupantContainer.addChild(nameLabel);

    container.addChild(occupantContainer);
  }

  private drawPortal(portal: PortalLandmark) {
    const container = new Container();
    container.position.set(portal.x, portal.y);

    const style = portal.style ?? "default";

    // Each style returns its own (glow, ring, inner, particles, hitR).
    const built = this.buildPortalArt(container, portal, style);

    const label = new Text({
      text: portal.label,
      style: {
        fontFamily: "system-ui, sans-serif",
        fontSize: 12,
        fontWeight: "800",
        fill: portal.href ? 0xffffff : 0x999999,
        stroke: { color: 0x000000, width: 3 },
      },
    });
    label.anchor.set(0.5, 0.5);
    label.position.set(0, built.labelY);
    container.addChild(label);

    if (portal.href) {
      container.eventMode = "static";
      container.cursor = "pointer";
      const r = built.hitRadius;
      container.hitArea = { contains: (x, y) => x * x + y * y <= r * r };
      container.on("pointerdown", (e) => {
        e.stopPropagation();
        this.pendingLandmark = portal;
        this.pendingArrivalX = portal.x;
        this.pendingArrivalY = portal.y;
        this.onClickMove?.(portal.x, portal.y);
      });
      container.on("pointerover", () => {
        built.ring.alpha = 1;
        built.glow.alpha = 1.2;
      });
      container.on("pointerout", () => {
        built.ring.alpha = 1;
        built.glow.alpha = 1;
      });

      this.animatedPortals.push({
        ring: built.ring,
        glow: built.glow,
        inner: built.inner,
        particles: built.particles,
        baseColor: portal.color,
        phase: Math.random() * Math.PI * 2,
      });
    } else {
      container.alpha = 0.5;
    }

    this.landmarksLayer.addChild(container);
  }

  private buildPortalArt(
    container: Container,
    portal: PortalLandmark,
    style: PortalStyle,
  ): {
    glow: Graphics;
    ring: Graphics;
    inner: Graphics | null;
    particles: Graphics | null;
    labelY: number;
    hitRadius: number;
  } {
    const c = portal.color;

    const glow = new Graphics();
    const ring = new Graphics();
    let inner: Graphics | null = null;
    let particles: Graphics | null = null;
    const labelY = 50;

    if (style === "casino") {
      // Wide arch + neon star bursts.
      glow.circle(0, 0, 50).fill({ color: c, alpha: 0.12 });
      glow.circle(0, 0, 36).fill({ color: c, alpha: 0.2 });
      glow
        .ellipse(0, 14, 38, 10)
        .fill({ color: 0x000000, alpha: 0.45 });
      container.addChild(glow);

      // Arch frame.
      ring.roundRect(-26, -28, 52, 44, 26).stroke({
        color: c,
        width: 3,
        alpha: 0.9,
      });
      ring.roundRect(-22, -24, 44, 38, 22).stroke({
        color: 0xfde68a,
        width: 1.5,
        alpha: 0.7,
      });
      // Tiny crown "C" on top.
      ring
        .circle(-10, -32, 1.8)
        .fill(0xfde68a)
        .circle(0, -34, 2.2)
        .fill(0xfde68a)
        .circle(10, -32, 1.8)
        .fill(0xfde68a);
      container.addChild(ring);

      inner = new Graphics();
      // Spinning star inside the arch.
      const star = inner;
      const points = 5;
      for (let i = 0; i < points * 2; i++) {
        const a = (i * Math.PI) / points - Math.PI / 2;
        const r = i % 2 === 0 ? 9 : 4;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r - 4;
        if (i === 0) star.moveTo(x, y);
        else star.lineTo(x, y);
      }
      star.closePath().fill({ color: 0xfde68a, alpha: 0.9 });
      container.addChild(inner);

      particles = new Graphics();
      container.addChild(particles);

      return { glow, ring, inner, particles, labelY: 32, hitRadius: 36 };
    }

    if (style === "rpg") {
      // Stone arch + flame.
      glow.circle(0, 0, 44).fill({ color: c, alpha: 0.18 });
      glow.circle(0, 0, 30).fill({ color: c, alpha: 0.25 });
      container.addChild(glow);

      // Stone arch — two pillars + arch top.
      ring.roundRect(-22, -10, 8, 36, 2).fill(0x52525b).stroke({
        color: 0x000000,
        width: 1,
        alpha: 0.5,
      });
      ring.roundRect(14, -10, 8, 36, 2).fill(0x52525b).stroke({
        color: 0x000000,
        width: 1,
        alpha: 0.5,
      });
      ring
        .arc(0, -10, 22, Math.PI, 2 * Math.PI)
        .lineTo(22, -10)
        .lineTo(-22, -10)
        .closePath()
        .fill(0x52525b)
        .stroke({ color: 0x000000, width: 1, alpha: 0.5 });
      // Brick lines.
      ring
        .moveTo(-22, 0)
        .lineTo(-14, 0)
        .moveTo(-22, 12)
        .lineTo(-14, 12)
        .moveTo(14, 0)
        .lineTo(22, 0)
        .moveTo(14, 12)
        .lineTo(22, 12)
        .stroke({ color: 0x000000, width: 1, alpha: 0.45 });
      // Inner glow tinted by portal color.
      ring
        .arc(0, -10, 14, Math.PI, 2 * Math.PI)
        .lineTo(14, -10)
        .lineTo(-14, -10)
        .closePath()
        .fill({ color: c, alpha: 0.5 });
      container.addChild(ring);

      inner = new Graphics();
      // Flame.
      inner
        .moveTo(0, 8)
        .quadraticCurveTo(-7, -2, -2, -8)
        .quadraticCurveTo(0, -4, 2, -8)
        .quadraticCurveTo(7, -2, 0, 8)
        .fill({ color: 0xfb923c, alpha: 0.95 });
      inner
        .moveTo(0, 4)
        .quadraticCurveTo(-3, -1, -1, -4)
        .quadraticCurveTo(0, -2, 1, -4)
        .quadraticCurveTo(3, -1, 0, 4)
        .fill({ color: 0xfde68a, alpha: 0.9 });
      container.addChild(inner);

      particles = new Graphics();
      container.addChild(particles);

      return { glow, ring, inner, particles, labelY: 42, hitRadius: 32 };
    }

    if (style === "tcg") {
      // Rune portal with floating cards.
      glow.circle(0, 0, 46).fill({ color: c, alpha: 0.12 });
      glow.circle(0, 0, 30).fill({ color: c, alpha: 0.22 });
      container.addChild(glow);

      // Hexagonal rune frame.
      const sides = 6;
      const rad = 24;
      ring.moveTo(rad, 0);
      for (let i = 1; i <= sides; i++) {
        const a = (i * Math.PI * 2) / sides;
        ring.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ring.stroke({ color: c, width: 3, alpha: 0.9 });
      // Inner hex.
      ring.moveTo(rad - 6, 0);
      for (let i = 1; i <= sides; i++) {
        const a = (i * Math.PI * 2) / sides;
        ring.lineTo(Math.cos(a) * (rad - 6), Math.sin(a) * (rad - 6));
      }
      ring.stroke({ color: 0xc4b5fd, width: 1, alpha: 0.5 });
      container.addChild(ring);

      inner = new Graphics();
      // 3 mini-cards fanned in centre.
      const drawCard = (x: number, y: number, rot: number, fillCol: number) => {
        const before = inner!.children;
        inner!
          .roundRect(-5, -7, 10, 14, 1.5)
          .fill(0xffffff)
          .stroke({ color: 0x000000, width: 1, alpha: 0.5 });
        inner!
          .roundRect(-4, -6, 8, 4, 1)
          .fill(fillCol);
        // We can't apply per-shape transforms easily — fake fan via individual
        // graphics children would be nicer; skip rotation for simplicity.
        void before;
        void x;
        void y;
        void rot;
      };
      drawCard(0, 0, 0, c);
      container.addChild(inner);

      particles = new Graphics();
      container.addChild(particles);

      return { glow, ring, inner, particles, labelY: 42, hitRadius: 30 };
    }

    if (style === "imperium") {
      // Castle gate — battlements on top.
      glow.circle(0, 0, 42).fill({ color: c, alpha: 0.15 });
      glow.circle(0, 0, 26).fill({ color: c, alpha: 0.22 });
      container.addChild(glow);

      // Tower base (rectangle).
      ring.roundRect(-24, -8, 48, 32, 2).fill(0x44403c).stroke({
        color: 0x000000,
        width: 1,
        alpha: 0.5,
      });
      // Battlements (3 crenels on top).
      ring
        .rect(-22, -16, 8, 8)
        .fill(0x44403c)
        .stroke({ color: 0x000000, width: 1, alpha: 0.5 });
      ring
        .rect(-4, -16, 8, 8)
        .fill(0x44403c)
        .stroke({ color: 0x000000, width: 1, alpha: 0.5 });
      ring
        .rect(14, -16, 8, 8)
        .fill(0x44403c)
        .stroke({ color: 0x000000, width: 1, alpha: 0.5 });
      // Gate opening with portal-color glow.
      ring
        .arc(0, 18, 12, Math.PI, 2 * Math.PI)
        .lineTo(12, 18)
        .lineTo(-12, 18)
        .closePath()
        .fill({ color: c, alpha: 0.6 });
      // Iron bars on the gate.
      for (const bx of [-7, 0, 7]) {
        ring
          .moveTo(bx, 6)
          .lineTo(bx, 18)
          .stroke({ color: 0x000000, width: 1.2, alpha: 0.6 });
      }
      container.addChild(ring);

      inner = new Graphics();
      // Banner.
      inner
        .moveTo(-6, -14)
        .lineTo(6, -14)
        .lineTo(6, -2)
        .lineTo(0, 1)
        .lineTo(-6, -2)
        .closePath()
        .fill(c);
      inner.circle(0, -8, 1.6).fill(0xfde68a);
      container.addChild(inner);

      particles = null;
      return { glow, ring, inner, particles, labelY: 38, hitRadius: 32 };
    }

    if (style === "skyline") {
      // Skyscraper silhouette + window lights.
      glow.circle(0, 0, 44).fill({ color: c, alpha: 0.15 });
      glow.circle(0, 0, 28).fill({ color: c, alpha: 0.22 });
      container.addChild(glow);

      // 3 building silhouettes of varying heights.
      const buildings = [
        { x: -20, w: 12, h: 28 },
        { x: -4, w: 14, h: 38 },
        { x: 12, w: 12, h: 24 },
      ];
      for (const b of buildings) {
        ring.rect(b.x, 14 - b.h, b.w, b.h).fill(0x1f2937).stroke({
          color: c,
          width: 1,
          alpha: 0.5,
        });
        // Windows.
        for (let row = 0; row < Math.floor(b.h / 6); row++) {
          for (let col = 0; col < Math.floor(b.w / 4); col++) {
            const wx = b.x + 1 + col * 4;
            const wy = 14 - b.h + 2 + row * 6;
            const lit = Math.random() > 0.4;
            ring.rect(wx, wy, 2, 2).fill({
              color: lit ? 0xfef08a : 0x0f172a,
              alpha: lit ? 0.85 : 1,
            });
          }
        }
      }
      // Antenna with red blink.
      ring
        .moveTo(3, -24)
        .lineTo(3, -32)
        .stroke({ color: 0x71717a, width: 1.5 });
      container.addChild(ring);

      inner = new Graphics();
      inner.circle(3, -32, 1.8).fill({ color: 0xef4444, alpha: 1 });
      container.addChild(inner);

      particles = null;
      return { glow, ring, inner, particles, labelY: 36, hitRadius: 32 };
    }

    if (style === "back") {
      // Compact back portal — small ring, low profile.
      glow.circle(0, 0, 26).fill({ color: c, alpha: 0.18 });
      container.addChild(glow);
      ring.circle(0, 0, 16).stroke({ color: c, width: 2, alpha: 0.85 });
      ring.circle(0, 0, 10).stroke({ color: 0xffffff, width: 1, alpha: 0.4 });
      container.addChild(ring);
      return {
        glow,
        ring,
        inner: null,
        particles: null,
        labelY: 28,
        hitRadius: 24,
      };
    }

    // Default — original look.
    glow.circle(0, 0, 36).fill({ color: c, alpha: 0.12 });
    glow.circle(0, 0, 26).fill({ color: c, alpha: 0.2 });
    container.addChild(glow);

    ring.circle(0, 0, 22).stroke({ color: c, width: 3, alpha: 0.8 });
    container.addChild(ring);

    return {
      glow,
      ring,
      inner: null,
      particles: null,
      labelY: 40,
      hitRadius: 32,
    };
  }

  private drawTable(table: TableLandmark) {
    const container = new Container();
    container.position.set(table.x, table.y);

    const hw = table.width / 2;
    const hh = table.height / 2;

    const shadow = new Graphics();
    shadow
      .ellipse(0, hh + 6, hw + 6, 10)
      .fill({ color: 0x000000, alpha: 0.4 });
    container.addChild(shadow);

    const felt = new Graphics();
    felt
      .roundRect(-hw, -hh, table.width, table.height, 12)
      .fill(table.feltColor)
      .stroke({ color: table.accentColor, width: 2, alpha: 0.7 });
    container.addChild(felt);

    const inner = new Graphics();
    inner
      .roundRect(-hw + 8, -hh + 8, table.width - 16, table.height - 16, 8)
      .stroke({ color: 0xffffff, width: 1, alpha: 0.15 });
    container.addChild(inner);

    // Detail decoration on big tables: dealer slot at the top, chip stacks.
    // Small tables (≤140px) stay minimal so the label remains readable.
    if (table.width >= 200) {
      const detail = new Graphics();
      // Dealer arc behind the felt (back of the table where the dealer
      // stands).
      detail
        .arc(0, -hh + 4, Math.min(hw * 0.35, 26), Math.PI, 2 * Math.PI)
        .lineTo(Math.min(hw * 0.35, 26), -hh + 4)
        .lineTo(-Math.min(hw * 0.35, 26), -hh + 4)
        .closePath()
        .fill({ color: 0x000000, alpha: 0.3 })
        .stroke({ color: table.accentColor, width: 1, alpha: 0.6 });
      // Two chip stacks at the bottom corners.
      const stackY = hh - 14;
      for (const sx of [-hw + 22, hw - 22]) {
        for (let i = 0; i < 3; i++) {
          detail
            .ellipse(sx, stackY - i * 3, 7, 2.5)
            .fill(i % 2 === 0 ? table.accentColor : 0xffffff)
            .stroke({ color: 0x000000, width: 0.6, alpha: 0.5 });
        }
      }
      container.addChild(detail);
    }

    const label = new Text({
      text: table.label,
      style: {
        fontFamily: "system-ui, sans-serif",
        fontSize: 14,
        fontWeight: "700",
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 3 },
      },
    });
    label.anchor.set(0.5, 0.5);
    label.position.set(0, 0);
    container.addChild(label);

    const seatsLabel = new Text({
      text: `${table.seats} places`,
      style: {
        fontFamily: "system-ui, sans-serif",
        fontSize: 10,
        fontWeight: "500",
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 2 },
      },
    });
    seatsLabel.anchor.set(0.5, 0.5);
    seatsLabel.position.set(0, 18);
    seatsLabel.alpha = 0.7;
    container.addChild(seatsLabel);

    if (table.href) {
      container.eventMode = "static";
      container.cursor = "pointer";
      container.on("pointerdown", (e) => {
        e.stopPropagation();
        const approachY = table.y + table.height / 2 + 30;
        this.pendingLandmark = table;
        this.pendingArrivalX = table.x;
        this.pendingArrivalY = approachY;
        this.onClickMove?.(table.x, approachY);
      });
      container.on("pointerover", () => {
        felt.alpha = 1.2;
      });
      container.on("pointerout", () => {
        felt.alpha = 1;
      });
    } else {
      container.alpha = 0.7;
    }

    this.landmarksLayer.addChild(container);
  }

  addPlayer(player: Player, options?: { skipBurst?: boolean }) {
    if (this.sprites.has(player.id)) return;
    const sprite = new PlayerSprite(player);
    this.sprites.set(player.id, sprite);
    this.playersLayer.addChild(sprite);
    if (!options?.skipBurst) {
      const c = player.appearance?.bodyColor
        ? parseInt(player.appearance.bodyColor.slice(1), 16)
        : parseInt(player.color.slice(1), 16);
      this.spawnArrivalBurst(player.x, player.y, c);
    }
  }

  removePlayer(id: string) {
    const sprite = this.sprites.get(id);
    if (!sprite) return;
    const pos = sprite.currentPosition();
    // Mirror burst on departure so others see the player vanish.
    this.spawnArrivalBurst(pos.x, pos.y, 0xa1a1aa);
    this.playersLayer.removeChild(sprite);
    sprite.destroy({ children: true });
    this.sprites.delete(id);
  }

  updatePlayer(id: string, x: number, y: number, direction: Direction) {
    this.sprites.get(id)?.setTarget(x, y, direction);
  }

  renamePlayer(id: string, name: string) {
    this.sprites.get(id)?.setName(name);
  }

  /** Live-update the cosmetic look of a player. Used by the customisation
   *  preview, and as soon as the server starts broadcasting appearance
   *  changes (Phase 3+). */
  updatePlayerAppearance(id: string, appearance: Appearance | undefined) {
    this.sprites.get(id)?.setAppearance(appearance);
  }

  getPlayerPosition(id: string): { x: number; y: number } | null {
    const sprite = this.sprites.get(id);
    return sprite ? sprite.currentPosition() : null;
  }

  destroy() {
    if (!this.app) return;
    this.app.destroy(true, { children: true, texture: true });
    this.app = null;
    this.sprites.clear();
    this.animatedPortals = [];
    this.ambianceParticles = [];
    this.bursts = [];
  }
}
