/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Waves,
  Image as ImageIcon,
  Sliders,
  Sparkles,
  CloudRain,
  Fish,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RotateCcw,
  Upload,
  Check,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';
import { WaterRippleEngine, WaterOptions } from './webgl/WaterRippleEngine';
import { KoiPondLayer } from './components/KoiPond';
import { waterAudio } from './utils/audio';
import {
  DEFAULT_BACKGROUND_URL,
  DEFAULT_CAUSTICS_URL,
  BACKGROUND_PRESETS,
} from './config/waterConfig';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<WaterRippleEngine | null>(null);
  const pondLayerRef = useRef<KoiPondLayer | null>(null);

  // Background state
  const [currentBgUrl, setCurrentBgUrl] = useState<string>(DEFAULT_BACKGROUND_URL);
  const [inputUrl, setInputUrl] = useState<string>('');
  const [bgLoadError, setBgLoadError] = useState<string | null>(null);

  // Simulation parameters
  const [options, setOptions] = useState<WaterOptions>({
    damping: 0.988,
    waveSpeed: 1.85,
    refractionStrength: 0.038,
    specularStrength: 1.8,
    specularShininess: 56.0,
    causticsStrength: 0.5,
    waterTint: [0.04, 0.22, 0.32],
    tintStrength: 0.22,
    dropRadius: 0.026,
    dropStrength: 0.7,
  });

  // Environment & interactive features
  const [rainMode, setRainMode] = useState<boolean>(false);
  const [rainFrequency, setRainFrequency] = useState<number>(350); // ms per raindrop
  const [showFish, setShowFish] = useState<boolean>(true);
  const [fishCount, setFishCount] = useState<number>(4);
  const [showLilies, setShowLilies] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // UI Panels
  const [activeTab, setActiveTab] = useState<'none' | 'background' | 'dynamics' | 'ecosystem'>('none');
  const [fps, setFps] = useState<number>(60);
  const [showTip, setShowTip] = useState<boolean>(true);

  // Auto-hide welcome tip after 7 seconds
  useEffect(() => {
    const timer = setTimeout(() => setShowTip(false), 7000);
    return () => clearTimeout(timer);
  }, []);

  // Initialize WebGL Water Engine & Koi Pond
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 1. Create WebGL 2 Water Engine
    const engine = new WaterRippleEngine(canvas);
    engineRef.current = engine;

    // 2. Create Underwater Koi Pond Layer
    const pondLayer = new KoiPondLayer(1024, 1024);
    pondLayerRef.current = pondLayer;
    pondLayer.showFish = showFish;
    pondLayer.showLilies = showLilies;
    pondLayer.setFishCount(fishCount);

    // Link fish tail swish to water ripple
    pondLayer.onFishRipple = (x, y, strength, radius) => {
      engine.addDrop(x, y, strength, radius);
    };

    // Link engine drop to audio synthesis
    engine.onDropAdded = (normX, _normY, strength) => {
      // Pan from -1 to 1 based on X coordinate
      const panX = normX * 2 - 1;
      waterAudio.playDrop(strength, panX);
      // Scare nearby fish
      if (pondLayerRef.current) {
        pondLayerRef.current.scareFish(normX * pondLayer.width, (1.0 - _normY) * pondLayer.height);
      }
    };

    // 3. Load Caustics Texture
    const causticsImg = new Image();
    causticsImg.crossOrigin = 'anonymous';
    causticsImg.onload = () => {
      engine.setCausticsTexture(causticsImg);
    };
    causticsImg.src = DEFAULT_CAUSTICS_URL;

    // 4. Load Initial Background Image
    loadBackgroundImage(currentBgUrl);

    // 5. Handle Window Resize
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      engine.resize(w, h);
      pondLayer.resize(Math.min(w, 1440), Math.min(h, 1440));
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    // 6. Main Render Loop (60 FPS)
    let animationId: number;
    let lastTime = performance.now();
    let frameCount = 0;
    let fpsTimer = performance.now();

    const loop = (currentTime: number) => {
      // Update pond layer (kinematics, fish swim, lilies)
      pondLayer.update(currentTime);
      pondLayer.render();

      // Render WebGL water simulation with displacement, refraction & specular highlights
      engine.render(pondLayer.canvas);

      // FPS tracking
      frameCount++;
      if (currentTime - fpsTimer >= 1000) {
        setFps(Math.round((frameCount * 1000) / (currentTime - fpsTimer)));
        frameCount = 0;
        fpsTimer = currentTime;
      }

      animationId = requestAnimationFrame(loop);
    };
    animationId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
      engine.destroy();
    };
  }, []);

  // Update engine options when state changes
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.options = { ...options };
    }
  }, [options]);

  // Update pond settings
  useEffect(() => {
    if (pondLayerRef.current) {
      pondLayerRef.current.showFish = showFish;
      pondLayerRef.current.showLilies = showLilies;
      pondLayerRef.current.setFishCount(fishCount);
    }
  }, [showFish, showLilies, fishCount]);

  // Handle rain simulation
  useEffect(() => {
    if (!rainMode) return;
    const interval = setInterval(() => {
      if (engineRef.current) {
        const x = 0.05 + Math.random() * 0.9;
        const y = 0.05 + Math.random() * 0.9;
        const strength = 0.35 + Math.random() * 0.45;
        const radius = 0.018 + Math.random() * 0.016;
        engineRef.current.addDrop(x, y, strength, radius);
      }
    }, rainFrequency);
    return () => clearInterval(interval);
  }, [rainMode, rainFrequency]);

  // Load and bind background image
  const loadBackgroundImage = useCallback((url: string) => {
    setBgLoadError(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (pondLayerRef.current) {
        pondLayerRef.current.setBackgroundImage(img);
      }
      if (engineRef.current) {
        engineRef.current.setBackgroundTexture(img);
      }
      setCurrentBgUrl(url);
    };
    img.onerror = () => {
      setBgLoadError('Không thể tải hình ảnh từ URL này. Vui lòng kiểm tra lại liên kết hoặc tải ảnh trực tiếp.');
    };
    img.src = url;
  }, []);

  // Handle local file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        loadBackgroundImage(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  // Toggle Sound
  const toggleSound = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    waterAudio.setMuted(nextMuted);
    if (!nextMuted) {
      // Play a gentle welcome droplet
      waterAudio.playDrop(0.8, 0);
    }
  };

  // Toggle Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Manual Drop Splash Trigger
  const triggerCenterDrop = () => {
    if (engineRef.current) {
      engineRef.current.addDrop(0.5, 0.5, options.dropStrength * 1.6, options.dropRadius * 1.5);
    }
  };

  // Clear Calm Water
  const handleClearWater = () => {
    if (engineRef.current) {
      engineRef.current.clearWater();
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none bg-slate-950 font-sans">
      {/* 1. Fullscreen WebGL 2 Simulation Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-pointer z-0"
        style={{ touchAction: 'none' }}
      />

      {/* 2. Top Bar (Three-Zone Strict Header Contract) */}
      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between gap-8 px-6 py-4 border-b border-white/10 bg-slate-950/60 backdrop-blur-md">
        {/* Zone 1: Wordmark */}
        <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
          <Waves className="w-5 h-5 text-cyan-400" />
          <span className="text-base font-semibold tracking-tight text-white">AquaRipple WebGL</span>
          <span className="text-xs text-slate-400 font-mono tabular-nums ml-2 hidden sm:inline">
            {fps} FPS
          </span>
        </div>

        {/* Zone 2: Navigation Links / Panel Toggles */}
        <nav className="flex items-center gap-1.5 sm:gap-4 text-xs sm:text-sm font-medium">
          <button
            onClick={() => setActiveTab(activeTab === 'background' ? 'none' : 'background')}
            className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              activeTab === 'background'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Ảnh nền đáy hồ</span>
          </button>

          <button
            onClick={() => setActiveTab(activeTab === 'dynamics' ? 'none' : 'dynamics')}
            className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              activeTab === 'dynamics'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Thông số sóng</span>
          </button>

          <button
            onClick={() => setActiveTab(activeTab === 'ecosystem' ? 'none' : 'ecosystem')}
            className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
              activeTab === 'ecosystem'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-300 hover:text-white hover:bg-white/5'
            }`}
          >
            <Fish className="w-3.5 h-3.5" />
            <span>Cá Koi & Mưa</span>
          </button>
        </nav>

        {/* Zone 3: Primary Action */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={triggerCenterDrop}
            className="px-3.5 py-1.5 text-xs font-medium text-slate-900 bg-cyan-400 hover:bg-cyan-300 active:scale-95 rounded-lg transition-all shadow-lg shadow-cyan-950/40 whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Tạo giọt nước</span>
          </button>
        </div>
      </header>

      {/* 3. Floating Instruction Tip (Disappears after 7s or on close) */}
      {showTip && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 max-w-md w-[90%] bg-slate-900/85 backdrop-blur-md border border-white/10 text-slate-200 px-4 py-3 rounded-xl shadow-xl flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <Info className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>
              Di chuyển chuột hoặc vuốt chạm trên màn hình để tạo sóng lan tỏa. Nhấp vào các tab trên để đổi ảnh đáy hồ hoặc chỉnh độ khúc xạ.
            </span>
          </div>
          <button
            onClick={() => setShowTip(false)}
            className="text-slate-400 hover:text-white px-1.5 py-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* 4. Active Drawer / Inspector Panel */}
      {activeTab !== 'none' && (
        <aside className="absolute top-18 right-6 z-20 w-84 sm:w-96 max-h-[calc(100vh-6.5rem)] overflow-y-auto bg-slate-950/85 backdrop-blur-xl border border-white/15 rounded-2xl p-5 shadow-2xl text-slate-200">
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/10">
            <h2 className="text-sm font-semibold tracking-wide text-white flex items-center gap-2">
              {activeTab === 'background' && <ImageIcon className="w-4 h-4 text-cyan-400" />}
              {activeTab === 'dynamics' && <Sliders className="w-4 h-4 text-cyan-400" />}
              {activeTab === 'ecosystem' && <Fish className="w-4 h-4 text-cyan-400" />}
              <span>
                {activeTab === 'background' && 'Hình ảnh nền & Đáy hồ'}
                {activeTab === 'dynamics' && 'Thuật toán sóng & Quang học'}
                {activeTab === 'ecosystem' && 'Hệ sinh thái & Thời tiết'}
              </span>
            </h2>
            <button
              onClick={() => setActiveTab('none')}
              className="text-xs text-slate-400 hover:text-white p-1 rounded hover:bg-white/5"
            >
              Đóng
            </button>
          </div>

          {/* TAB 1: BACKGROUND IMAGE MANAGER */}
          {activeTab === 'background' && (
            <div className="space-y-5 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1.5">
                  Nhập URL hình ảnh nền tùy ý (Đáy hồ / Cá / Phong cảnh):
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    placeholder="https://... hoặc đường dẫn ảnh"
                    className="flex-1 bg-slate-900 border border-white/15 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    onClick={() => {
                      if (inputUrl.trim()) loadBackgroundImage(inputUrl.trim());
                    }}
                    className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium whitespace-nowrap"
                  >
                    Áp dụng
                  </button>
                </div>
                {bgLoadError && (
                  <p className="mt-2 text-rose-400 leading-tight">{bgLoadError}</p>
                )}
              </div>

              {/* Local File Upload */}
              <div>
                <label className="block text-slate-300 font-medium mb-1.5">
                  Hoặc tải ảnh từ thiết bị của bạn:
                </label>
                <label className="flex items-center justify-center gap-2 w-full p-3 border border-dashed border-white/20 rounded-xl hover:border-cyan-400 hover:bg-white/5 cursor-pointer transition-colors text-slate-300">
                  <Upload className="w-4 h-4 text-cyan-400" />
                  <span>Chọn tệp ảnh JPG, PNG, WebP...</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Presets */}
              <div>
                <label className="block text-slate-300 font-medium mb-2">
                  Hình ảnh mẫu có sẵn:
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {BACKGROUND_PRESETS.map((preset) => {
                    const isSelected = currentBgUrl === preset.url;
                    return (
                      <button
                        key={preset.id}
                        onClick={() => loadBackgroundImage(preset.url)}
                        className={`text-left p-2.5 rounded-xl border transition-all ${
                          isSelected
                            ? 'border-cyan-400 bg-cyan-950/40 text-cyan-200 ring-1 ring-cyan-400'
                            : 'border-white/10 bg-slate-900/50 hover:bg-slate-900 text-slate-300 hover:border-white/20'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium truncate">{preset.name}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                        </div>
                        <p className="text-[11px] text-slate-400 line-clamp-2 leading-tight">
                          {preset.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 border-t border-white/10 text-slate-400 text-[11px] leading-relaxed">
                <span className="text-cyan-400 font-medium">Mẹo cho lập trình viên:</span> Bạn có thể cấu hình vĩnh viễn hình ảnh nền mặc định tại tệp{' '}
                <code className="text-slate-200 font-mono">src/config/waterConfig.ts</code> bằng cách gán lại biến{' '}
                <code className="text-cyan-300 font-mono">DEFAULT_BACKGROUND_URL</code>.
              </div>
            </div>
          )}

          {/* TAB 2: WAVE & OPTICAL DYNAMICS */}
          {activeTab === 'dynamics' && (
            <div className="space-y-4 text-xs">
              {/* Damping */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300 font-medium">Độ suy giảm sóng (Damping)</span>
                  <span className="font-mono text-cyan-300 tabular-nums">
                    {options.damping.toFixed(3)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.950"
                  max="0.996"
                  step="0.002"
                  value={options.damping}
                  onChange={(e) =>
                    setOptions({ ...options, damping: parseFloat(e.target.value) })
                  }
                  className="w-full accent-cyan-400"
                />
                <span className="text-[11px] text-slate-400">
                  Giá trị càng cao sóng càng tồn tại lâu và lan tỏa rộng hơn.
                </span>
              </div>

              {/* Refraction */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300 font-medium">Độ méo khúc xạ (Refraction)</span>
                  <span className="font-mono text-cyan-300 tabular-nums">
                    {options.refractionStrength.toFixed(3)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.005"
                  max="0.080"
                  step="0.002"
                  value={options.refractionStrength}
                  onChange={(e) =>
                    setOptions({ ...options, refractionStrength: parseFloat(e.target.value) })
                  }
                  className="w-full accent-cyan-400"
                />
                <span className="text-[11px] text-slate-400">
                  Mức độ bẻ cong hình ảnh đáy hồ theo định luật khúc xạ ánh sáng (Snell).
                </span>
              </div>

              {/* Specular Highlights */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300 font-medium">Độ sáng lấp lánh (Specular Highlights)</span>
                  <span className="font-mono text-cyan-300 tabular-nums">
                    {options.specularStrength.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="3.0"
                  step="0.1"
                  value={options.specularStrength}
                  onChange={(e) =>
                    setOptions({ ...options, specularStrength: parseFloat(e.target.value) })
                  }
                  className="w-full accent-cyan-400"
                />
                <span className="text-[11px] text-slate-400">
                  Ánh sáng mặt trời phản chiếu lấp lánh trên đỉnh ngọn sóng.
                </span>
              </div>

              {/* Specular Shininess */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300 font-medium">Độ bóng hội tụ tia sáng (Shininess)</span>
                  <span className="font-mono text-cyan-300 tabular-nums">
                    {options.specularShininess.toFixed(0)}
                  </span>
                </div>
                <input
                  type="range"
                  min="16"
                  max="128"
                  step="4"
                  value={options.specularShininess}
                  onChange={(e) =>
                    setOptions({ ...options, specularShininess: parseFloat(e.target.value) })
                  }
                  className="w-full accent-cyan-400"
                />
              </div>

              {/* Caustics */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300 font-medium">Vệt sáng đáy hồ (Caustics Light)</span>
                  <span className="font-mono text-cyan-300 tabular-nums">
                    {(options.causticsStrength * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={options.causticsStrength}
                  onChange={(e) =>
                    setOptions({ ...options, causticsStrength: parseFloat(e.target.value) })
                  }
                  className="w-full accent-cyan-400"
                />
                <span className="text-[11px] text-slate-400">
                  Hiệu ứng tán xạ mạng lưới ánh sáng động chiếu xuống đáy hồ.
                </span>
              </div>

              {/* Ripple Radius & Drop Strength */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/10">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-300 font-medium">Bán kính giọt</span>
                  </div>
                  <input
                    type="range"
                    min="0.015"
                    max="0.050"
                    step="0.002"
                    value={options.dropRadius}
                    onChange={(e) =>
                      setOptions({ ...options, dropRadius: parseFloat(e.target.value) })
                    }
                    className="w-full accent-cyan-400"
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-300 font-medium">Lực tác động</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="1.5"
                    step="0.05"
                    value={options.dropStrength}
                    onChange={(e) =>
                      setOptions({ ...options, dropStrength: parseFloat(e.target.value) })
                    }
                    className="w-full accent-cyan-400"
                  />
                </div>
              </div>

              {/* Reset to Default */}
              <div className="pt-2">
                <button
                  onClick={() => {
                    setOptions({
                      damping: 0.988,
                      waveSpeed: 1.85,
                      refractionStrength: 0.038,
                      specularStrength: 1.8,
                      specularShininess: 56.0,
                      causticsStrength: 0.5,
                      waterTint: [0.04, 0.22, 0.32],
                      tintStrength: 0.22,
                      dropRadius: 0.026,
                      dropStrength: 0.7,
                    });
                  }}
                  className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg flex items-center justify-center gap-1.5 transition-colors border border-white/10"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Khôi phục thông số mặc định</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: ECOSYSTEM & WEATHER */}
          {activeTab === 'ecosystem' && (
            <div className="space-y-4 text-xs">
              {/* Rain Mode Toggle */}
              <div className="flex items-center justify-between p-3 bg-slate-900/60 border border-white/10 rounded-xl">
                <div className="flex items-center gap-2.5">
                  <CloudRain className={`w-4 h-4 ${rainMode ? 'text-cyan-400' : 'text-slate-400'}`} />
                  <div>
                    <span className="font-medium text-white block">Chế độ Mưa rơi</span>
                    <span className="text-[11px] text-slate-400">
                      Tự động thả các giọt nước ngẫu nhiên tạo gợn sóng
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setRainMode(!rainMode)}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                    rainMode ? 'bg-cyan-500' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      rainMode ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {rainMode && (
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-300 font-medium">Tốc độ hạt mưa rơi</span>
                    <span className="font-mono text-cyan-300 tabular-nums">
                      {rainFrequency} ms
                    </span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="800"
                    step="50"
                    value={rainFrequency}
                    onChange={(e) => setRainFrequency(parseInt(e.target.value, 10))}
                    className="w-full accent-cyan-400"
                  />
                </div>
              )}

              {/* Swimming Koi Fish */}
              <div className="flex items-center justify-between p-3 bg-slate-900/60 border border-white/10 rounded-xl">
                <div className="flex items-center gap-2.5">
                  <Fish className={`w-4 h-4 ${showFish ? 'text-amber-400' : 'text-slate-400'}`} />
                  <div>
                    <span className="font-medium text-white block">Đàn cá Koi bơi lội</span>
                    <span className="text-[11px] text-slate-400">
                      Mô phỏng xương sống uốn lượn, đổ bóng dưới đáy hồ
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setShowFish(!showFish)}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                    showFish ? 'bg-amber-500' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      showFish ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {showFish && (
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-300 font-medium">Số lượng cá Koi</span>
                    <span className="font-mono text-cyan-300 tabular-nums">{fishCount} con</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="8"
                    step="1"
                    value={fishCount}
                    onChange={(e) => setFishCount(parseInt(e.target.value, 10))}
                    className="w-full accent-cyan-400"
                  />
                  <span className="text-[11px] text-slate-400">
                    Bao gồm các dòng cá: Kohaku (đỏ trắng), Showa (đen đỏ trắng), Yamabuki (vàng óng).
                  </span>
                </div>
              )}

              {/* Floating Lily Pads */}
              <div className="flex items-center justify-between p-3 bg-slate-900/60 border border-white/10 rounded-xl">
                <div>
                  <span className="font-medium text-white block">Lá sen & Hoa súng</span>
                  <span className="text-[11px] text-slate-400">
                    Bồng bềnh trôi dạt nhẹ nhàng trên mặt nước
                  </span>
                </div>
                <button
                  onClick={() => setShowLilies(!showLilies)}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                    showLilies ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      showLilies ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}
        </aside>
      )}

      {/* 5. Bottom Quick Control Bar */}
      <footer className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-4 py-2 bg-slate-950/70 backdrop-blur-md border border-white/10 rounded-full shadow-2xl">
        {/* Rain Toggle Button */}
        <button
          onClick={() => setRainMode(!rainMode)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap ${
            rainMode
              ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/50'
              : 'text-slate-300 hover:text-white hover:bg-white/10'
          }`}
          title="Bật/Tắt chế độ mưa"
        >
          <CloudRain className="w-3.5 h-3.5" />
          <span>Mưa {rainMode ? 'Bật' : 'Tắt'}</span>
        </button>

        {/* Audio Droplet Mute Button */}
        <button
          onClick={toggleSound}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap ${
            !isMuted
              ? 'bg-amber-500/25 text-amber-300 border border-amber-500/50'
              : 'text-slate-300 hover:text-white hover:bg-white/10'
          }`}
          title="Âm thanh giọt nước tổng hợp (Web Audio API)"
        >
          {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          <span>Âm thanh {!isMuted ? 'Bật' : 'Tắt'}</span>
        </button>

        {/* Calm Water Button */}
        <button
          onClick={handleClearWater}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/10 rounded-full transition-colors whitespace-nowrap"
          title="Làm phẳng mặt hồ ngay lập tức"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Lặng sóng</span>
        </button>

        {/* Fullscreen Button */}
        <button
          onClick={toggleFullscreen}
          className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          title="Toàn màn hình"
        >
          {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </footer>
    </div>
  );
}
