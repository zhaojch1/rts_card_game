/**
 * 资源加载与缓存（core/loader.ts）
 *
 * 当前资产全部为程序化生成（无外部文件），loader 负责：
 *  1. 把烘焙好的图集画布转换为各 slot 的纹理句柄；
 *  2. 为未来外部资源（编辑器导出的 DragonBones 数据、图片、音频）预留 fetch/缓存接口。
 */

export interface LoadedTexture {
  /** 不透明纹理句柄（render 层内部解释；对上层仅作为标识传递） */
  readonly handle: unknown;
  readonly name: string;
}

export interface AtlasTextureProvider {
  /** 按部件名获取烘焙纹理句柄（无则返回 undefined） */
  getTexture(name: string): LoadedTexture | undefined;
  /** 所有已加载纹理名 */
  names(): string[];
}

/**
 * 通用资源缓存：name → T。
 * 后续外部资源（图片/音频/骨骼数据）统一经由此缓存，避免重复加载。
 */
export class ResourceCache<T> {
  private readonly map = new Map<string, T>();

  set(name: string, value: T): void {
    this.map.set(name, value);
  }

  get(name: string): T | undefined {
    return this.map.get(name);
  }

  has(name: string): boolean {
    return this.map.has(name);
  }

  delete(name: string): void {
    this.map.delete(name);
  }

  clear(): void {
    this.map.clear();
  }

  keys(): string[] {
    return [...this.map.keys()];
  }
}
