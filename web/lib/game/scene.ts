import { Application, Container, Graphics, Text } from "pixi.js";
import type { Direction, Player } from "@shared/types";

const SPEED_PX_PER_SEC = 180;
const TILE = 32;

export type PortalLandmark = {
  kind: "portal";
  id: string;
  x: number;
  y: number;
  color: number;
  label: string;
  href?: string;
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

export interface SceneConfig {
  width: number;
  height: number;
  backgroundColor: number;
  floorColor: number;
  floorAccentColor: number;
  floorAccentAlpha: number;
  landmarks: Landmark[];
}

class PlayerSprite extends Container {
  private body = new Graphics();
  private shadow = new Graphics();
  private nameLabel: Text;
  private targetX: number;
  private targetY: number;
  public direction: Direction;
  public readonly playerId: string;

  constructor(player: Player) {
    super();
    this.playerId = player.id;
    this.position.set(player.x, player.y);
    this.targetX = player.x;
    this.targetY = player.y;
    this.direction = player.direction;

    const color = parseInt(player.color.slice(1), 16);

    this.shadow.ellipse(0, 6, 14, 5).fill({ color: 0x000000, alpha: 0.35 });
    this.addChild(this.shadow);

    this.body
      .circle(0, 0, 13)
      .fill(color)
      .stroke({ width: 2, color: 0x000000, alpha: 0.5 });
    this.body
      .circle(-4, -3, 2)
      .fill(0xffffff)
      .circle(4, -3, 2)
      .fill(0xffffff);
    this.addChild(this.body);

    this.nameLabel = new Text({
      text: player.name,
      style: {
        fontFamily: "system-ui, sans-serif",
        fontSize: 11,
        fontWeight: "600",
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 3 },
      },
    });
    this.nameLabel.anchor.set(0.5, 1);
    this.nameLabel.position.set(0, -20);
    this.addChild(this.nameLabel);
  }

  setTarget(x: number, y: number, direction: Direction) {
    this.targetX = x;
    this.targetY = y;
    this.direction = direction;
  }

  setName(name: string) {
    this.nameLabel.text = name;
  }

  tick(dtMs: number) {
    const dx = this.targetX - this.position.x;
    const dy = this.targetY - this.position.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.25) {
      this.position.set(this.targetX, this.targetY);
      return;
    }
    const move = (SPEED_PX_PER_SEC * dtMs) / 1000;
    if (move >= dist) {
      this.position.set(this.targetX, this.targetY);
    } else {
      this.position.x += (dx / dist) * move;
      this.position.y += (dy / dist) * move;
    }
    this.zIndex = this.position.y;
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

export class GameScene {
  private app: Application | null = null;
  private world = new Container();
  private floor = new Graphics();
  private landmarksLayer = new Container();
  private playersLayer = new Container();
  private sprites = new Map<string, PlayerSprite>();
  private seatContainers = new Map<number, Container>();
  private readonly config: SceneConfig;
  private selfId: string | null = null;
  private pendingLandmark: Landmark | null = null;
  private pendingArrivalX: number | null = null;
  private pendingArrivalY: number | null = null;

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
    this.drawLandmarks();

    this.playersLayer.sortableChildren = true;

    this.app.stage.addChild(this.floor);
    this.app.stage.addChild(this.world);
    this.world.addChild(this.landmarksLayer);
    this.world.addChild(this.playersLayer);

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
      for (const sprite of this.sprites.values()) sprite.tick(dt);
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

    // Remove existing occupant visual (tagged via label "occupant")
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

    const body = new Graphics();
    body
      .circle(0, -12, 10)
      .fill(color)
      .stroke({ color: 0x000000, width: 1.5, alpha: 0.5 });
    body.circle(-3, -14, 1.5).fill(0xffffff);
    body.circle(3, -14, 1.5).fill(0xffffff);
    occupantContainer.addChild(body);

    const nameLabel = new Text({
      text: occupant.playerName,
      style: {
        fontFamily: "system-ui, sans-serif",
        fontSize: 10,
        fontWeight: "600",
        fill: 0xffffff,
        stroke: { color: 0x000000, width: 2 },
      },
    });
    nameLabel.anchor.set(0.5, 1);
    nameLabel.position.set(0, -26);
    occupantContainer.addChild(nameLabel);

    container.addChild(occupantContainer);
  }

  private drawPortal(portal: PortalLandmark) {
    const container = new Container();
    container.position.set(portal.x, portal.y);

    const glow = new Graphics();
    glow.circle(0, 0, 36).fill({ color: portal.color, alpha: 0.12 });
    glow.circle(0, 0, 26).fill({ color: portal.color, alpha: 0.2 });
    container.addChild(glow);

    const ring = new Graphics();
    ring.circle(0, 0, 22).stroke({ color: portal.color, width: 3, alpha: 0.8 });
    container.addChild(ring);

    const label = new Text({
      text: portal.label,
      style: {
        fontFamily: "system-ui, sans-serif",
        fontSize: 11,
        fontWeight: "700",
        fill: portal.href ? 0xffffff : 0x999999,
        stroke: { color: 0x000000, width: 3 },
      },
    });
    label.anchor.set(0.5, 0.5);
    label.position.set(0, 40);
    container.addChild(label);

    if (portal.href) {
      container.eventMode = "static";
      container.cursor = "pointer";
      container.hitArea = { contains: (x, y) => x * x + y * y <= 32 * 32 };
      container.on("pointerdown", (e) => {
        e.stopPropagation();
        this.pendingLandmark = portal;
        this.pendingArrivalX = portal.x;
        this.pendingArrivalY = portal.y;
        this.onClickMove?.(portal.x, portal.y);
      });
      container.on("pointerover", () => {
        ring.alpha = 1;
        glow.alpha = 1.3;
      });
      container.on("pointerout", () => {
        ring.alpha = 1;
        glow.alpha = 1;
      });
    } else {
      container.alpha = 0.45;
    }

    this.landmarksLayer.addChild(container);
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

  addPlayer(player: Player) {
    if (this.sprites.has(player.id)) return;
    const sprite = new PlayerSprite(player);
    this.sprites.set(player.id, sprite);
    this.playersLayer.addChild(sprite);
  }

  removePlayer(id: string) {
    const sprite = this.sprites.get(id);
    if (!sprite) return;
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

  getPlayerPosition(id: string): { x: number; y: number } | null {
    const sprite = this.sprites.get(id);
    return sprite ? sprite.currentPosition() : null;
  }

  destroy() {
    if (!this.app) return;
    this.app.destroy(true, { children: true, texture: true });
    this.app = null;
    this.sprites.clear();
  }
}
