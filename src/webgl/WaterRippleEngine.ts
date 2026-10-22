/**
 * WebGL 2 Water Ripple Simulation Engine
 * 
 * Features:
 * - 2D Wave Equation Finite Difference Solver on GPU (Ping-Pong FBOs)
 * - Displacement Mapping & Snell's Law Refraction
 * - Blinn-Phong Specular Highlights & Sunlight Glints
 * - Animated Dynamic Caustics
 * - Smooth Damping & Decay
 * - Touch & Mouse Ripple Disturbance
 * - Resilient CPU fallback for universally guaranteed execution
 */

export interface WaterOptions {
  damping: number; // 0.95 to 0.998
  waveSpeed: number; // 1.0 to 2.0
  refractionStrength: number; // 0.01 to 0.08
  specularStrength: number; // 0.5 to 3.0
  specularShininess: number; // 16 to 128
  causticsStrength: number; // 0.0 to 1.0
  waterTint: [number, number, number]; // RGB 0..1
  tintStrength: number; // 0.0 to 0.5
  dropRadius: number; // 0.01 to 0.08
  dropStrength: number; // 0.1 to 1.5
  requireClick: boolean; // Chỉ tạo sóng khi nhấn giữ chuột/chạm
  wakeWidth: number; // Độ rộng rẽ sóng (Bow wave width)
  wakeIntensity: number; // Lực rẽ sóng
}

export class WaterRippleEngine {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | WebGLRenderingContext | null = null;
  private isWebGL2: boolean = false;
  private floatTextureSupported: boolean = false;

  // Simulation resolution
  public simWidth = 512;
  public simHeight = 512;

  // WebGL Objects
  private quadVAO: WebGLVertexArrayObject | null = null;
  private quadBuffer: WebGLBuffer | null = null;

  // Textures and FBOs for GPU simulation
  private waveTextures: (WebGLTexture | null)[] = [null, null];
  private waveFBOs: (WebGLFramebuffer | null)[] = [null, null];
  private currentReadIndex = 0;

  // Background and caustics textures
  private backgroundTexture: WebGLTexture | null = null;
  private causticsTexture: WebGLTexture | null = null;

  // Shaders
  private simProgram: WebGLProgram | null = null;
  private dropProgram: WebGLProgram | null = null;
  private renderProgram: WebGLProgram | null = null;

  // CPU fallback wave simulation buffers (used if GPU float FBO is unsupported)
  private useCpuSim = false;
  private cpuBufferA: Float32Array | null = null;
  private cpuBufferB: Float32Array | null = null;
  private cpuReadBuffer: Float32Array | null = null;
  private cpuWriteBuffer: Float32Array | null = null;

  // Configurable parameters
  public options: WaterOptions = {
    damping: 0.962, // Sóng tắt dần tự nhiên nhanh hơn
    waveSpeed: 1.85,
    refractionStrength: 0.038,
    specularStrength: 1.8,
    specularShininess: 56.0,
    causticsStrength: 0.5,
    waterTint: [0.04, 0.22, 0.32],
    tintStrength: 0.22,
    dropRadius: 0.018, // Giọt nước nhẹ hơn
    dropStrength: 0.30, // Lực giọt êm dịu hơn
    requireClick: true, // Chỉ tạo sóng khi nhấn giữ chuột
    wakeWidth: 0.014, // Độ rộng rẽ sóng gọn gàng ngay tại chuột
    wakeIntensity: 0.32, // Lực rẽ sóng nhẹ nhàng, êm ái
  };

  private animationFrameId: number | null = null;
  private lastPointerPos: { x: number; y: number } | null = null;
  private isPointerDown = false;
  private startTime = performance.now();

  // Callbacks
  public onDropAdded?: (normalizedX: number, normalizedY: number, strength: number) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.canvas.style.touchAction = 'none';

