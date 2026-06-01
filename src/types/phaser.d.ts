declare const __GIT_HASH__: string;

declare namespace Phaser.GameObjects {
  interface Shape {
    setLighting(enable: boolean): this;
  }

  interface Light {
    height: number;
  }
}
