import { Application, Container, Graphics, Text } from "pixi.js";
import type { Direction, Player } from "@shared/types";

const SPEED_PX_PER_SEC = 180;
const TILE = 32;

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

export class PlazaScene {
  private app: Application | null = null;
  private world = new Container();
  private floor = new Graphics();
  private portalsLayer = new Container();
  private playersLayer = new Container();
  private sprites = new Map<string, PlayerSprite>();
  private width = 0;
  private height = 0;
  onClickMove?: (x: number, y: number) => void;

  async init(host: HTMLElement, width: number, height: number) {
    this.width = width;
    this.height = height;
    this.app = new Application();
    await this.app.init({
      width,
      height,
      backgroundColor: 0x0b0b14,
      antialias: true,
      resolution: Math.min(2, window.devicePixelRatio ?? 1),
      autoDensity: true,
    });

    host.innerHTML = "";
    host.appendChild(this.app.canvas);

    this.drawFloor();
    this.drawPortals();

    this.playersLayer.sortableChildren = true;

    this.app.stage.addChild(this.floor);
    this.app.stage.addChild(this.world);
    this.world.addChild(this.portalsLayer);
    this.world.addChild(this.playersLayer);

    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on("pointerdown", (e) => {
      const p = e.getLocalPosition(this.world);
      this.onClickMove?.(p.x, p.y);
    });

    this.app.ticker.add(() => {
      const dt = this.app!.ticker.deltaMS;
      for (const sprite of this.sprites.values()) sprite.tick(dt);
    });
  }

  private drawFloor() {
    const g = this.floor;
    g.clear();
    g.rect(0, 0, this.width, this.height).fill(0x12121c);

    for (let x = 0; x < this.width; x += TILE) {
      for (let y = 0; y < this.height; y += TILE) {
        const odd = ((x / TILE) & 1) ^ ((y / TILE) & 1);
        if (odd) {
          g.rect(x, y, TILE, TILE).fill({
            color: 0xffffff,
            alpha: 0.018,
          });
        }
      }
    }

    g.rect(0, 0, this.width, this.height).stroke({
      color: 0xffffff,
      alpha: 0.05,
      width: 1,
    });
  }

  private drawPortals() {
    const portals = [
      { x: 120, y: 110, color: 0xef4444, label: "Casino" },
      { x: this.width - 120, y: 110, color: 0x22c55e, label: "TCG" },
      { x: 120, y: this.height - 110, color: 0xf59e0b, label: "RPG" },
      {
        x: this.width - 120,
        y: this.height - 110,
        color: 0x6366f1,
        label: "Médiéval",
      },
      { x: this.width / 2, y: 90, color: 0xec4899, label: "Tycoon" },
    ];

    for (const p of portals) {
      const container = new Container();
      container.position.set(p.x, p.y);

      const glow = new Graphics();
      glow.circle(0, 0, 36).fill({ color: p.color, alpha: 0.12 });
      glow.circle(0, 0, 26).fill({ color: p.color, alpha: 0.2 });
      container.addChild(glow);

      const ring = new Graphics();
      ring
        .circle(0, 0, 22)
        .stroke({ color: p.color, width: 3, alpha: 0.8 });
      container.addChild(ring);

      const label = new Text({
        text: p.label,
        style: {
          fontFamily: "system-ui, sans-serif",
          fontSize: 11,
          fontWeight: "700",
          fill: 0xffffff,
          stroke: { color: 0x000000, width: 3 },
        },
      });
      label.anchor.set(0.5, 0.5);
      label.position.set(0, 40);
      container.addChild(label);

      this.portalsLayer.addChild(container);
    }
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
