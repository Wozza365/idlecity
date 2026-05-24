declare namespace Phaser.GameObjects {
  interface Shape {
    setLighting(enable: boolean): this;
  }

  interface Light {
    height: number;
  }
}
