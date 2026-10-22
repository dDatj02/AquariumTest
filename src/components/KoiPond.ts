/**
 * Underwater Pond Layer:
 * Renders the lake bed floor image, 7 realistic ornamental fish varieties with
 * fluid spine undulation kinematics & natural drop shadows, and drifting lotus lily pads.
 * Output is drawn onto an offscreen canvas and uploaded to WebGL 2 as the displacement background!
 */

export interface FishSpeciesInfo {
  id: number;
  name: string;
  label: string;
  url: string;
  aspectRatio: number;
  baseScale: number;
}

export const FISH_SPECIES: FishSpeciesInfo[] = [
  { id: 0, name: 'kohaku', label: 'Cá Koi Kohaku (Trắng Cam)', url: '/assets/fish/fish_0.png', aspectRatio: 2.46, baseScale: 1.05 },
  { id: 1, name: 'showa', label: 'Cá Koi Showa (Đen Đỏ Trắng)', url: '/assets/fish/fish_1.png', aspectRatio: 2.22, baseScale: 1.02 },
  { id: 2, name: 'goldfish', label: 'Cá Vàng Ba Đuôi (Fantail)', url: '/assets/fish/fish_2.png', aspectRatio: 2.64, baseScale: 0.95 },
  { id: 3, name: 'comet', label: 'Cá Chép Đỏ (Red Comet)', url: '/assets/fish/fish_3.png', aspectRatio: 2.75, baseScale: 1.0 },
  { id: 4, name: 'cichlid', label: 'Cá La Hán Lam Hồng (Cichlid)', url: '/assets/fish/fish_4.png', aspectRatio: 2.60, baseScale: 1.02 },
  { id: 5, name: 'flowerhorn', label: 'Cá La Hán Đại (Flowerhorn)', url: '/assets/fish/fish_5.png', aspectRatio: 2.65, baseScale: 1.12 },
  { id: 6, name: 'arowana', label: 'Cá Rồng Vây Dài (Black Arowana)', url: '/assets/fish/fish_6.png', aspectRatio: 2.96, baseScale: 1.22 },
];

export interface LoadedFishSprite {
  img: HTMLImageElement;
  shadowCanvas: HTMLCanvasElement;
  isReady: boolean;
  aspectRatio: number;
}

export interface KoiFish {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetAngle: number;
  angle: number;
  turnRate: number;        // Smooth turning angular velocity (rad/s)
  spineCurvature: number;  // Dynamic spine bending curvature (-1 to 1) for natural supple turning
  speed: number;
  acceleration: number;    // Gentle forward acceleration when exiting turns
  baseSpeed: number;
  maxSpeed: number;
  size: number;
  swimPhase: number;
  speciesIndex: number;
  depth: number; // 0.1 (surface) to 0.8 (bottom)
  wiggleFrequency: number;
  wanderTimer: number;     // Continuous smooth wander phase
  glidePhase: number;      // Stroke-and-glide propulsion cycle
}

export interface LilyPad {
  x: number;
  y: number;
  radius: number;
  rotation: number;
  vRot: number;
  vx: number;
  vy: number;
  cutAngle: number;
  colorVariant: number;
  flowerColor?: string;
  hasBud?: boolean;
}

export class KoiPondLayer {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  private bgImage: HTMLImageElement | null = null;
  private isBgLoaded = false;
  public fishList: KoiFish[] = [];
  public lilies: LilyPad[] = [];
  public width: number = 1024;
  public height: number = 1024;
  public showFish: boolean = true;
  public showLilies: boolean = true;
  private lastTime: number = 0;
  private sprites: Map<number, LoadedFishSprite> = new Map();
  public selectedSpeciesFilter: number | 'all' = 'all';

  constructor(width = 1024, height = 1024) {
    this.width = width;
    this.height = height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    const context = this.canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('Failed to get 2D context for offscreen pond layer');
    }
    this.ctx = context;

