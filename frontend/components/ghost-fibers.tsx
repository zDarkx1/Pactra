// User-supplied GhostFibers, integrated with lifecycle/fallback safeguards
'use client';

import { useEffect, useRef } from 'react';
import { finite, frameDue, hexToRgb, mayAnimate, normalizeDpr, normalizeFps, normalizeLayers } from '../lib/ghost-fibers';

const vertex = `#version 300 es
in vec2 position;

void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragment = `#version 300 es
precision highp float;

uniform vec2 uResolution;
uniform float uTime;
uniform float uSpeed;
uniform float uScale;
uniform float uRotation;
uniform float uLayers;
uniform float uWaveAmplitude;
uniform float uWaveFrequency;
uniform float uWaveSpeed;
uniform float uLayerSpeed;
uniform float uTwist;
uniform float uTwistFrequency;
uniform float uTwistSpeed;
uniform float uLineFrequency;
uniform float uLineSpacing;
uniform float uLineSharpness;
uniform float uGlowFalloff;
uniform float uGlowIntensity;
uniform float uBrightness;
uniform float uBlueBoost;
uniform float uVignette;
uniform float uGrain;
uniform float uRotationSpeed;
uniform float uLightMode;
uniform vec3 uLineColor;
uniform vec3 uGlowColor;

out vec4 fragColor;

#define MAX_LAYERS 10

mat2 rotate2d(float angle) {
  float sine = sin(angle);
  float cosine = cos(angle);
  return mat2(cosine, -sine, sine, cosine);
}

float grainHash(vec2 point) {
  point = floor(point);
  float hash = 52.9829189 * fract(dot(point, vec2(0.065, 0.005)));
  return fract(hash);
}

float layeredGrain(vec2 fragmentPixel) {
  vec2 point = mod(fragmentPixel + vec2(uTime * 30.0, -uTime * 21.0), 1024.0);
  vec2 rotated = mat2(0.8, -0.5, 0.5, 0.8) * point;
  float grain = 0.0;
  grain += 0.40 * grainHash(rotated);
  grain += 0.25 * grainHash(rotated * 2.0 + 17.0);
  grain += 0.20 * grainHash(rotated * 4.0 + 47.0);
  grain += 0.10 * grainHash(rotated * 8.0 + 113.0);
  grain += 0.05 * grainHash(rotated * 16.0 + 191.0);
  return grain;
}