    this.initGL();
    this.initSimulation();
    this.initRenderPipeline();
    this.setupEventListeners();
  }

  private initGL(): void {
    const glOptions: WebGLContextAttributes = {
      alpha: false,
      depth: false,
      stencil: false,
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    };

    // Try WebGL 2 first
    let gl = this.canvas.getContext('webgl2', glOptions) as WebGL2RenderingContext | null;
    if (gl) {
      this.isWebGL2 = true;
      this.gl = gl;
      // In WebGL 2, color_buffer_float allows rendering to RGBA32F or RGBA16F
      const extFloat = gl.getExtension('EXT_color_buffer_float');
      const extLinear = gl.getExtension('OES_texture_float_linear');
      this.floatTextureSupported = !!(extFloat && extLinear);
    } else {
      // Fallback to WebGL 1
      this.isWebGL2 = false;
      const gl1 = (this.canvas.getContext('webgl', glOptions) ||
        this.canvas.getContext('experimental-webgl', glOptions)) as WebGLRenderingContext | null;
      this.gl = gl1;
      if (gl1) {
        gl1.getExtension('OES_texture_float');
        gl1.getExtension('OES_texture_float_linear');
      }
    }

    if (!this.gl) {
      throw new Error('WebGL is not supported in this browser environment.');
    }
  }

  private createShader(type: number, source: string): WebGLShader {
    const gl = this.gl!;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Failed to create shader');
    gl.shaderSource(shader, source.trim());
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Shader compile error: ${info}\nSource:\n${source}`);
    }
    return shader;
  }

  private createProgram(vsSource: string, fsSource: string): WebGLProgram {
    const gl = this.gl!;
    const vs = this.createShader(gl.VERTEX_SHADER, vsSource);
    const fs = this.createShader(gl.FRAGMENT_SHADER, fsSource);
    const prog = gl.createProgram();
    if (!prog) throw new Error('Failed to create program');
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(prog);
      gl.deleteProgram(prog);
      throw new Error(`Program link error: ${info}`);
    }
    return prog;
  }

  private initSimulation(): void {
    const gl = this.gl!;
    const w = this.simWidth;
    const h = this.simHeight;

    // Full screen quad geometry
    const quadVertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]);

    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

    if (this.isWebGL2) {
      const gl2 = gl as WebGL2RenderingContext;
      this.quadVAO = gl2.createVertexArray();
      gl2.bindVertexArray(this.quadVAO);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl2.bindVertexArray(null);
    }

    // Try GPU Ping-Pong FBO setup
    let gpuFboSuccess = false;
    if (this.isWebGL2 && this.floatTextureSupported) {
      const gl2 = gl as WebGL2RenderingContext;
      try {
        for (let i = 0; i < 2; i++) {
          const tex = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl2.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          this.waveTextures[i] = tex;

          const fbo = gl.createFramebuffer();
          gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

          const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
          if (status !== gl.FRAMEBUFFER_COMPLETE) {
            throw new Error(`FBO incomplete status: ${status}`);
          }
          this.waveFBOs[i] = fbo;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gpuFboSuccess = true;
      } catch (err) {
        console.warn('GPU Float FBO not fully viable, falling back to CPU wave solver:', err);
        gpuFboSuccess = false;
      }
    }

    if (!gpuFboSuccess) {
      // Setup CPU simulation fallback
      this.useCpuSim = true;
      const size = w * h;
      this.cpuBufferA = new Float32Array(size);
      this.cpuBufferB = new Float32Array(size);
      this.cpuReadBuffer = this.cpuBufferA;
      this.cpuWriteBuffer = this.cpuBufferB;

      // Texture to upload CPU wave data to GPU
      const tex = gl.createTexture();
      if (this.isWebGL2) {
        const gl2 = gl as WebGL2RenderingContext;
        gl.texImage2D(gl.TEXTURE_2D, 0, gl2.R32F, w, h, 0, gl2.RED, gl.FLOAT, null);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, w, h, 0, gl.LUMINANCE, gl.FLOAT, null);
      }
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.waveTextures[0] = tex;
    }

    // Compile GPU Wave Equation Update Shader
    const vsSim = `#version 300 es
      in vec2 a_pos;
      out vec2 v_uv;
      void main() {
        v_uv = a_pos * 0.5 + 0.5;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }
    `;

    const fsSim = `#version 300 es
      precision highp float;
      in vec2 v_uv;
      uniform sampler2D u_waveTexture;
      uniform vec2 u_texelSize;
      uniform float u_damping;
      uniform float u_speed;
      out vec4 fragColor;

      void main() {
        // Red channel = current height, Green channel = previous height
        vec4 center = texture(u_waveTexture, v_uv);
        float current = center.r;
        float prev = center.g;

        float left = texture(u_waveTexture, v_uv - vec2(u_texelSize.x, 0.0)).r;
        float right = texture(u_waveTexture, v_uv + vec2(u_texelSize.x, 0.0)).r;
        float top = texture(u_waveTexture, v_uv + vec2(0.0, u_texelSize.y)).r;
        float bottom = texture(u_waveTexture, v_uv - vec2(0.0, u_texelSize.y)).r;

        // Wave Equation Solver
        // Hugo Elias / 2D Wave formulation with damping
        float laplacian = (left + right + top + bottom) * 0.25 - current;
        float next = (current * 2.0 - prev + laplacian * u_speed) * u_damping;

        // Clamp to prevent overflow instabilities
        next = clamp(next, -2.0, 2.0);

        fragColor = vec4(next, current, 0.0, 1.0);
      }
    `;

    // Drop Shader
    const fsDrop = `#version 300 es
      precision highp float;
      in vec2 v_uv;
      uniform sampler2D u_waveTexture;
      uniform vec2 u_dropCenter;
      uniform float u_dropRadius;
      uniform float u_dropStrength;
      uniform float u_aspect;
      out vec4 fragColor;

      void main() {
        vec4 state = texture(u_waveTexture, v_uv);
        vec2 diff = (v_uv - u_dropCenter);
        diff.x *= u_aspect;
        float dist = length(diff);

        if (dist < u_dropRadius) {
          float factor = 0.5 + 0.5 * cos(dist / u_dropRadius * 3.14159265);
          state.r += u_dropStrength * factor;
        }

        fragColor = state;
      }
    `;

    if (this.isWebGL2 && !this.useCpuSim) {
      this.simProgram = this.createProgram(vsSim, fsSim);
      this.dropProgram = this.createProgram(vsSim, fsDrop);
    }
  }

  private initRenderPipeline(): void {
    const gl = this.gl!;

    const vsRender = `#version 300 es
      in vec2 a_pos;
      out vec2 v_uv;
      void main() {
        v_uv = a_pos * 0.5 + 0.5;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }
    `;

    const fsRender = `#version 300 es
      precision highp float;
      in vec2 v_uv;

      uniform sampler2D u_waveTexture;
      uniform sampler2D u_backgroundTexture;
      uniform sampler2D u_causticsTexture;
      uniform vec2 u_texelSize;

      uniform float u_refractionStrength;
      uniform float u_specularStrength;
      uniform float u_specularShininess;
      uniform float u_causticsStrength;
      uniform float u_time;
      uniform vec3 u_sunDirection;
      uniform vec3 u_waterTint;
      uniform float u_tintStrength;

      out vec4 fragColor;

      void main() {
        // Sample height neighbors for surface normal calculation
        float hL = texture(u_waveTexture, v_uv - vec2(u_texelSize.x, 0.0)).r;
        float hR = texture(u_waveTexture, v_uv + vec2(u_texelSize.x, 0.0)).r;
        float hB = texture(u_waveTexture, v_uv - vec2(0.0, u_texelSize.y)).r;
        float hT = texture(u_waveTexture, v_uv + vec2(0.0, u_texelSize.y)).r;
        float hC = texture(u_waveTexture, v_uv).r;

        // Normal vector via central differences
        float dx = (hR - hL);
        float dy = (hT - hB);
        vec3 normal = normalize(vec3(-dx * 14.0, -dy * 14.0, 1.0));

        // Eye ray looking straight down into the pool
        vec3 eye = vec3(0.0, 0.0, 1.0);

        // Refraction vector (Snell's Law approximation for water eta = 1.333)
        vec3 refr = refract(-eye, normal, 0.75);
        vec2 uvOffset = refr.xy * u_refractionStrength;

        // Displaced UV coordinates for the lake bed / koi fish
        vec2 displacedUV = clamp(v_uv + uvOffset, 0.001, 0.999);
        vec4 bg = texture(u_backgroundTexture, displacedUV);

        // Dynamic Caustics sampling (distorted by wave refraction and gentle animated drift)
        vec2 cUV1 = displacedUV * 1.8 + vec2(u_time * 0.016, u_time * 0.012) + uvOffset * 2.0;
        vec2 cUV2 = displacedUV * 2.4 - vec2(u_time * 0.020, -u_time * 0.014) - uvOffset * 1.5;
        float c1 = texture(u_causticsTexture, fract(cUV1)).r;
        float c2 = texture(u_causticsTexture, fract(cUV2)).r;
        float causticsLight = min(c1, c2) * u_causticsStrength;

        // Specular Highlights (Blinn-Phong model)
        vec3 lightDir = normalize(u_sunDirection);
        vec3 halfVec = normalize(lightDir + eye);
        float NdotH = max(dot(normal, halfVec), 0.0);
        float specular = pow(NdotH, u_specularShininess) * u_specularStrength;

        // Sparkle sun glints concentrated on wave crests
        float peakGlint = pow(max(dot(normal, lightDir), 0.0), u_specularShininess * 1.4) * u_specularStrength * 0.5;

        // Fresnel reflection (Schlick approximation)
        float NdotV = max(dot(normal, eye), 0.0);
        float fresnel = 0.03 + 0.97 * pow(1.0 - NdotV, 4.0);
        vec3 skyColor = vec3(0.78, 0.89, 0.98);

        // Water depth absorption and turquoise tint
        vec3 underWater = bg.rgb + vec3(causticsLight);
        vec3 tintedWater = mix(underWater, u_waterTint, u_tintStrength);

        // Final Composite: Water surface + Fresnel sky reflection + sparkling sunlight specular
        vec3 finalColor = mix(tintedWater, skyColor, fresnel * 0.28);
        finalColor += vec3(specular + peakGlint) * vec3(1.0, 0.98, 0.92);

        fragColor = vec4(finalColor, 1.0);
      }
    `;

    this.renderProgram = this.createProgram(vsRender, fsRender);
  }

  public setBackgroundTexture(source: HTMLImageElement | HTMLCanvasElement): void {
    const gl = this.gl!;
    if (!this.backgroundTexture) {
      this.backgroundTexture = gl.createTexture();
    }
    gl.bindTexture(gl.TEXTURE_2D, this.backgroundTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  public setCausticsTexture(img: HTMLImageElement): void {
    const gl = this.gl!;
    if (!this.causticsTexture) {
      this.causticsTexture = gl.createTexture();
    }
    gl.bindTexture(gl.TEXTURE_2D, this.causticsTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  }

  /**
   * Thêm một giọt nước tròn (circular ripple) tại tọa độ chuẩn hóa [0..1]
   */
  public addDrop(x: number, y: number, strength?: number, radius?: number): void {
    const str = strength ?? this.options.dropStrength;
    const rad = radius ?? this.options.dropRadius;
    this.addDropInternal(x, y, str, rad);
    if (this.onDropAdded) {
      this.onDropAdded(x, y, str);
    }
  }

  /**
   * Thêm tác động lên lưới mô phỏng không kích hoạt callback âm thanh lặp lại
   */
  public addDropInternal(x: number, y: number, strength: number, radius: number): void {
    const glY = 1.0 - y;
    if (this.useCpuSim) {
      this.addDropCpu(x, glY, strength, radius);
    } else {
      this.addDropGpu(x, glY, strength, radius);
    }
  }

  /**
   * Hiệu ứng rẽ sóng chân thực (Bow wave / Kelvin wake parting)
   * Nước bị rẽ mạnh sang 2 bên tạo sóng hình chữ V, để lại rãnh trũng ở giữa
   * và gờ sóng cao dâng lên ở 2 bên sườn.
   */
  /**
   * Hiệu ứng rẽ sóng chân thực (Bow wave / Kelvin wake parting)
   * Nước bị rẽ nhẹ nhàng sang 2 bên ngay tại vị trí kéo chuột theo hướng chuẩn xác,
   * không bị lệch hướng theo tỉ lệ màn hình.
   */
  public addWake(
    x0: number, y0: number,
    x1: number, y1: number,
    strength?: number,
    wakeWidth?: number
  ): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const aspect = this.canvas.width / this.canvas.height;

    // Chuyển đổi sang không gian màn hình hiệu chỉnh tỉ lệ khung hình (Aspect-corrected)
    const dxScreen = dx * aspect;
    const dyScreen = dy;
    const distScreen = Math.hypot(dxScreen, dyScreen);
    if (distScreen < 0.002) return;

    const str = strength ?? this.options.wakeIntensity;
    const width = wakeWidth ?? this.options.wakeWidth;

    // Vector hướng chuẩn hóa trong không gian màn hình
    const udx = dxScreen / distScreen;
    const udy = dyScreen / distScreen;

    // Vector pháp tuyến thực sự vuông góc 90 độ với hướng di chuyển
    const nx = -udy;
    const ny = udx;

    // Chuyển đổi offset pháp tuyến trở lại tọa độ UV chuẩn hóa
    const offsetX = (nx * width) / aspect;
    const offsetY = ny * width;

    // Số bước nội suy vừa phải (tối đa 3 bước) để sóng êm ái, nhẹ nhàng, không bị tích tụ quá mức
    const steps = Math.max(1, Math.min(3, Math.ceil(distScreen / 0.012)));

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const px = x0 + dx * t;
      const py = y0 + dy * t;

      // 1. Sóng rẽ nhẹ sang sườn trái
      this.addDropInternal(
        px + offsetX,
        py + offsetY,
        str * 0.40,
        width * 1.05
      );

      // 2. Sóng rẽ nhẹ sang sườn phải
      this.addDropInternal(
        px - offsetX,
        py - offsetY,
        str * 0.40,
        width * 1.05
      );

      // 3. Rãnh sóng trũng ở giữa
      this.addDropInternal(
        px,
        py,
        -str * 0.20,
        width * 0.85
      );
    }

    if (this.onDropAdded) {
      this.onDropAdded(x1, y1, str);
    }
  }

  private addDropGpu(x: number, y: number, strength: number, radius: number): void {
    const gl = this.gl as WebGL2RenderingContext;
    if (!this.dropProgram) return;

    const readIdx = this.currentReadIndex;
    const writeIdx = 1 - readIdx;

    gl.useProgram(this.dropProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.waveFBOs[writeIdx]);
    gl.viewport(0, 0, this.simWidth, this.simHeight);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.waveTextures[readIdx]);
    gl.uniform1i(gl.getUniformLocation(this.dropProgram, 'u_waveTexture'), 0);

    gl.uniform2f(gl.getUniformLocation(this.dropProgram, 'u_dropCenter'), x, y);
    gl.uniform1f(gl.getUniformLocation(this.dropProgram, 'u_dropRadius'), radius);
    gl.uniform1f(gl.getUniformLocation(this.dropProgram, 'u_dropStrength'), strength);
    gl.uniform1f(gl.getUniformLocation(this.dropProgram, 'u_aspect'), this.canvas.width / this.canvas.height);

    this.renderQuad();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.currentReadIndex = writeIdx;
  }

  private addDropCpu(x: number, y: number, strength: number, radius: number): void {
    if (!this.cpuReadBuffer) return;
    const w = this.simWidth;
    const h = this.simHeight;
    const aspect = this.canvas.width / this.canvas.height;
    const cx = Math.floor(x * w);
    const cy = Math.floor(y * h);
    const rPixels = Math.floor(radius * w);

    for (let j = Math.max(1, cy - rPixels); j < Math.min(h - 1, cy + rPixels); j++) {
      for (let i = Math.max(1, cx - rPixels); i < Math.min(w - 1, cx + rPixels); i++) {
        const dx = ((i - cx) / w) * aspect;
        const dy = (j - cy) / h;
        const dist = Math.hypot(dx, dy);
        if (dist < radius) {
          const factor = 0.5 + 0.5 * Math.cos((dist / radius) * Math.PI);
          this.cpuReadBuffer[j * w + i] += strength * factor;
        }
      }
    }
  }

  private stepSimulation(): void {
    if (this.useCpuSim) {
      this.stepSimulationCpu();
    } else {
      this.stepSimulationGpu();
    }
  }

  private stepSimulationGpu(): void {
    const gl = this.gl as WebGL2RenderingContext;
    if (!this.simProgram) return;

    const readIdx = this.currentReadIndex;
    const writeIdx = 1 - readIdx;

    gl.useProgram(this.simProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.waveFBOs[writeIdx]);
    gl.viewport(0, 0, this.simWidth, this.simHeight);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.waveTextures[readIdx]);
    gl.uniform1i(gl.getUniformLocation(this.simProgram, 'u_waveTexture'), 0);

    // Khi nhấn giữ chuột: sử dụng damping đã cấu hình (sóng lan tỏa tự nhiên)
    // Khi buông chuột: hạ damping xuống 0.930 để sóng tắt dần nhanh chóng, không bị dư chấn kéo dài
    const activeDamping = this.isPointerDown ? this.options.damping : Math.min(this.options.damping, 0.930);

    gl.uniform2f(gl.getUniformLocation(this.simProgram, 'u_texelSize'), 1.0 / this.simWidth, 1.0 / this.simHeight);
    gl.uniform1f(gl.getUniformLocation(this.simProgram, 'u_damping'), activeDamping);
    gl.uniform1f(gl.getUniformLocation(this.simProgram, 'u_speed'), this.options.waveSpeed);

    this.renderQuad();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.currentReadIndex = writeIdx;
  }

  private stepSimulationCpu(): void {
    if (!this.cpuReadBuffer || !this.cpuWriteBuffer) return;
    const w = this.simWidth;
    const h = this.simHeight;
    const curr = this.cpuReadBuffer;
    const next = this.cpuWriteBuffer;
    const activeDamping = this.isPointerDown ? this.options.damping : Math.min(this.options.damping, 0.930);

    // Fast 2D Wave Solver loop
    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      for (let x = 1; x < w - 1; x++) {
        const idx = row + x;
        const wave = ((curr[idx - 1] + curr[idx + 1] + curr[idx - w] + curr[idx + w]) * 0.5 - next[idx]) * activeDamping;
        next[idx] = wave;
      }
    }

    // Swap read and write buffers
    this.cpuReadBuffer = next;
    this.cpuWriteBuffer = curr;

    // Upload to GPU texture
    const gl = this.gl!;
    gl.bindTexture(gl.TEXTURE_2D, this.waveTextures[0]);
    if (this.isWebGL2) {
      const gl2 = gl as WebGL2RenderingContext;
      gl2.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl2.RED, gl.FLOAT, this.cpuReadBuffer);
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.LUMINANCE, gl.FLOAT, this.cpuReadBuffer);
    }
  }

  public render(customBackground?: HTMLImageElement | HTMLCanvasElement): void {
    const gl = this.gl!;
    if (!this.renderProgram) return;

    // Step the Wave Equation simulation
    this.stepSimulation();

    // If an animated layer (e.g. Koi fish) is provided, update the background texture
    if (customBackground) {
      this.setBackgroundTexture(customBackground);
    }

    // Render pass: Compute refraction, specular, and render to canvas viewport
    gl.useProgram(this.renderProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    // Bind Wave Texture
    gl.activeTexture(gl.TEXTURE0);
    const waveTex = this.useCpuSim ? this.waveTextures[0] : this.waveTextures[this.currentReadIndex];
    gl.bindTexture(gl.TEXTURE_2D, waveTex);
    gl.uniform1i(gl.getUniformLocation(this.renderProgram, 'u_waveTexture'), 0);

    // Bind Background Texture
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.backgroundTexture);
    gl.uniform1i(gl.getUniformLocation(this.renderProgram, 'u_backgroundTexture'), 1);

    // Bind Caustics Texture
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.causticsTexture);
    gl.uniform1i(gl.getUniformLocation(this.renderProgram, 'u_causticsTexture'), 2);

    // Uniforms
    gl.uniform2f(gl.getUniformLocation(this.renderProgram, 'u_texelSize'), 1.0 / this.simWidth, 1.0 / this.simHeight);
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, 'u_refractionStrength'), this.options.refractionStrength);
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, 'u_specularStrength'), this.options.specularStrength);
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, 'u_specularShininess'), this.options.specularShininess);
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, 'u_causticsStrength'), this.options.causticsStrength);
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, 'u_time'), (performance.now() - this.startTime) / 1000);

    // Sun light vector (angled sunlight)
    gl.uniform3f(gl.getUniformLocation(this.renderProgram, 'u_sunDirection'), 0.35, 0.45, 0.82);

    // Water depth tint
    const tint = this.options.waterTint;
    gl.uniform3f(gl.getUniformLocation(this.renderProgram, 'u_waterTint'), tint[0], tint[1], tint[2]);
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, 'u_tintStrength'), this.options.tintStrength);

    this.renderQuad();
  }

  private renderQuad(): void {
    const gl = this.gl!;
    if (this.isWebGL2 && this.quadVAO) {
      const gl2 = gl as WebGL2RenderingContext;
      gl2.bindVertexArray(this.quadVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl2.bindVertexArray(null);
    } else {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  }

  public clearWater(): void {
    const gl = this.gl!;
    if (this.useCpuSim) {
      if (this.cpuBufferA) this.cpuBufferA.fill(0);
      if (this.cpuBufferB) this.cpuBufferB.fill(0);
    } else {
      for (let i = 0; i < 2; i++) {
        if (this.waveFBOs[i]) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.waveFBOs[i]);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }

  public resize(width: number, height: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.floor(width * dpr);
    const targetH = Math.floor(height * dpr);

    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }
  }

  private setupEventListeners(): void {
    const canvas = this.canvas;

    const getNormalizedPos = (e: MouseEvent | Touch) => {
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
    };

    // Pointer Down
    canvas.addEventListener('pointerdown', (e) => {
      this.isPointerDown = true;
      const pos = getNormalizedPos(e);
      this.lastPointerPos = pos;
      // Giọt nước nhẹ nhàng êm ái ngay tại điểm nhấn chuột
      this.addDrop(pos.x, pos.y, this.options.dropStrength * 0.75, this.options.dropRadius * 0.95);
    });

    // Pointer Move
    canvas.addEventListener('pointermove', (e) => {
      const pos = getNormalizedPos(e);

      // YÊU CẦU: Chỉ khi nhấn giữ chuột/chạm thì mới tạo hiệu ứng lướt tay
      if (this.options.requireClick && !this.isPointerDown) {
        this.lastPointerPos = pos;
        return;
      }

      if (!this.lastPointerPos) {
        this.lastPointerPos = pos;
        return;
      }

      const dx = pos.x - this.lastPointerPos.x;
      const dy = pos.y - this.lastPointerPos.y;
      const dist = Math.hypot(dx, dy);

      // Ngưỡng tối thiểu để kích hoạt rẽ sóng
      const minDistance = 0.0035;
      if (dist > minDistance) {
        // Tạo hiệu ứng rẽ sóng hình chữ V hai bên luồng di chuyển
        this.addWake(
          this.lastPointerPos.x,
          this.lastPointerPos.y,
          pos.x,
          pos.y,
          this.options.wakeIntensity,
          this.options.wakeWidth
        );
        this.lastPointerPos = pos;
      }
    });

    // Pointer Up & Leave
    const onPointerUp = () => {
      this.isPointerDown = false;
      this.lastPointerPos = null;
    };
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
  }

  public destroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    const gl = this.gl;
    if (gl) {
      for (const tex of this.waveTextures) if (tex) gl.deleteTexture(tex);
      for (const fbo of this.waveFBOs) if (fbo) gl.deleteFramebuffer(fbo);
      if (this.backgroundTexture) gl.deleteTexture(this.backgroundTexture);
      if (this.causticsTexture) gl.deleteTexture(this.causticsTexture);
      if (this.simProgram) gl.deleteProgram(this.simProgram);
      if (this.dropProgram) gl.deleteProgram(this.dropProgram);
      if (this.renderProgram) gl.deleteProgram(this.renderProgram);
      if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer);
      if (this.isWebGL2 && this.quadVAO) {
        (gl as WebGL2RenderingContext).deleteVertexArray(this.quadVAO);
      }
    }
  }
}
