/**
 * Underwater Pond Layer:
 * Renders the lake bed floor image, swimming Japanese Koi fish with realistic spine kinematics,
 * and drifting water lily / lotus pads.
 * Output is drawn onto an offscreen canvas and uploaded to WebGL 2 as the displacement background!
 */

export interface KoiFish {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetAngle: number;
  angle: number;
  speed: number;
  maxSpeed: number;
  size: number;
  spine: { x: number; y: number }[];
  spineLength: number;
  numSegments: number;
  swimPhase: number;
  type: 'kohaku' | 'showa' | 'yamabuki' | 'asagi';
  depth: number; // 0.0 (near surface) to 1.0 (deep floor)
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
  colorVariant: number; // slight hue variance
  flowerColor?: string;
  hasBud?: boolean;
}

export class KoiPondLayer {
  public canvas: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  private bgImage: HTMLImageElement | null = null;
  private isBgLoaded = false;
  private fishList: KoiFish[] = [];
  private lilies: LilyPad[] = [];
  public width: number = 1024;
  public height: number = 1024;
  public showFish: boolean = true;
  public showLilies: boolean = true;
  private lastTime: number = 0;

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

    this.initFish(4);
    this.initLilies(12); // Tăng số lượng lá sen mặc định lên 12 lá
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
    const target = Math.max(0, Math.min(10, count));
    while (this.fishList.length < target) {
      this.fishList.push(this.createFish());
    }
    while (this.fishList.length > target) {
      this.fishList.pop();
    }
  }

  public setLilyCount(count: number) {
    const target = Math.max(0, Math.min(25, count));
    this.initLilies(target);
  }

  private createFish(): KoiFish {
    const types: ('kohaku' | 'showa' | 'yamabuki' | 'asagi')[] = ['kohaku', 'showa', 'yamabuki', 'asagi'];
    const chosenType = types[Math.floor(Math.random() * types.length)];
    const size = 32 + Math.random() * 26; // Fish size
    const numSegments = 11;
    const segDist = size * 0.16;
    const startX = Math.random() * this.width;
    const startY = Math.random() * this.height;
    const angle = Math.random() * Math.PI * 2;

    const spine: { x: number; y: number }[] = [];
    for (let i = 0; i < numSegments; i++) {
      spine.push({
        x: startX - Math.cos(angle) * i * segDist,
        y: startY - Math.sin(angle) * i * segDist,
      });
    }

    return {
      x: startX,
      y: startY,
      vx: Math.cos(angle) * 1.5,
      vy: Math.sin(angle) * 1.5,
      angle,
      targetAngle: angle,
      speed: 1.4 + Math.random() * 0.8,
      maxSpeed: 3.2,
      size,
      spine,
      spineLength: segDist,
      numSegments,
      swimPhase: Math.random() * Math.PI * 2,
      type: chosenType,
      depth: 0.2 + Math.random() * 0.6,
    };
  }

  private initFish(count: number) {
    this.fishList = [];
    for (let i = 0; i < count; i++) {
      this.fishList.push(this.createFish());
    }
  }

  /**
   * Tạo số lượng lá sen phong phú, tự nhiên theo từng cụm (clusters)
   * Giữ lòng hồ thoáng đãng để cá bơi và sóng nước lan tỏa đẹp mắt
   */
  private initLilies(count: number) {
    this.lilies = [];
    if (count <= 0) return;

    // Các cụm tâm tự nhiên ven bờ hồ
    const clusters = [
      { cx: 0.18, cy: 0.22, radius: 0.18 }, // Cụm góc trên trái
      { cx: 0.82, cy: 0.25, radius: 0.18 }, // Cụm góc trên phải
      { cx: 0.20, cy: 0.78, radius: 0.20 }, // Cụm góc dưới trái
      { cx: 0.80, cy: 0.75, radius: 0.20 }, // Cụm góc dưới phải
      { cx: 0.50, cy: 0.15, radius: 0.15 }, // Cụm viền trên
    ];

    for (let i = 0; i < count; i++) {
      // 75% lá phân bố theo các cụm tự nhiên, 25% trôi dạt ngẫu nhiên
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

      // Đa dạng kích thước lá từ nhỏ xinh đến lá sen lớn trưởng thành
      const sizeType = Math.random();
      let radius: number;
      if (sizeType < 0.35) {
        radius = 20 + Math.random() * 12; // Lá sen non
      } else if (sizeType < 0.8) {
        radius = 34 + Math.random() * 16; // Lá sen vừa
      } else {
        radius = 52 + Math.random() * 16; // Lá sen lớn
      }

      // Hoa sen nở trên các lá sen lớn (khoảng 25% số lá)
      let flowerColor: string | undefined;
      let hasBud: boolean | undefined;

      if (radius > 36 && Math.random() < 0.32) {
        const flowerRnd = Math.random();
        if (flowerRnd < 0.5) {
          flowerColor = '#f472b6'; // Hoa sen hồng phai
        } else if (flowerRnd < 0.8) {
          flowerColor = '#f8fafc'; // Hoa súng trắng thanh tao
        } else {
          hasBud = true; // Búp sen e ấp
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
      if (dist < 220) {
        // Dart away from splash
        const fleeAngle = Math.atan2(dy, dx);
        fish.targetAngle = fleeAngle + (Math.random() - 0.5) * 0.5;
        fish.speed = Math.min(fish.maxSpeed * 1.8, fish.speed + 2.5);
      }
    }
  }

  public update(time: number, pointerX?: number, pointerY?: number) {
    const dt = this.lastTime ? Math.min((time - this.lastTime) / 1000, 0.1) : 0.016;
    this.lastTime = time;

    // Update fish kinematics
    for (const fish of this.fishList) {
      fish.swimPhase += fish.speed * 3.5 * dt;

      // Random slow wandering target angle
      if (Math.random() < 0.02) {
        fish.targetAngle += (Math.random() - 0.5) * 1.4;
      }

      // Curious attraction
      if (pointerX !== undefined && pointerY !== undefined) {
        const pdx = pointerX - fish.x;
        const pdy = pointerY - fish.y;
        const pDist = Math.hypot(pdx, pdy);
        if (pDist < 160 && pDist > 40) {
          const approach = Math.atan2(pdy, pdx);
          fish.targetAngle = approach * 0.2 + fish.targetAngle * 0.8;
        }
      }

      // Border containment
      const margin = 80;
      if (fish.x < margin) fish.targetAngle = 0;
      else if (fish.x > this.width - margin) fish.targetAngle = Math.PI;
      if (fish.y < margin) fish.targetAngle = Math.PI / 2;
      else if (fish.y > this.height - margin) fish.targetAngle = -Math.PI / 2;

      // Smooth angle interpolation
      let angleDiff = fish.targetAngle - fish.angle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      fish.angle += angleDiff * 4.0 * dt;

      // Normal speed decay back to baseline
      fish.speed += (1.6 - fish.speed) * 0.8 * dt;

      // Advance head
      fish.x += Math.cos(fish.angle) * fish.speed * 60 * dt;
      fish.y += Math.sin(fish.angle) * fish.speed * 60 * dt;

      // Wrap-around bounds guard
      if (fish.x < -40) fish.x = this.width + 30;
      if (fish.x > this.width + 40) fish.x = -30;
      if (fish.y < -40) fish.y = this.height + 30;
      if (fish.y > this.height + 40) fish.y = -30;

      // Spine inverse kinematics
      fish.spine[0] = { x: fish.x, y: fish.y };
      for (let i = 1; i < fish.numSegments; i++) {
        const prev = fish.spine[i - 1];
        const curr = fish.spine[i];
        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        let d = Math.hypot(dx, dy);
        if (d === 0) d = 0.001;
        const factor = fish.spineLength / d;
        curr.x = prev.x + dx * factor;
        curr.y = prev.y + dy * factor;
      }
    }

    // Update lily pads drifting gently with subtle bobbing
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

    // 2. Render Koi Shadows on Pond Floor (Realistic depth illusion)
    if (this.showFish) {
      for (const fish of this.fishList) {
        this.renderFishShadow(ctx, fish);
      }
      // 3. Render Koi Fish Bodies
      for (const fish of this.fishList) {
        this.renderFishBody(ctx, fish);
      }
    }

    // 4. Render Floating Lotus / Lily Pads
    if (this.showLilies) {
      for (const lily of this.lilies) {
        this.renderLilyPad(ctx, lily);
      }
    }
  }

  private renderFishShadow(ctx: CanvasRenderingContext2D, fish: KoiFish) {
    const shadowOffset = 18 + fish.depth * 25;
    ctx.save();
    ctx.translate(shadowOffset * 0.7, shadowOffset);
    ctx.globalAlpha = 0.22 * (1.0 - fish.depth * 0.4);
    ctx.fillStyle = '#06080b';

    this.drawFishPath(ctx, fish);
    ctx.fill();
    ctx.restore();
  }

  private renderFishBody(ctx: CanvasRenderingContext2D, fish: KoiFish) {
    ctx.save();
    ctx.globalAlpha = 0.95 - fish.depth * 0.2;

    const baseColors: Record<KoiFish['type'], { main: string; pattern: string; accent: string }> = {
      kohaku: { main: '#f4f2ec', pattern: '#d7261e', accent: '#ffffff' },
      showa: { main: '#1c1b1a', pattern: '#d8281d', accent: '#f5f3ec' },
      yamabuki: { main: '#f59e0b', pattern: '#fbbf24', accent: '#b45309' },
      asagi: { main: '#64748b', pattern: '#ef4444', accent: '#cbd5e1' },
    };
    const col = baseColors[fish.type];

    // Pectoral Fins (Waving)
    this.drawPectoralFins(ctx, fish, col.main);

    // Main Body
    this.drawFishPath(ctx, fish);
    ctx.fillStyle = col.main;
    ctx.fill();

    // Secondary colored pattern spots
    this.drawFishMarkings(ctx, fish, col.pattern, col.accent);

    // Dorsal Fin along spine
    this.drawDorsalFin(ctx, fish);

    // Eyes
    this.drawFishEyes(ctx, fish);

    ctx.restore();
  }

  private drawFishPath(ctx: CanvasRenderingContext2D, fish: KoiFish) {
    const spine = fish.spine;
    const len = spine.length;
    const halfWidths = [
      fish.size * 0.16, // Snout
      fish.size * 0.28, // Head
      fish.size * 0.35, // Shoulders (widest)
      fish.size * 0.33,
      fish.size * 0.28,
      fish.size * 0.23,
      fish.size * 0.17,
      fish.size * 0.12,
      fish.size * 0.08,
      fish.size * 0.06, // Peduncle
      fish.size * 0.05, // Tail joint
    ];

    const leftPts: { x: number; y: number }[] = [];
    const rightPts: { x: number; y: number }[] = [];

    for (let i = 0; i < len; i++) {
      let nx = 0, ny = 0;
      if (i === 0) {
        const dx = spine[0].x - spine[1].x;
        const dy = spine[0].y - spine[1].y;
        const d = Math.hypot(dx, dy) || 1;
        nx = -dy / d;
        ny = dx / d;
      } else {
        const dx = spine[i - 1].x - spine[i].x;
        const dy = spine[i - 1].y - spine[i].y;
        const d = Math.hypot(dx, dy) || 1;
        nx = -dy / d;
        ny = dx / d;
      }
      const w = halfWidths[i] || fish.size * 0.1;
      leftPts.push({ x: spine[i].x + nx * w, y: spine[i].y + ny * w });
      rightPts.push({ x: spine[i].x - nx * w, y: spine[i].y - ny * w });
    }

    ctx.beginPath();
    ctx.moveTo(leftPts[0].x, leftPts[0].y);
    const headTipX = spine[0].x + Math.cos(fish.angle) * fish.size * 0.22;
    const headTipY = spine[0].y + Math.sin(fish.angle) * fish.size * 0.22;
    ctx.quadraticCurveTo(headTipX, headTipY, rightPts[0].x, rightPts[0].y);

    for (let i = 1; i < len; i++) {
      ctx.lineTo(rightPts[i].x, rightPts[i].y);
    }

    // Caudal Fin (Tail Fan)
    const tailBase = spine[len - 1];
    const tailAngle = Math.atan2(tailBase.y - spine[len - 2].y, tailBase.x - spine[len - 2].x);
    const tailOsc = Math.sin(fish.swimPhase) * 0.4;
    const finLen = fish.size * 0.7;
    const tX = tailBase.x + Math.cos(tailAngle + tailOsc) * finLen;
    const tY = tailBase.y + Math.sin(tailAngle + tailOsc) * finLen;
    const fSpread = fish.size * 0.35;
    const perpA = tailAngle + Math.PI / 2;

    ctx.lineTo(tX - Math.cos(perpA) * fSpread, tY - Math.sin(perpA) * fSpread);
    ctx.quadraticCurveTo(
      tailBase.x + Math.cos(tailAngle) * (finLen * 0.5),
      tailBase.y + Math.sin(tailAngle) * (finLen * 0.5),
      tX + Math.cos(perpA) * fSpread,
      tY + Math.sin(perpA) * fSpread
    );
    ctx.lineTo(leftPts[len - 1].x, leftPts[len - 1].y);

    for (let i = len - 2; i >= 0; i--) {
      ctx.lineTo(leftPts[i].x, leftPts[i].y);
    }
    ctx.closePath();
  }

  private drawPectoralFins(ctx: CanvasRenderingContext2D, fish: KoiFish, col: string) {
    const head = fish.spine[1];
    const prev = fish.spine[0];
    const angle = Math.atan2(head.y - prev.y, head.x - prev.x);
    const finOsc = Math.sin(fish.swimPhase * 0.8) * 0.25;

    ctx.save();
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.85;

    // Left fin
    ctx.beginPath();
    const lX = head.x + Math.cos(angle - Math.PI / 2) * fish.size * 0.3;
    const lY = head.y + Math.sin(angle - Math.PI / 2) * fish.size * 0.3;
    const lTipX = lX + Math.cos(angle - 2.2 + finOsc) * fish.size * 0.55;
    const lTipY = lY + Math.sin(angle - 2.2 + finOsc) * fish.size * 0.55;
    ctx.moveTo(lX, lY);
    ctx.quadraticCurveTo(lX + Math.cos(angle - 1.6) * fish.size * 0.35, lY + Math.sin(angle - 1.6) * fish.size * 0.35, lTipX, lTipY);
    ctx.quadraticCurveTo(lX + Math.cos(angle - 2.7) * fish.size * 0.4, lY + Math.sin(angle - 2.7) * fish.size * 0.4, lX, lY);
    ctx.fill();

    // Right fin
    ctx.beginPath();
    const rX = head.x + Math.cos(angle + Math.PI / 2) * fish.size * 0.3;
    const rY = head.y + Math.sin(angle + Math.PI / 2) * fish.size * 0.3;
    const rTipX = rX + Math.cos(angle + 2.2 - finOsc) * fish.size * 0.55;
    const rTipY = rY + Math.sin(angle + 2.2 - finOsc) * fish.size * 0.55;
    ctx.moveTo(rX, rY);
    ctx.quadraticCurveTo(rX + Math.cos(angle + 1.6) * fish.size * 0.35, rY + Math.sin(angle + 1.6) * fish.size * 0.35, rTipX, rTipY);
    ctx.quadraticCurveTo(rX + Math.cos(angle + 2.7) * fish.size * 0.4, rY + Math.sin(angle + 2.7) * fish.size * 0.4, rX, rY);
    ctx.fill();

    ctx.restore();
  }

  private drawFishMarkings(ctx: CanvasRenderingContext2D, fish: KoiFish, patternColor: string, accentColor: string) {
    if (fish.type === 'yamabuki') return;

    ctx.save();
    const h = fish.spine[1];
    ctx.fillStyle = patternColor;
    ctx.beginPath();
    ctx.arc(h.x, h.y, fish.size * 0.16, 0, Math.PI * 2);
    ctx.fill();

    const m1 = fish.spine[3];
    ctx.beginPath();
    ctx.ellipse(m1.x, m1.y, fish.size * 0.22, fish.size * 0.14, fish.angle, 0, Math.PI * 2);
    ctx.fill();

    const m2 = fish.spine[6];
    ctx.fillStyle = fish.type === 'showa' ? accentColor : patternColor;
    ctx.beginPath();
    ctx.ellipse(m2.x, m2.y, fish.size * 0.16, fish.size * 0.1, fish.angle + 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawDorsalFin(ctx: CanvasRenderingContext2D, fish: KoiFish) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fish.spine[2].x, fish.spine[2].y);
    for (let i = 3; i <= 6; i++) {
      ctx.lineTo(fish.spine[i].x, fish.spine[i].y);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawFishEyes(ctx: CanvasRenderingContext2D, fish: KoiFish) {
    const head = fish.spine[0];
    const perpA = fish.angle + Math.PI / 2;
    const eyeDist = fish.size * 0.14;

    ctx.save();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(head.x + Math.cos(perpA) * eyeDist, head.y + Math.sin(perpA) * eyeDist, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(head.x - Math.cos(perpA) * eyeDist, head.y - Math.sin(perpA) * eyeDist, 2.2, 0, Math.PI * 2);
    ctx.fill();
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
        // E ấp búp sen
        ctx.fillStyle = lily.flowerColor;
        ctx.beginPath();
        ctx.ellipse(0, 0, 9, 5, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fbcfe8';
        ctx.beginPath();
        ctx.ellipse(1, -1, 6, 3, Math.PI / 4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Hoa sen nở rực rỡ với nhiều lớp cánh
        const numPetals = 10;
        ctx.fillStyle = lily.flowerColor;
        for (let p = 0; p < numPetals; p++) {
          const pAng = (p / numPetals) * Math.PI * 2;
          ctx.beginPath();
          ctx.ellipse(Math.cos(pAng) * 7, Math.sin(pAng) * 7, 9, 4.5, pAng, 0, Math.PI * 2);
          ctx.fill();
        }
        // Lớp cánh trong
        ctx.fillStyle = lily.flowerColor === '#f472b6' ? '#fbcfe8' : '#ffffff';
        for (let p = 0; p < 6; p++) {
          const pAng = (p / 6) * Math.PI * 2 + 0.3;
          ctx.beginPath();
          ctx.ellipse(Math.cos(pAng) * 4, Math.sin(pAng) * 4, 6, 3, pAng, 0, Math.PI * 2);
          ctx.fill();
        }
        // Nhụy hoa vàng óng
        ctx.fillStyle = '#eab308';
        ctx.beginPath();
        ctx.arc(0, 0, 4.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }
}
