/**
 * 场景接口（game/scenes.ts）
 */
export interface Scene {
  start(): Promise<void>;
  stop(): void;
}