    this.preloadFishSprites();
    this.initFish(5);
    this.initLilies(12); // Tăng số lượng lá sen mặc định lên 12 lá
  }

  private preloadFishSprites() {
    FISH_SPECIES.forEach((spec) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const spriteRecord: LoadedFishSprite = {
        img,
        shadowCanvas: document.createElement('canvas'),
        isReady: false,
        aspectRatio: spec.aspectRatio,
      };
      this.sprites.set(spec.id, spriteRecord);

      img.onload = () => {
        spriteRecord.isReady = true;
        spriteRecord.aspectRatio = img.width / img.height;
        // Generate soft dark silhouette for shadow
        const sc = spriteRecord.shadowCanvas;
        sc.width = img.width;
        sc.height = img.height;
        const sCtx = sc.getContext('2d');
        if (sCtx) {
          sCtx.drawImage(img, 0, 0);
          sCtx.globalCompositeOperation = 'source-in';
          sCtx.fillStyle = '#06080d';
          sCtx.fillRect(0, 0, img.width, img.height);
        }
      };
      img.src = spec.url;
    });
  }

  public resize(w: number, h: number) {
    if (this.width === w && this.height === h) return;
    this.width = Math.max(256, Math.min(2048, w));
    this.height = Math.max(256, Math.min(2048, h));
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.initLilies(this.lilies.length || 12);
  }

  public setBackgroundImage(img: HTMLImageElement) {
    this.bgImage = img;
    this.isBgLoaded = true;
  }

  public setFishCount(count: number) {
    const target = Math.max(0, Math.min(12, count));
    while (this.fishList.length < target) {
      const nextSpecies = this.selectedSpeciesFilter === 'all'
        ? (this.fishList.length % FISH_SPECIES.length)
        : this.selectedSpeciesFilter;
      this.fishList.push(this.createFish(nextSpecies));
    }
    while (this.fishList.length > target) {
      this.fishList.pop();
    }
  }

  public setSpeciesFilter(filter: number | 'all') {
    this.selectedSpeciesFilter = filter;
    if (filter !== 'all') {
      this.fishList.forEach((fish) => {
        fish.speciesIndex = filter;
      });
    } else {
      this.fishList.forEach((fish, idx) => {
        fish.speciesIndex = idx % FISH_SPECIES.length;
      });
    }
  }

  public setLilyCount(count: number) {
    const target = Math.max(0, Math.min(25, count));
    this.initLilies(target);
  }

  public createFish(speciesIndex?: number): KoiFish {
    const chosenIndex = speciesIndex !== undefined
      ? speciesIndex
      : Math.floor(Math.random() * FISH_SPECIES.length);
    const spec = FISH_SPECIES[chosenIndex] || FISH_SPECIES[0];

    // Fish length in pixels (scaled relative to standard pond size)
    const baseLength = (95 + Math.random() * 45) * spec.baseScale;
    const startX = 0.1 * this.width + Math.random() * 0.8 * this.width;
    const startY = 0.1 * this.height + Math.random() * 0.8 * this.height;
    const angle = Math.random() * Math.PI * 2;
    const baseSpeed = 0.85 + Math.random() * 0.45;

    return {
      x: startX,
      y: startY,
      vx: Math.cos(angle) * baseSpeed,
      vy: Math.sin(angle) * baseSpeed,
      angle,
      targetAngle: angle,
      turnRate: 0,
      spineCurvature: 0,
      speed: baseSpeed,
      acceleration: 0,
      baseSpeed,
      maxSpeed: 2.4,
      size: baseLength,
      swimPhase: Math.random() * Math.PI * 2,
      speciesIndex: chosenIndex,
      depth: 0.15 + Math.random() * 0.55,
      wiggleFrequency: 2.1 + Math.random() * 0.5,
      wanderTimer: Math.random() * 20,
      glidePhase: Math.random() * Math.PI * 2,
    };
  }

  private initFish(count: number) {
    this.fishList = [];
    for (let i = 0; i < count; i++) {
      const speciesIdx = i % FISH_SPECIES.length;
      this.fishList.push(this.createFish(speciesIdx));
    }
  }

  private initLilies(count: number) {
    this.lilies = [];
    if (count <= 0) return;

    // Các cụm tâm tự nhiên ven bờ hồ giữ vùng giữa thoáng đãng
    const clusters = [
      { cx: 0.18, cy: 0.22, radius: 0.18 },
      { cx: 0.82, cy: 0.25, radius: 0.18 },
      { cx: 0.20, cy: 0.78, radius: 0.20 },
      { cx: 0.80, cy: 0.75, radius: 0.20 },
      { cx: 0.50, cy: 0.14, radius: 0.14 },
    ];

    for (let i = 0; i < count; i++) {
      let x: number, y: number;
      if (Math.random() < 0.75 && clusters.length > 0) {
        const cl = clusters[i % clusters.length];
        const r = Math.random() * cl.radius;
        const ang = Math.random() * Math.PI * 2;
        x = (cl.cx + Math.cos(ang) * r) * this.width;
        y = (cl.cy + Math.sin(ang) * r) * this.height;
      } else {
        x = (0.1 + Math.random() * 0.8) * this.width;
        y = (0.1 + Math.random() * 0.8) * this.height;
      }

      const sizeType = Math.random();
      let radius: number;
      if (sizeType < 0.35) {
        radius = 20 + Math.random() * 12; // Lá nhỏ
      } else if (sizeType < 0.8) {
        radius = 34 + Math.random() * 16; // Lá vừa
      } else {
        radius = 52 + Math.random() * 16; // Lá sen lớn
      }

      let flowerColor: string | undefined;
      let hasBud: boolean | undefined;

      if (radius > 36 && Math.random() < 0.35) {
        const flowerRnd = Math.random();
        if (flowerRnd < 0.5) {
          flowerColor = '#f472b6'; // Hoa sen hồng
        } else if (flowerRnd < 0.8) {
          flowerColor = '#f8fafc'; // Hoa súng trắng
        } else {
          hasBud = true; // Búp sen
          flowerColor = '#ec4899';
        }
      }

      this.lilies.push({
        x,
        y,
        radius,
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.0015,
        vx: (Math.random() - 0.5) * 0.08,
        vy: (Math.random() - 0.5) * 0.08,
        cutAngle: 0.32 + Math.random() * 0.22,
        colorVariant: Math.random(),
        flowerColor,
        hasBud,
      });
    }
  }

  public scareFish(worldX: number, worldY: number) {
    for (const fish of this.fishList) {
      const dx = fish.x - worldX;
      const dy = fish.y - worldY;
      const dist = Math.hypot(dx, dy);
      if (dist < 280) {
        // Dart away from water disturbance with realistic surge
        const fleeAngle = Math.atan2(dy, dx);
        fish.targetAngle = fleeAngle + (Math.random() - 0.5) * 0.4;
        fish.speed = Math.min(fish.maxSpeed * 1.8, fish.speed + 2.8);
        fish.glidePhase = Math.PI * 0.5; // Trigger burst stroke
      }
    }
  }

  public update(time: number, pointerX?: number, pointerY?: number) {
    const dt = this.lastTime ? Math.min((time - this.lastTime) / 1000, 0.08) : 0.016;
    this.lastTime = time;

    // Update fish movement & fluid kinematics
    for (const fish of this.fishList) {
      // Gracefully scale down speed of existing fish if initialized previously with higher speed
      if (fish.baseSpeed > 1.35) {
        fish.baseSpeed = 0.85 + Math.random() * 0.45;
        fish.speed = Math.min(fish.speed, fish.baseSpeed);
        fish.wiggleFrequency = 2.1 + Math.random() * 0.5;
      }

      fish.wanderTimer += dt;

      // 1. Organic, continuous drift wandering (gentle, unhurried sinusoidal steering without sudden heading steps)
      fish.targetAngle += (Math.sin(fish.wanderTimer * 0.35) * 0.18 + Math.cos(fish.wanderTimer * 0.7) * 0.12) * dt;

      // 2. Gentle curiosity toward pointer
      if (pointerX !== undefined && pointerY !== undefined && fish.speed < 2.0) {
        const pdx = pointerX - fish.x;
        const pdy = pointerY - fish.y;
        const pDist = Math.hypot(pdx, pdy);
        if (pDist < 220 && pDist > 45) {
          const approach = Math.atan2(pdy, pdx);
          let dAng = approach - fish.targetAngle;
          while (dAng > Math.PI) dAng -= Math.PI * 2;
          while (dAng < -Math.PI) dAng += Math.PI * 2;
          fish.targetAngle += dAng * 0.65 * dt;
        }
      }

      // 3. Smooth potential-field edge avoidance (starts turning well in advance with wide, graceful arc)
      const margin = 125;
      let repulseX = 0;
      let repulseY = 0;
      if (fish.x < margin) repulseX += Math.pow((margin - fish.x) / margin, 1.2);
      if (fish.x > this.width - margin) repulseX -= Math.pow((fish.x - (this.width - margin)) / margin, 1.2);
      if (fish.y < margin) repulseY += Math.pow((margin - fish.y) / margin, 1.2);
      if (fish.y > this.height - margin) repulseY -= Math.pow((fish.y - (this.height - margin)) / margin, 1.2);

      if (repulseX !== 0 || repulseY !== 0) {
        const avoidAngle = Math.atan2(repulseY, repulseX);
        let diff = avoidAngle - fish.targetAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        fish.targetAngle += diff * 1.6 * dt;
      }

      // 4. Smooth, gradual turning dynamics (quay đầu từ từ với quán tính tự nhiên)
      let angleDiff = fish.targetAngle - fish.angle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      // Smooth, natural turning angular speed limit (~0.85 rad/s)
      const maxTurnRate = 0.85;
      const desiredTurnRate = Math.max(-maxTurnRate, Math.min(maxTurnRate, angleDiff * 1.0));

      // Viscoelastic angular acceleration for silky smooth entry and exit into curves
      fish.turnRate += (desiredTurnRate - fish.turnRate) * 1.5 * dt;
      fish.angle += fish.turnRate * dt;

      // Dynamic spine curvature: uốn thân TỪ TỪ theo tốc độ quay thực tế
      // Thân cá uốn cong từ từ khi bắt đầu quay, đạt độ cong tối đa ở giữa khúc cua, rồi từ từ duỗi thẳng lại
      const targetCurvature = Math.max(-1.0, Math.min(1.0, fish.turnRate / maxTurnRate));
      fish.spineCurvature += (targetCurvature - fish.spineCurvature) * 1.6 * dt;

      // 5. Cơ chế chậm lại khi uốn thân quay đầu và gia tốc nhẹ (acceleration) khi duỗi thân bơi tiếp
      // Đo cường độ quay kết hợp từ độ cong thân (spineCurvature) và vận tốc góc quay (turnRate)
      const turnIntensity = Math.min(1.0, Math.max(Math.abs(fish.spineCurvature), Math.abs(fish.turnRate) / maxTurnRate));

      // Khi xoay cua, sức cản nước làm cá giảm tốc tự nhiên xuống ~55% tốc độ thông thường
      // Cá không bao giờ bị dừng khựng, vẫn lướt chuyển động liên tục
      const targetSpeed = fish.baseSpeed * (1.0 - turnIntensity * 0.45);

      if (fish.acceleration === undefined) fish.acceleration = 0;

      if (targetSpeed > fish.speed) {
        // GIAI ĐOẠN BẮT ĐẦU BƠI TIẾP SAU KHI QUAY ĐẦU:
        // Cá duỗi thẳng thân và bắt đầu tăng tốc với gia tốc nhẹ (acceleration),
        // tạo cảm giác tăng tốc mượt mà tự nhiên như cá thật quẫy vây lấy đà
        const desiredAccel = Math.min(0.95, (targetSpeed - fish.speed) * 1.6);
        fish.acceleration += (desiredAccel - fish.acceleration) * 2.2 * dt;
        fish.speed += Math.max(0, fish.acceleration) * dt;
        if (fish.speed > targetSpeed) {
          fish.speed = targetSpeed;
          fish.acceleration = 0;
        }
      } else {
        // GIAI ĐOẠN GIẢM TỐC TỰ NHIÊN KHI VÀO CUA:
        // Giảm tốc mượt mà do sức cản nước khi uốn thân
        const decelRate = 1.8;
        fish.speed += (targetSpeed - fish.speed) * decelRate * dt;
        fish.acceleration = 0;
      }

      // 6. Nhịp bơi tự nhiên liên tục: khi có gia tốc tăng tốc sau quay, đuôi quẫy đẩy nước nhịp nhàng hơn
      const accelBoost = Math.max(0, fish.acceleration * 0.5);
      fish.glidePhase += (1.3 + (fish.speed + accelBoost) * 0.35) * dt;
      const strokeFactor = Math.sin(fish.glidePhase);
      const undulationActivity = strokeFactor > 0
        ? 0.85 + 0.35 * Math.pow(strokeFactor, 1.2) + accelBoost * 0.25
        : 0.65 + 0.25 * (1.0 + strokeFactor);

      // Đuôi và thân vẫn quẫy đều đặn tạo lực đẩy tự nhiên
      fish.swimPhase += Math.max(0.75, fish.speed) * fish.wiggleFrequency * undulationActivity * dt;

      // Di chuyển tiến lên phía trước - đầu luôn luôn hướng chính xác về phía di chuyển
      fish.x += Math.cos(fish.angle) * fish.speed * 60 * dt;
      fish.y += Math.sin(fish.angle) * fish.speed * 60 * dt;

      // Wrap-around bounds protection (accounting for trailing tail length)
      if (fish.x < -150) fish.x = this.width + 80;
      if (fish.x > this.width + 150) fish.x = -80;
      if (fish.y < -150) fish.y = this.height + 80;
      if (fish.y > this.height + 150) fish.y = -80;
    }

    // Drifting lily pads
    for (const lily of this.lilies) {
      lily.rotation += lily.vRot;
      lily.x += lily.vx;
      lily.y += lily.vy;
      if (lily.x < -lily.radius) lily.x = this.width + lily.radius;
      if (lily.x > this.width + lily.radius) lily.x = -lily.radius;
      if (lily.y < -lily.radius) lily.y = this.height + lily.radius;
      if (lily.y > this.height + lily.radius) lily.y = -lily.radius;
    }
  }

  public render(): void {
    const { ctx, width, height } = this;

    // 1. Draw Pond Bottom Image (Đáy hồ / Soil background)
    if (this.isBgLoaded && this.bgImage) {
      const img = this.bgImage;
      const imgAspect = img.width / img.height;
      const canvasAspect = width / height;
      let drawW: number, drawH: number, drawX: number, drawY: number;

      if (imgAspect > canvasAspect) {
        drawH = height;
        drawW = height * imgAspect;
        drawX = (width - drawW) / 2;
        drawY = 0;
      } else {
        drawW = width;
        drawH = width / imgAspect;
        drawX = 0;
        drawY = (height - drawH) / 2;
      }
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
    } else {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#3b2f27');
      grad.addColorStop(0.5, '#4a3b31');
      grad.addColorStop(1, '#2c221a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }

    // 2. Render Fish Shadows on Pond Floor (with realistic depth offset & matching body undulation)
    if (this.showFish) {
      for (const fish of this.fishList) {
        this.renderFishUndulated(ctx, fish, true);
      }
      // 3. Render Fish Bodies (7 ornamental species with fluid swimming undulation)
      for (const fish of this.fishList) {
        this.renderFishUndulated(ctx, fish, false);
      }
    }

    // 4. Render Floating Lotus / Lily Pads
    if (this.showLilies) {
      for (const lily of this.lilies) {
        this.renderLilyPad(ctx, lily);
      }
    }
  }

  /**
   * Renders the fish sprite (or its shadow) sliced into vertical strips,
   * undulating with a traveling sine wave from head to tail to create
   * organic, life-like spine and fin motion!
   */
  private renderFishUndulated(ctx: CanvasRenderingContext2D, fish: KoiFish, isShadow: boolean) {
    const sprite = this.sprites.get(fish.speciesIndex);
    if (!sprite || !sprite.isReady) return;

    const sourceCanvas = isShadow ? sprite.shadowCanvas : sprite.img;
    const srcW = sprite.img.width;
    const srcH = sprite.img.height;
    if (srcW === 0 || srcH === 0) return;

    const len = fish.size;
    const h = len / sprite.aspectRatio;

    // Shadow offset dependent on fish depth
    const shadowDist = 18 + fish.depth * 28;
    const shadowAlpha = 0.28 * (1.0 - fish.depth * 0.4);

    ctx.save();

    if (isShadow) {
      ctx.translate(fish.x + shadowDist * 0.65, fish.y + shadowDist);
      ctx.globalAlpha = shadowAlpha;
    } else {
      ctx.translate(fish.x, fish.y);
      // Subtle depth transparency and color grading for water absorption
      ctx.globalAlpha = 0.96 - fish.depth * 0.15;
    }

    // Rotate so fish heads toward fish.angle
    ctx.rotate(fish.angle);

    // Number of vertical slice strips along length for silky smooth spine deformation
    const NUM_SLICES = 24;
    const srcSliceW = srcW / NUM_SLICES;
    const destSliceW = len / NUM_SLICES;

    // Turn spine curvature (-1 to 1) bends the entire body gracefully along the turning arc
    const turnBend = fish.spineCurvature;

    // In sprite coordinates:
    // Left (x = 0) is tail, Right (x = srcW) is head.
    // In local canvas coordinates:
    // The head is anchored at local (0, 0) aligned with fish.angle, and the body/tail trails behind at -X.
    // This guarantees the fish's head is ALWAYS facing and tracking exactly in the direction of travel!
    for (let i = 0; i < NUM_SLICES; i++) {
      // u: 0.0 at tail tip (i = 0), 1.0 at head tip (i = NUM_SLICES - 1)
      const u = i / (NUM_SLICES - 1);
      const bendProgress = 1.0 - u; // 0.0 at head, 1.0 at tail tip

      // 1. Dynamic Turn Arc Curvature:
      // The spine flexes progressively behind the head into a supple, organic C-curve along the turning arc
      // Using Math.pow(bendProgress, 1.25) guarantees zero lateral/angular deflection at the head (snout & skull stay locked forward)
      const turnLateral = turnBend * (len * 0.17 + h * 0.35) * Math.sin(bendProgress * Math.PI * 0.55) * Math.pow(bendProgress, 1.25);
      const turnAngle = -turnBend * 0.75 * Math.pow(bendProgress, 1.25);

      // 2. Multi-Harmonic Traveling Undulation Wave (propelling from behind head down to tail):
      const wavePhase = fish.swimPhase - (1.0 - u) * 3.7;

      // Chest & pectoral area flexible breathing motion (fades to 0 at head tip)
      const chestFlex = Math.sin((1.0 - u) * Math.PI * 1.3) * (h * 0.04) * Math.sin(wavePhase + 0.6) * Math.pow(1.0 - u, 0.6);

      // Mid-trunk belly flex (fades to 0 at head tip)
      const bellyFlex = Math.sin((1.0 - u) * Math.PI * 0.95) * (h * 0.08) * Math.sin(wavePhase) * Math.pow(1.0 - u, 0.8);

      // Caudal peduncle & main tail stroke (power propulsion)
      const tailSwing = Math.pow(1.0 - u, 1.45) * (h * 0.28) * Math.sin(wavePhase);

      // Trailing soft fin ripple (supple "veil" flutter on tail fins)
      const finRipple = u < 0.38
        ? Math.sin(wavePhase - 0.9) * (h * 0.09) * Math.pow((0.38 - u) / 0.38, 1.4)
        : 0;

      // Slice tangent angle from wave derivative + trailing fin lag (strictly 0 at head)
      const waveAngle = Math.cos(wavePhase) * (0.28 * Math.pow(1.0 - u, 1.1)) +
        (u < 0.38 ? Math.cos(wavePhase - 0.9) * 0.12 * Math.pow((0.38 - u) / 0.38, 1.2) : 0);

      // Combined lateral deflection and angular rotation (both are 0 at head, keeping head pointing straight forward)
      const lateralY = turnLateral + chestFlex + bellyFlex + tailSwing + finRipple;
      const sliceAngle = turnAngle + waveAngle;

      // Local X position of slice center: head is at 0, body trails behind toward -len
      const sliceCenterX = (i - NUM_SLICES + 0.5) * destSliceW;

      ctx.save();
      ctx.translate(sliceCenterX, lateralY);
      ctx.rotate(sliceAngle);

      // Overlap slightly (1.3px) to prevent sub-pixel gaps between adjacent slices
      const overlap = 1.3;
      ctx.drawImage(
        sourceCanvas,
        i * srcSliceW, 0, srcSliceW, srcH,
        -destSliceW * 0.5 - overlap * 0.5, -h * 0.5, destSliceW + overlap, h
      );

      ctx.restore();
    }

    ctx.restore();
  }

  /**
   * Vẽ lá sen / hoa sen chân thực với đổ bóng sâu, gân lá tinh xảo và cánh hoa xếp lớp
   */
  private renderLilyPad(ctx: CanvasRenderingContext2D, lily: LilyPad) {
    // 1. Soft Ambient Shadow onto underwater floor
    ctx.save();
    ctx.translate(lily.x + 12, lily.y + 16);
    ctx.fillStyle = 'rgba(8, 12, 16, 0.35)';
    ctx.beginPath();
    ctx.arc(0, 0, lily.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Lotus Leaf Body
    ctx.save();
    ctx.translate(lily.x, lily.y);
    ctx.rotate(lily.rotation);

    // Natural emerald to deep forest jade gradient
    const grad = ctx.createRadialGradient(
      -lily.radius * 0.2, -lily.radius * 0.2, lily.radius * 0.08,
      0, 0, lily.radius
    );
    if (lily.colorVariant < 0.33) {
      grad.addColorStop(0, '#4ade80'); // Fresh spring lotus green
      grad.addColorStop(0.65, '#16a34a');
      grad.addColorStop(1, '#14532d');
    } else if (lily.colorVariant < 0.66) {
      grad.addColorStop(0, '#38a169');
      grad.addColorStop(0.7, '#276749');
      grad.addColorStop(1, '#1c4532');
    } else {
      grad.addColorStop(0, '#34d399'); // Emerald jade
      grad.addColorStop(0.7, '#059669');
      grad.addColorStop(1, '#064e3b');
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, lily.radius, lily.cutAngle, Math.PI * 2 - lily.cutAngle);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();

    // Subtle sunlit rim around edge of leaf
    ctx.strokeStyle = 'rgba(187, 247, 208, 0.25)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Delicate radiating leaf veins
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.20)';
    ctx.lineWidth = 1.1;
    for (let a = lily.cutAngle + 0.3; a < Math.PI * 2 - lily.cutAngle - 0.2; a += 0.55) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      const endX = Math.cos(a) * lily.radius * 0.9;
      const endY = Math.sin(a) * lily.radius * 0.9;
      const cpX = Math.cos(a + 0.08) * lily.radius * 0.5;
      const cpY = Math.sin(a + 0.08) * lily.radius * 0.5;
      ctx.quadraticCurveTo(cpX, cpY, endX, endY);
      ctx.stroke();
    }

    // Leaf center depression node
    ctx.fillStyle = '#14532d';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fill();

    // 3. Blooming Lotus Flower or Bud if present
    if (lily.flowerColor) {
      if (lily.hasBud) {
        ctx.fillStyle = lily.flowerColor;
        ctx.beginPath();
        ctx.ellipse(0, 0, 9, 5, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fbcfe8';
        ctx.beginPath();
        ctx.ellipse(1, -1, 6, 3, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const numPetals = 10;
        ctx.fillStyle = lily.flowerColor;
        for (let p = 0; p < numPetals; p++) {
          const pAng = (p / numPetals) * Math.PI * 2;
          ctx.beginPath();
          ctx.ellipse(Math.cos(pAng) * 7, Math.sin(pAng) * 7, 9, 4.5, pAng, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = lily.flowerColor === '#f472b6' ? '#fbcfe8' : '#ffffff';
        for (let p = 0; p < 6; p++) {
          const pAng = (p / 6) * Math.PI * 2 + 0.3;
          ctx.beginPath();
          ctx.ellipse(Math.cos(pAng) * 4, Math.sin(pAng) * 4, 6, 3, pAng, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#eab308';
        ctx.beginPath();
        ctx.arc(0, 0, 4.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }
}
