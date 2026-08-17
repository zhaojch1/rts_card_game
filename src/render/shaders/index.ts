/**
 * 自定义 shader 特效（render/shaders/）—— 需求 5.3 精细化价值点。
 *
 * PixiJS v8 Filter：GLSL ES 3.0。约定：
 *  - 顶点着色器使用默认滤镜顶点（提供 vTextureCoord）；
 *  - 片段着色器声明 `out vec4 finalColor`；
 *  - 输入纹理统一绑定为 uTexture（Pixi 自动注入）；
 *  - 自定义 uniform 放在具名 UniformGroup 中，经 filter.resources.<组>.uniforms 更新。
 */
import { Filter, GlProgram } from 'pixi.js';

export const DEFAULT_FILTER_VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

/** 便捷类型：读取具名 UniformGroup 的 uniforms（值为原始类型，直接赋值） */
type Uniforms = Record<string, unknown>;

function group(filter: Filter, name: string): Uniforms {
  const g = filter.resources[name] as { uniforms: Uniforms } | undefined;
  if (!g) throw new Error(`[shaders] 找不到 uniform 组 ${name}`);
  return g.uniforms;
}

/** —— 受击闪白（需求 5.3 / 9.2.3） —— */
const FLASH_FRAG = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uFlash;

void main(void) {
    vec4 c = texture(uTexture, vTextureCoord);
    c.rgb = mix(c.rgb, vec3(1.0), uFlash);
    finalColor = c;
}
`;

export class FlashFilter {
  readonly filter: Filter;

  constructor() {
    this.filter = new Filter({
      glProgram: new GlProgram({ vertex: DEFAULT_FILTER_VERTEX, fragment: FLASH_FRAG }),
      resources: { flashUniforms: { uFlash: { value: 0, type: 'f32' } } },
    });
  }

  /** 闪白强度 0..1 */
  set amount(v: number) {
    group(this.filter, 'flashUniforms').uFlash = v;
  }
}

/** —— 描边/外发光（需求 5.3：选中单位、稀有度高亮） —— */
const OUTLINE_FRAG = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize; // xy=输入纹理像素尺寸, zw=1/尺寸（FilterSystem 注入；须与顶点精度一致）
uniform float uOutlineWidth;
uniform vec4 uOutlineColor;

void main(void) {
    vec4 c = texture(uTexture, vTextureCoord);
    if (uOutlineWidth <= 0.001) {
        finalColor = c;
        return;
    }
    vec2 px = uInputSize.zw;
    float m = 0.0;
    for (int i = -2; i <= 2; i++) {
        for (int j = -2; j <= 2; j++) {
            if (i == 0 && j == 0) continue;
            m = max(m, texture(uTexture, vTextureCoord + vec2(float(i), float(j)) * px * uOutlineWidth).a);
        }
    }
    float edge = m * (1.0 - c.a); // 只有透明边缘外圈着描边色
    vec3 rgb = mix(c.rgb, uOutlineColor.rgb, edge);
    finalColor = vec4(rgb, c.a + edge * (1.0 - c.a));
}
`;

export class OutlineFilter {
  readonly filter: Filter;

  constructor() {
    this.filter = new Filter({
      glProgram: new GlProgram({ vertex: DEFAULT_FILTER_VERTEX, fragment: OUTLINE_FRAG }),
      resources: {
        outlineUniforms: {
          uOutlineWidth: { value: 0, type: 'f32' },
          uOutlineColor: { value: [0.35, 0.85, 1.0, 1.0], type: 'vec4<f32>' },
        },
      },
    });
  }

  /** 描边宽度（像素），0 = 关闭 */
  set width(v: number) {
    group(this.filter, 'outlineUniforms').uOutlineWidth = v;
  }

  set color(c: [number, number, number, number]) {
    group(this.filter, 'outlineUniforms').uOutlineColor = c;
  }
}

/** —— 死亡溶解（需求 5.3 / 9.2.6：噪声纹理驱动边缘消散） —— */
const DISSOLVE_FRAG = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform sampler2D uNoise;
uniform float uDissolve;
uniform float uNoiseScale;
uniform float uSeed;

void main(void) {
    vec4 c = texture(uTexture, vTextureCoord);
    if (c.a <= 0.001) { finalColor = c; return; }
    vec2 nuv = vTextureCoord * uNoiseScale + vec2(uSeed, uSeed * 1.7);
    float n = texture(uNoise, fract(nuv)).r;
    float d = uDissolve;
    // 噪声低于阈值的像素消融：d=0 时无消融，d=1 时全部消融
    float edge = 1.0 - smoothstep(d - 0.06, d, n);      // 1 = 已消融
    float glow = smoothstep(d - 0.06, d, n) * (1.0 - smoothstep(d, d + 0.06, n)) * d;
    c.a *= (1.0 - edge);
    c.rgb += vec3(1.0, 0.75, 0.35) * glow * 0.9;        // 消融边界微亮
    finalColor = c;
}
`;

export class DissolveFilter {
  readonly filter: Filter;

  constructor(noiseTexture: import('pixi.js').TextureSource) {
    this.filter = new Filter({
      glProgram: new GlProgram({ vertex: DEFAULT_FILTER_VERTEX, fragment: DISSOLVE_FRAG }),
      resources: {
        dissolveUniforms: {
          uDissolve: { value: 0, type: 'f32' },
          uNoiseScale: { value: 2.5, type: 'f32' },
          uSeed: { value: 0.37, type: 'f32' },
        },
        uNoise: noiseTexture,
      },
    });
  }

  /** 溶解进度 0..1（1 = 完全消失） */
  set progress(v: number) {
    group(this.filter, 'dissolveUniforms').uDissolve = v;
  }
}
