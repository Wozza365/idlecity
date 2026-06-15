import Phaser from 'phaser';
import { UI_HEIGHT } from '../constants';
import { PanelChrome } from '../ui/PanelChrome';
import { PlotUI } from '../ui/PlotUI';
import { RoadUI } from '../ui/RoadUI';

const PANEL_SLIDE_MS = 280;
const PANEL_AUTO_COLLAPSE_MS = 30_000;

// Expandable bottom-sheet panel: owns the slide-up/down animation, the
// auto-collapse timer, and the backgrounds that travel with the panel.
// Extracted from GameScene — `rebuild()` is called once per buildLayout(),
// `applyOffset()`/`toggle()`/`expand()`/`collapse()`/`touch()` drive the
// panel afterwards using the references captured by `rebuild()`.
export class PanelController {
  private readonly scene: Phaser.Scene;
  private readonly onExpandChange: (expanded: boolean) => void;

  private panelBg!: Phaser.GameObjects.Rectangle;
  private expandPanelBg!: Phaser.GameObjects.Rectangle;
  private panelTween: Phaser.Tweens.Tween | null = null;
  private autoCollapseTimer: Phaser.Time.TimerEvent | null = null;

  private _expanded = false;
  private _offset = UI_HEIGHT;

  private panelTop = 0;
  private collapsedPanelTop = 0;
  private panelChrome!: PanelChrome;
  private roadUI!: RoadUI;
  private plotUIs!: PlotUI[];

  constructor(scene: Phaser.Scene, onExpandChange: (expanded: boolean) => void) {
    this.scene = scene;
    this.onExpandChange = onExpandChange;
  }

  get expanded(): boolean { return this._expanded; }
  get offset(): number { return this._offset; }

  /** (Re)creates the panel backgrounds and captures the chrome/UI references used by applyOffset(). */
  rebuild(width: number, panelTop: number, collapsedPanelTop: number, panelChrome: PanelChrome, roadUI: RoadUI, plotUIs: PlotUI[]): void {
    this.panelTop = panelTop;
    this.collapsedPanelTop = collapsedPanelTop;
    this.panelChrome = panelChrome;
    this.roadUI = roadUI;
    this.plotUIs = plotUIs;

    const height = this.scene.scale.height;

    this.panelBg?.destroy();
    this.panelBg = this.scene.add
      .rectangle(width / 2, (collapsedPanelTop + height) / 2, width, height - collapsedPanelTop, 0x1e2433)
      .setDepth(1)
      .setLighting(false);

    // Background for the expandable panel — overlays the game area when slid up
    this.expandPanelBg?.destroy();
    this.expandPanelBg = this.scene.add
      .rectangle(width / 2, (panelTop + collapsedPanelTop) / 2, width, collapsedPanelTop - panelTop, 0x1e2433)
      .setDepth(9.9)
      .setLighting(false);

    this.applyOffset(this._offset);
  }

  /** Call after recreating the RoadUI so applyOffset() targets the new container. */
  setRoadUI(roadUI: RoadUI): void {
    this.roadUI = roadUI;
  }

  // Shifts the upgrade panel (RoadUI/PlotUI columns + their chrome/background)
  // down by `offset` px from their fully-expanded position. offset=0 is fully
  // expanded; offset=UI_HEIGHT pushes the whole panel below the screen, leaving
  // only the fixed StatsBar visible.
  applyOffset(offset: number): void {
    this._offset = offset;
    this.panelChrome.slidingGfx.y = offset;
    this.expandPanelBg.y = (this.panelTop + this.collapsedPanelTop) / 2 + offset;
    this.roadUI.container.y = offset;
    for (const ui of this.plotUIs) ui.container.y = offset;
  }

  toggle(): void {
    if (this._expanded) this.collapse();
    else this.expand();
  }

  expand(): void {
    if (!this._expanded) {
      this._expanded = true;
      this.onExpandChange(true);
      this.animateTo(0);
    }
    this.resetAutoCollapseTimer();
  }

  collapse(): void {
    if (!this._expanded) return;
    this._expanded = false;
    this.onExpandChange(false);
    this.animateTo(UI_HEIGHT);
    this.clearAutoCollapseTimer();
  }

  // Resets the auto-collapse timer when the player interacts with an upgrade
  // button while the panel is expanded, so it doesn't slide away mid-tap.
  touch(): void {
    if (this._expanded) this.resetAutoCollapseTimer();
  }

  private animateTo(target: number): void {
    this.panelTween?.stop();
    this.panelTween = this.scene.tweens.addCounter({
      from: this._offset,
      to: target,
      duration: PANEL_SLIDE_MS,
      ease: 'Cubic.Out',
      onUpdate: () => {
        this.applyOffset(this.panelTween?.getValue() ?? target);
      },
    });
  }

  private resetAutoCollapseTimer(): void {
    this.clearAutoCollapseTimer();
    this.autoCollapseTimer = this.scene.time.delayedCall(PANEL_AUTO_COLLAPSE_MS, () => this.collapse());
  }

  private clearAutoCollapseTimer(): void {
    this.autoCollapseTimer?.remove();
    this.autoCollapseTimer = null;
  }
}