void main() {
  vec2 resolution = max(uResolution, vec2(1.0));
  vec2 uv = (2.0 * gl_FragCoord.xy - resolution) / resolution.y;
  float time = uTime * uSpeed;
  vec3 backdrop = mix(vec3(0.070588, 0.058824, 0.090196), vec3(1.0), step(0.5, uLightMode));
  vec3 centerTone = max(uLineColor * 0.85567 - uGlowColor * 0.06186, vec3(0.0));
  vec3 cloudTone = uLineColor * 0.19588 + uGlowColor * 0.2268;
  vec2 p = uv;
  p /= max(uScale, 0.05);
  p = rotate2d(radians(uRotation) + time * uRotationSpeed) * p;
  vec3 color = vec3(0.0);
  float fiberField = 0.0;

  for (int index = 0; index < MAX_LAYERS; index++) {
    float fi = float(index) + 1.0;
    if (fi > uLayers) break;

    p += uWaveAmplitude * sin(p.yx * fi * uWaveFrequency + time * (uWaveSpeed + fi * uLayerSpeed));

    float radius = length(p);
    float polarAngle = atan(p.y, p.x);
    polarAngle += sin(radius * uTwistFrequency - time * uTwistSpeed + fi) * uTwist;
    p = vec2(cos(polarAngle), sin(polarAngle)) * radius;

    float lines = abs(sin(p.x * (uLineFrequency + fi * uLineSpacing) + sin(p.y * 3.0 + time)));
    lines = pow(max(0.0, 1.0 - lines), uLineSharpness);
    fiberField += lines / fi;
    color += uLineColor * lines / fi;

    float glow = exp(-uGlowFalloff * abs(sin(p.x * 3.0 + time + fi)));
    color += uGlowColor * glow * uGlowIntensity / (fi * 2.0);
  }

  float center = exp(-2.2 * dot(uv, uv));
  color += centerTone * center;

  float cloud = exp(-1.5 * length(uv + vec2(sin(time * 0.3) * 0.25, cos(time * 0.25) * 0.18)));
  color += cloudTone * cloud;

  float vignette = 1.0 - smoothstep(0.35, 1.45, length(uv));
  color *= mix(1.0 - uVignette, 1.0, vignette);
  color = 1.0 - exp(-color * uBrightness);
  color.b *= uBlueBoost;

  vec3 outputColor;
  if (uLightMode > 0.5) {
    float edgeFade = mix(1.0 - uVignette, 1.0, vignette);
    float fibers = pow(smoothstep(0.12, 1.05, fiberField) * edgeFade, 1.5);
    float atmosphere = (center * 0.025 + cloud * 0.015) * edgeFade;
    vec3 fiberInk = mix(backdrop, uLineColor, 0.52);
    vec3 airColor = mix(backdrop, uGlowColor, 0.16);

    outputColor = mix(backdrop, airColor, atmosphere);
    outputColor = mix(outputColor, fiberInk, fibers * 0.3);
  } else {
    outputColor = backdrop + color;
  }

  float noise = (layeredGrain(gl_FragCoord.xy) - 0.5) * uGrain;
  outputColor = clamp(outputColor + noise, 0.0, 1.0);
  fragColor = vec4(outputColor, 1.0);
}
`;

export interface GhostFibersProps {
  lineColor?: string; glowColor?: string;
  speed?: number; scale?: number; rotation?: number; rotationSpeed?: number;
  layers?: number; waveAmplitude?: number; waveFrequency?: number;
  waveSpeed?: number; layerSpeed?: number; twist?: number;
  twistFrequency?: number; twistSpeed?: number; lineFrequency?: number;
  lineSpacing?: number; lineSharpness?: number; glowFalloff?: number;
  glowIntensity?: number; brightness?: number; blueBoost?: number;
  vignette?: number; grain?: number; lightMode?: boolean;
  dpr?: number; fps?: number; paused?: boolean; className?: string;
}

const defaults = {
  speed: 0.2, scale: 2, rotation: 0, rotationSpeed: 0.25, layers: 4,
  waveAmplitude: 0.015, waveFrequency: 3, waveSpeed: 0.15, layerSpeed: 0.08,
  twist: 0.1, twistFrequency: 5, twistSpeed: 1.2, lineFrequency: 5,
  lineSpacing: 2, lineSharpness: 16, glowFalloff: 10, glowIntensity: 1.6,
  brightness: 2, blueBoost: 1.25, vignette: 0.8, grain: 0.05,
};
type Ogl = typeof import('ogl');
type Uniforms = Record<string, { value: number | Float32Array }>;
let oglImport: Promise<Ogl> | undefined;

/**
 * SSR/no WebGL2/no IntersectionObserver: CSS only. Reduced motion: CSS only,
 * no import until motion is allowed; an existing canvas is hidden and paused.
 * Context loss or initialization/render failure is terminal for this mount
 * (no restoration retry). Changing normalized DPR explicitly remounts resources.
 * Defaults: DPR 1 (cap 1.5), FPS 30. Other shader defaults match the source.
 * data-frame is an imperative successful-draw counter, never React state.
 */
export default function GhostFibers(props: GhostFibersProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  const update = useRef<(() => void) | null>(null);
  const dpr = normalizeDpr(props.dpr);

  // Commit props before lifecycle setup; abandoned concurrent renders cannot leak.
  useEffect(() => { latest.current = props; update.current?.(); });
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const gates = { visible: false, hidden: document.hidden, reduced: media.matches,
      paused: !!latest.current.paused, disposed: false, failed: false };
    let importing = false;
    let raf: number | null = null;
    let previous = 0;
    let lastDraw = 0;
    let elapsed = 0;
    let frames = 0;
    let dirtySize = true;
    let canvas: HTMLCanvasElement | undefined;
    let gl: WebGL2RenderingContext | undefined;
    let renderer: InstanceType<Ogl['Renderer']> | undefined;
    let geometry: InstanceType<Ogl['Triangle']> | undefined;
    let program: InstanceType<Ogl['Program']> | undefined;
    let mesh: InstanceType<Ogl['Mesh']> | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let intersectionObserver: IntersectionObserver | undefined;
    let terminalState: 'static' | 'error' = 'static';
    const state = (value: 'static' | 'loading' | 'ready' | 'error') => {
      container.dataset.fibersState = value;
    };
    const stop = () => {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
      container.dataset.fibersRunning = 'false';
    };
    // Independent cleanup attempts also cover partially completed constructors.
    const attempt = (fn: () => void) => { try { fn(); } catch { /* best effort after context loss */ } };
    const release = () => {
      stop();
      canvas?.removeEventListener('webglcontextlost', onContextLost);
      attempt(() => geometry?.remove());
      attempt(() => program?.remove());
      attempt(() => gl?.getExtension('WEBGL_lose_context')?.loseContext());
      canvas?.remove();
      canvas = undefined; gl = undefined; renderer = undefined;
      geometry = undefined; program = undefined; mesh = undefined;
    };
    const fail = (value: 'static' | 'error') => {
      gates.failed = true;
      terminalState = value;
      release();
      if (!gates.disposed) state(value);
    };
    function onContextLost(event: Event) {
      event.preventDefault();
      fail('static'); // Intentionally retain CSS even if the browser restores.
    }
    const syncUniforms = () => {
      if (!program) return;
      const p = latest.current;
      const u = program.uniforms as Uniforms;
      for (const key of Object.keys(defaults) as (keyof typeof defaults)[]) {
        u[`u${key[0].toUpperCase()}${key.slice(1)}`].value = key === 'layers'
          ? normalizeLayers(p.layers) : finite(p[key], defaults[key]);
      }
      (u.uLineColor.value as Float32Array).set(hexToRgb(p.lineColor ?? '#140E35'));
      (u.uGlowColor.value as Float32Array).set(hexToRgb(p.glowColor ?? '#3437A0'));
      u.uLightMode.value = p.lightMode ? 1 : 0;
    };
    const draw = () => {
      if (!mayAnimate(gates) || !renderer || !program || !mesh || !gl) return false;
      try {
        if (gl.isContextLost()) { fail('static'); return false; }
        if (dirtySize) {
          const rect = container.getBoundingClientRect();
          renderer.setSize(Math.max(1, Math.floor(rect.width)), Math.max(1, Math.floor(rect.height)));
          (program.uniforms.uResolution.value as Float32Array).set([gl.drawingBufferWidth, gl.drawingBufferHeight]);
          dirtySize = false;
        }
        program.uniforms.uTime.value = elapsed;
        renderer.render({ scene: mesh });
        if (gl.getError() !== gl.NO_ERROR) throw new Error('GhostFibers draw failed');
        container.dataset.frame = String(++frames);
        state('ready');
        return true;
      } catch { fail('error'); return false; }
    };
    const loop = (now: number) => {
      raf = null;
      if (!mayAnimate(gates)) { stop(); return; }
      elapsed += Math.min(Math.max(0, (now - previous) / 1000), 0.1);
      previous = now;
      if (frameDue(now, lastDraw, normalizeFps(latest.current.fps))) {
        if (!draw()) return;
        lastDraw = now;
      }
      if (mayAnimate(gates)) raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!mayAnimate(gates) || !renderer || raf !== null) return;
      previous = performance.now();
      lastDraw = previous - 1000 / normalizeFps(latest.current.fps);
      container.dataset.fibersRunning = 'true';
      raf = requestAnimationFrame(loop);
    };
    const initialize = async () => {
      if (importing || renderer || !mayAnimate(gates)) return;
      importing = true;
      state('loading');
      try {
        const { Renderer, Triangle, Program, Mesh } = await (oglImport ??= import('ogl'));
        // Check again after import: unmount/StrictMode/visibility/props may change.
        if (!mayAnimate(gates)) return;
        canvas = document.createElement('canvas');
        const context = canvas.getContext('webgl2', { alpha: false, antialias: false });
        if (!context) { fail('static'); return; }
        gl = context;
        canvas.addEventListener('webglcontextlost', onContextLost);
        renderer = new Renderer({ canvas, webgl: 2, alpha: false, antialias: false, dpr });
        if (!renderer.isWebgl2) { fail('static'); return; }
        Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block', position: 'absolute', inset: '0' });
        canvas.setAttribute('aria-hidden', 'true');
        const uniforms: Uniforms = {
          uResolution: { value: new Float32Array([1, 1]) }, uTime: { value: 0 },
          uLightMode: { value: 0 }, uLineColor: { value: new Float32Array(3) },
          uGlowColor: { value: new Float32Array(3) },
        };
        for (const [key, value] of Object.entries(defaults)) {
          uniforms[`u${key[0].toUpperCase()}${key.slice(1)}`] = { value };
        }
        geometry = new Triangle(renderer.gl);
        program = new Program(renderer.gl, { vertex, fragment, uniforms });
        // OGL can log shader/link errors without throwing; validate explicitly.
        if (!gl.getProgramParameter(program.program, gl.LINK_STATUS)) throw new Error('GhostFibers shader link failed');
        mesh = new Mesh(renderer.gl, { geometry, program });
        syncUniforms();
        container.appendChild(canvas);
        start();
      } catch { if (!gates.disposed) fail('error'); }
      finally { importing = false; }
    };
    const reconcile = () => {
      if (gates.disposed) return;
      gates.hidden = document.hidden;
      gates.reduced = media.matches;
      gates.paused = !!latest.current.paused;
      if (gates.failed) { stop(); state(terminalState); return; }
      try { syncUniforms(); } catch { fail('error'); return; }
      if (canvas) canvas.style.visibility = gates.reduced ? 'hidden' : 'visible';
      if (!mayAnimate(gates)) {
        stop();
        state(gates.reduced || !frames ? 'static' : 'ready');
        return;
      }
      if (renderer) { state(frames ? 'ready' : 'loading'); start(); }
      else void initialize();
    };
    const resize = () => { dirtySize = true; }; // Never draw outside the gated RAF.
    update.current = reconcile;
    container.dataset.frame = '0';
    state('static');
    stop();
    document.addEventListener('visibilitychange', reconcile);
    media.addEventListener('change', reconcile);
    try {
      if (typeof IntersectionObserver !== 'undefined') {
        intersectionObserver = new IntersectionObserver(entries => {
          if (gates.disposed) return;
          const entry = entries[entries.length - 1];
          if (!entry) return;
          gates.visible = entry.isIntersecting;
          reconcile();
        }, { threshold: 0 });
        intersectionObserver.observe(container);
      }
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(container);
      } else window.addEventListener('resize', resize);
    } catch { fail('static'); }
    return () => {
      gates.disposed = true;
      update.current = null;
      intersectionObserver?.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', reconcile);
      media.removeEventListener('change', reconcile);
      release();
    };
  }, [dpr]);

  return <div ref={containerRef} className={`relative h-full w-full overflow-hidden pointer-events-none ${props.lightMode ? 'bg-[radial-gradient(ellipse_at_center,#eeeef7,#fff_75%)]' : 'bg-[radial-gradient(ellipse_at_48%_45%,#201a3c_0%,#171329_45%,#120f17_80%)]'} ${props.className ?? ''}`} aria-hidden="true"
    data-fibers-state="static" data-fibers-running="false" data-frame="0" />;
}
