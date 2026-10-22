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
  isGoldfish?: boolean; // Thân tròn bự: bơi quẩy đuôi và vây, không uốn thân
}

export const FISH_SPECIES: FishSpeciesInfo[] = [
  { id: 0, name: 'kohaku', label: 'Cá Koi Kohaku (Trắng Cam)', url: '/assets/fish/fish_0.png', aspectRatio: 2.46, baseScale: 1.05 },
  { id: 1, name: 'showa', label: 'Cá Koi Showa (Đen Đỏ Trắng)', url: '/assets/fish/fish_1.png', aspectRatio: 2.22, baseScale: 1.02 },
  { id: 2, name: 'goldfish', label: 'Cá Vàng Ba Đuôi (Fantail)', url: '/assets/fish/fish_2.png', aspectRatio: 2.64, baseScale: 0.95, isGoldfish: true },
  { id: 3, name: 'comet', label: 'Cá Chép Đỏ (Red Comet)', url: '/assets/fish/fish_3.png', aspectRatio: 2.75, baseScale: 1.0 },
  { id: 4, name: 'cichlid', label: 'Cá La Hán Lam Hồng (Cichlid)', url: '/assets/fish/fish_4.png', aspectRatio: 2.60, baseScale: 1.02 },
  { id: 5, name: 'flowerhorn', label: 'Cá La Hán Đại (Flowerhorn)', url: '/assets/fish/fish_5.png', aspectRatio: 2.65, baseScale: 1.12 },
  { id: 6, name: 'arowana', label: 'Cá Rồng Vây Dài (Black Arowana)', url: '/assets/fish/fish_6.png', aspectRatio: 2.96, baseScale: 1.22 },
  { id: 7, name: 'oranda', label: 'Cá Vàng Đầu Lân (Oranda Crown)', url: '/assets/fish/fish_7.png', aspectRatio: 1.49, baseScale: 0.96, isGoldfish: true },
  { id: 8, name: 'ryukin', label: 'Cá Vàng Lưu Kim (Ryukin Calico)', url: '/assets/fish/fish_8.png', aspectRatio: 1.34, baseScale: 0.93, isGoldfish: true },
  { id: 9, name: 'butterfly_fantail', label: 'Cá Vàng Đuôi Bướm (Golden Butterfly)', url: '/assets/fish/fish_9.png', aspectRatio: 1.71, baseScale: 0.98, isGoldfish: true },
  { id: 10, name: 'silk_veiltail', label: 'Cá Vàng Thủy Mặc (Silk Veiltail)', url: '/assets/fish/fish_10.png', aspectRatio: 1.53, baseScale: 0.96, isGoldfish: true },
];

export interface LoadedFishSprite {
  img: HTMLImageElement;
  shadowCanvas: HTMLCanvasElement;
  isReady: boolean;
  aspectRatio: number;
}

export interface TurtleRig {
  body: LoadedFishSprite;
  flipperFL: LoadedFishSprite;
  flipperFR: LoadedFishSprite;
  flipperBL: LoadedFishSprite;
  flipperBR: LoadedFishSprite;
  isReady: boolean;
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

export interface KoiTurtle {
  x: number;
  y: number;
  targetAngle: number;
  angle: number;
  turnRate: number;
  speed: number;
  baseSpeed: number;
  size: number;
  paddlePhase: number;
  paddleRate: number;
  depth: number;
  wanderTimer: number;
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
  public turtleList: KoiTurtle[] = [];
  public lilies: LilyPad[] = [];
  public width: number = 1024;
  public height: number = 1024;
  public showFish: boolean = true;
  public showTurtles: boolean = true;
  public showLilies: boolean = true;
  private lastTime: number = 0;
  private sprites: Map<number, LoadedFishSprite> = new Map();
  private turtleRig: TurtleRig | null = null;
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
    this.preloadTurtleSprite();
    this.initFish(5);
    this.initTurtles(2);
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

  private loadTurtlePart(url: string, onPartReady: () => void): LoadedFishSprite {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const spriteRecord: LoadedFishSprite = {
      img,
      shadowCanvas: document.createElement('canvas'),
      isReady: false,
      aspectRatio: 512 / 579,
    };

    img.onload = () => {
      spriteRecord.isReady = true;
      spriteRecord.aspectRatio = img.width / img.height;
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
      onPartReady();
    };
    img.src = url;
    return spriteRecord;
  }

  private preloadTurtleSprite() {
    let readyCount = 0;
    const checkAllReady = () => {
      readyCount++;
      if (this.turtleRig && readyCount >= 5) {
        this.turtleRig.isReady = true;
      }
    };

    this.turtleRig = {
      body: this.loadTurtlePart('/assets/turtle_body.png', checkAllReady),
      flipperFL: this.loadTurtlePart('/assets/turtle_flipper_fl.png', checkAllReady),
      flipperFR: this.loadTurtlePart('/assets/turtle_flipper_fr.png', checkAllReady),
      flipperBL: this.loadTurtlePart('/assets/turtle_flipper_bl.png', checkAllReady),
      flipperBR: this.loadTurtlePart('/assets/turtle_flipper_br.png', checkAllReady),
      isReady: false,
    };
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
    const target = Math.max(0, Math.min(16, count));
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

  public setTurtleCount(count: number) {
    const target = Math.max(0, Math.min(8, count));
    while (this.turtleList.length < target) {
      this.turtleList.push(this.createTurtle());
    }
    while (this.turtleList.length > target) {
      this.turtleList.pop();
    }
  }

  public createTurtle(): KoiTurtle {
    const startX = 0.15 * this.width + Math.random() * 0.7 * this.width;
    const startY = 0.15 * this.height + Math.random() * 0.7 * this.height;
    const angle = Math.random() * Math.PI * 2;
    const baseSpeed = 0.55 + Math.random() * 0.35;
    const size = 105 + Math.random() * 35;

    return {
      x: startX,
      y: startY,
      angle,
      targetAngle: angle,
      turnRate: 0,
      speed: baseSpeed,
      baseSpeed,
      size,
      paddlePhase: Math.random() * Math.PI * 2,
      paddleRate: 2.2 + Math.random() * 0.6,
      depth: 0.18 + Math.random() * 0.35,
      wanderTimer: Math.random() * 15,
    };
  }

  public initTurtles(count: number) {
    this.turtleList = [];
    for (let i = 0; i < count; i++) {
      this.turtleList.push(this.createTurtle());
    }
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

    // Cá vàng thân bự (Oranda, Ryukin, Butterfly, Silk Veiltail, Fantail)
    // bơi thong thả bồng bềnh, đuôi và vây quẫy nhanh nhẹn với tần số cao hơn
    const isGoldfish = !!spec.isGoldfish;
    const baseSpeed = isGoldfish
      ? 0.72 + Math.random() * 0.30
      : 0.85 + Math.random() * 0.45;
    const wiggleFrequency = isGoldfish
      ? 2.85 + Math.random() * 0.55
      : 2.10 + Math.random() * 0.50;

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
      maxSpeed: isGoldfish ? 2.0 : 2.4,
      size: baseLength,
      swimPhase: Math.random() * Math.PI * 2,
      speciesIndex: chosenIndex,
      depth: 0.15 + Math.random() * 0.55,
      wiggleFrequency,
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

    // Turtles react to splashes with quick flipper paddling
    for (const turtle of this.turtleList) {
      const dx = turtle.x - worldX;
      const dy = turtle.y - worldY;
      const dist = Math.hypot(dx, dy);
      if (dist < 260) {
        const fleeAngle = Math.atan2(dy, dx);
        turtle.targetAngle = fleeAngle + (Math.random() - 0.5) * 0.5;
        turtle.speed = Math.min(1.8, turtle.speed + 1.1);
        turtle.paddleRate = 3.6;
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

    // Update turtles (peaceful flipper paddling & gentle swimming)
    if (this.showTurtles) {
      for (const turtle of this.turtleList) {
        turtle.wanderTimer += dt;

        // Gentle sinusoidal steering
        turtle.targetAngle += (Math.sin(turtle.wanderTimer * 0.3) * 0.16 + Math.cos(turtle.wanderTimer * 0.6) * 0.1) * dt;

        // Gentle curiosity towards pointer
        if (pointerX !== undefined && pointerY !== undefined && turtle.speed < 1.4) {
          const pdx = pointerX - turtle.x;
          const pdy = pointerY - turtle.y;
          const pDist = Math.hypot(pdx, pdy);
          if (pDist < 260 && pDist > 50) {
            const approach = Math.atan2(pdy, pdx);
            let dAng = approach - turtle.targetAngle;
            while (dAng > Math.PI) dAng -= Math.PI * 2;
            while (dAng < -Math.PI) dAng += Math.PI * 2;
            turtle.targetAngle += dAng * 0.55 * dt;
          }
        }

        // Avoid boundaries with wide arc
        const margin = 140;
        let repulseX = 0;
        let repulseY = 0;
        if (turtle.x < margin) repulseX += Math.pow((margin - turtle.x) / margin, 1.2);
        if (turtle.x > this.width - margin) repulseX -= Math.pow((turtle.x - (this.width - margin)) / margin, 1.2);
        if (turtle.y < margin) repulseY += Math.pow((margin - turtle.y) / margin, 1.2);
        if (turtle.y > this.height - margin) repulseY -= Math.pow((turtle.y - (this.height - margin)) / margin, 1.2);

        if (repulseX !== 0 || repulseY !== 0) {
          const avoidAngle = Math.atan2(repulseY, repulseX);
          let diff = avoidAngle - turtle.targetAngle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          turtle.targetAngle += diff * 1.5 * dt;
        }

        // Smooth gradual rotation limit (~0.7 rad/s - calm, serene turn)
        let angleDiff = turtle.targetAngle - turtle.angle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        const maxTurnRate = 0.7;
        const desiredTurnRate = Math.max(-maxTurnRate, Math.min(maxTurnRate, angleDiff * 0.85));
        turtle.turnRate += (desiredTurnRate - turtle.turnRate) * 1.4 * dt;
        turtle.angle += turtle.turnRate * dt;

        // Flipper paddling cycle (stroke and glide)
        turtle.paddlePhase += turtle.paddleRate * dt;
        const paddleStroke = Math.sin(turtle.paddlePhase);

        // Gradually decay speed back to baseSpeed if boosted
        turtle.speed += (turtle.baseSpeed - turtle.speed) * 1.2 * dt;
        // Slowly relax paddleRate back to normal (2.2)
        turtle.paddleRate += (2.2 - turtle.paddleRate) * 1.0 * dt;

        // Propulsion pulse when paddling forward:
        const thrust = paddleStroke > 0 ? 0.3 * Math.pow(paddleStroke, 1.5) : -0.1 * Math.abs(paddleStroke);
        const forwardSpeed = Math.max(0.3, turtle.speed + thrust);

        // Advance position in direction of heading
        turtle.x += Math.cos(turtle.angle) * forwardSpeed * 45 * dt;
        turtle.y += Math.sin(turtle.angle) * forwardSpeed * 45 * dt;

        // Bounds wrapping
        if (turtle.x < -160) turtle.x = this.width + 100;
        if (turtle.x > this.width + 160) turtle.x = -100;
        if (turtle.y < -160) turtle.y = this.height + 100;
        if (turtle.y > this.height + 160) turtle.y = -100;
      }
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

    // 2. Render Fish Shadows on Pond Floor
    if (this.showFish) {
      for (const fish of this.fishList) {
        this.renderFishUndulated(ctx, fish, true);
      }
    }

    // 2b. Render Turtle Shadows
    if (this.showTurtles) {
      for (const turtle of this.turtleList) {
        this.renderTurtle(ctx, turtle, true);
      }
    }

    // 3. Render Fish Bodies (7 ornamental species)
    if (this.showFish) {
      for (const fish of this.fishList) {
        this.renderFishUndulated(ctx, fish, false);
      }
    }

    // 3b. Render Turtle Bodies (Cute green sea turtles)
    if (this.showTurtles) {
      for (const turtle of this.turtleList) {
        this.renderTurtle(ctx, turtle, false);
      }
    }

    // 4. Render Floating Lotus / Lily Pads
    if (this.showLilies) {
      for (const lily of this.lilies) {
        this.renderLilyPad(ctx, lily);
      }
    }
  }

  private renderTurtle(ctx: CanvasRenderingContext2D, turtle: KoiTurtle, isShadow: boolean) {
    if (!this.turtleRig || !this.turtleRig.isReady) return;

    // 1. Sea Turtle flipper paddling kinematics:
    // Front flippers execute powerful rhythmic rowing strokes (power sweep back, feather forward)
    const stroke = Math.sin(turtle.paddlePhase);

    // Front flipper sweep angles:
    // When stroke > 0 (power propulsion stroke): flippers sweep backwards toward tail
    // Left flipper (upper): rotates counter-clockwise (-angle toward tail)
    // Right flipper (lower): rotates clockwise (+angle toward tail)
    // Turn banking: outside flipper strokes wider to bank and turn smoothly
    const turnBias = turtle.turnRate * 0.35;
    const flAngle = -stroke * 0.40 + turnBias;
    const frAngle = stroke * 0.40 + turnBias;

    // Rear flippers: subtle rudder stabilization with slight phase lag
    const rearStroke = Math.sin(turtle.paddlePhase - 0.7);
    const blAngle = rearStroke * 0.16 + turtle.turnRate * 0.28;
    const brAngle = -rearStroke * 0.16 + turtle.turnRate * 0.28;

    // Gentle hull sway and breathing undulation
    const sway = Math.sin(turtle.paddlePhase) * 0.035;
    // Subtle surging pulse along heading when power stroke propels forward
    const surge = stroke > 0 ? stroke * 2.5 : 0;

    const scale = turtle.size / 512;
    const drawWidth = turtle.size;
    const drawHeight = turtle.size * (579 / 512);
    const bodyOffsetX = -211 * scale;
    const bodyOffsetY = -289 * scale;

    ctx.save();
    if (isShadow) {
      const shadowOffsetX = 18 * turtle.depth;
      const shadowOffsetY = 24 * turtle.depth;
      ctx.translate(turtle.x + shadowOffsetX, turtle.y + shadowOffsetY);
      ctx.rotate(turtle.angle + sway);
      ctx.globalAlpha = 0.32 * (1.0 - turtle.depth * 0.25);
    } else {
      ctx.translate(turtle.x, turtle.y);
      ctx.rotate(turtle.angle + sway);
      ctx.globalAlpha = 0.98;
    }

    const drawPart = (sprite: LoadedFishSprite) => isShadow ? sprite.shadowCanvas : sprite.img;

    // Helper to draw a flipper smoothly articulated around its shoulder/hip joint
    const drawFlipper = (sprite: LoadedFishSprite, jx: number, jy: number, angle: number) => {
      const localJointX = (jx - 211) * scale;
      const localJointY = (jy - 289) * scale;
      ctx.save();
      ctx.translate(localJointX, localJointY);
      ctx.rotate(angle);
      ctx.drawImage(
        drawPart(sprite),
        -jx * scale,
        -jy * scale,
        drawWidth,
        drawHeight
      );
      ctx.restore();
    };

    // 1. Draw rear flippers (underneath shell rim)
    drawFlipper(this.turtleRig.flipperBL, 88, 168, blAngle);
    drawFlipper(this.turtleRig.flipperBR, 88, 410, brAngle);

    // 2. Draw front flippers (underneath shell rim)
    drawFlipper(this.turtleRig.flipperFL, 315, 165, flAngle);
    drawFlipper(this.turtleRig.flipperFR, 315, 413, frAngle);

    // 3. Draw turtle body (shell + head + tail - drawn on top, perfectly masking flipper bases!)
    ctx.drawImage(
      drawPart(this.turtleRig.body),
      bodyOffsetX + surge,
      bodyOffsetY,
      drawWidth,
      drawHeight
    );

    ctx.restore();
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
    const NUM_SLICES = 32;
    const srcSliceW = srcW / NUM_SLICES;
    const destSliceW = len / NUM_SLICES;

    // Turn spine curvature (-1 to 1) bends the entire body gracefully along the turning arc
    const turnBend = fish.spineCurvature;
    const spec = FISH_SPECIES[fish.speciesIndex] || FISH_SPECIES[0];
    const isGoldfish = !!spec.isGoldfish;

    // In sprite coordinates:
    // Left (x = 0) is tail, Right (x = srcW) is head.
    // In local canvas coordinates:
    // The head is anchored at local (0, 0) aligned with fish.angle, and the body/tail trails behind at -X.
    // This guarantees the fish's head is ALWAYS facing and tracking exactly in the direction of travel!
    for (let i = 0; i < NUM_SLICES; i++) {
      // u: 0.0 at tail tip (i = 0), 1.0 at head tip (i = NUM_SLICES - 1)
      const u = i / (NUM_SLICES - 1);
      const bendProgress = 1.0 - u; // 0.0 at head, 1.0 at tail tip

      let lateralY = 0;
      let sliceAngle = 0;
      let sliceH = h;

      if (isGoldfish) {
        // ===================================================================
        // DÁNG BƠI CÁ VÀNG (GOLDFISH KINEMATICS):
        // Thân bự tròn trịa nên KHÔNG CẦN UỐN THÂN (thân giữ thẳng nguyên khối).
        // Chỉ quẩy đuôi (caudal fin wag/flutter) và vẫy vây bơi hai bên (pectoral fins).
        // ===================================================================

        // 1. Toàn thân bự chỉ lắc nhẹ (rigid body recoil) do phản lực quẩy đuôi
        // Giữ đồng nhất cho toàn bộ thân cá (không uốn cong trục thân)
        const bodyRecoil = Math.sin(fish.swimPhase) * 0.022;

        // Điểm bắt đầu cuống đuôi: u ~ 0.44 (44% từ chóp đuôi lên)
        // Vùng từ 0.44 đến 1.0: Thân tròn bự, bụng bự, đầu cá -> KHÔNG UỐN THÂN
        const TAIL_START_U = 0.44;

        if (u >= TAIL_START_U) {
          // Thân bự giữ thẳng hoàn toàn, không uốn lượn, không gập khúc
          lateralY = 0;
          sliceAngle = bodyRecoil;

          // 2. VẪY VÂY BƠI HAI BÊN (Pectoral Fins Flutter):
          // Vùng vây bơi ngực nằm ở khoảng u = 0.58 đến 0.82
          // Vây bơi phập phồng nhịp nhàng tạo lực chèo nhẹ trong nước
          if (u >= 0.58 && u <= 0.82) {
            const finZone = Math.sin(((u - 0.58) / 0.24) * Math.PI);
            const finRowing = Math.sin(fish.swimPhase * 1.4);
            sliceH = h * (1.0 + 0.055 * finRowing * finZone);
          }
        } else {
          // 3. QUẨY ĐUÔI (Caudal Peduncle & Flowing Tail Fin Wag):
          // tailT: 0.0 tại cuống đuôi, 1.0 tại chóp đuôi lụa mềm mại
          const tailT = (TAIL_START_U - u) / TAIL_START_U;
          const tailProgress = Math.pow(tailT, 1.25);

          // Sóng quẫy đuôi chính với biên độ dạt sang hai bên uyển chuyển
          const tailWave = Math.sin(fish.swimPhase - tailT * 2.1);
          const tailSwing = tailWave * (h * 0.38) * tailProgress;

          // Nếp gấp đuôi voan lụa gợn sóng mềm mại (secondary veil ripple)
          const veilRipple = Math.sin(fish.swimPhase * 1.5 - tailT * 3.4) * (h * 0.15) * Math.pow(tailT, 1.5);

          // Bẻ lái theo cua nước khi rẽ cua
          const tailRudder = turnBend * (len * 0.16) * Math.pow(tailT, 1.35);

          lateralY = tailSwing + veilRipple + tailRudder;

          // Góc nghiêng lát cắt uốn theo dòng nước mềm mại
          const tailAngle = Math.cos(fish.swimPhase - tailT * 2.1) * 0.48 * Math.pow(tailT, 0.92)
            - turnBend * 0.38 * Math.pow(tailT, 1.15);

          sliceAngle = bodyRecoil + tailAngle;
        }
      } else {
        // ===================================================================
        // DÁNG BƠI CÁ KOI / CÁ CHÉP / CÁ RỒNG (SLENDER BODY):
        // Uốn lượn hình chữ S toàn thân mềm mại
        // ===================================================================
        // 1. Dynamic Turn Arc Curvature:
        // The spine flexes progressively behind the head into a supple, organic C-curve along the turning arc
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

        // Combined lateral deflection and angular rotation
        lateralY = turnLateral + chestFlex + bellyFlex + tailSwing + finRipple;
        sliceAngle = turnAngle + waveAngle;
      }

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
        -destSliceW * 0.5 - overlap * 0.5, -sliceH * 0.5, destSliceW + overlap, sliceH
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
