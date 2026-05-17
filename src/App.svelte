<script>
  import { onMount, onDestroy } from 'svelte'
  import { fade } from 'svelte/transition'
  import { get } from 'svelte/store'
  import { Application, Container } from 'pixi.js'

  import { handStore, updateFromMouse, clearMouseIfStale } from './stores/handStore.js'
  import { buildGlowTexture } from './lib/glowTexture.js'
  import {
    createPool,
    spawnBurst,
    spawnTrickle,
    spawnAmbient,
    tickParticles
  } from './lib/particleSystem.js'
  import { initHandTracker, stopHandTracker } from './lib/handTracker.js'

  let canvasContainer
  let showPrompt   = true
  let activeMode   = 'none'    // 'none' | 'camera' | 'mouse'
  let isFullscreen = false
  let showFsHint   = false

  let pixiApp
  let glowTexture
  let pool
  let particleContainer
  let videoEl

  const cleanupFns = []
  let fsHintTimer = null

  let ambientAccum     = 0
  let ambientInterval  = nextAmbientInterval()

  function nextAmbientInterval() { return 550 + Math.random() * 650 }

  let currentHandState = get(handStore)

  onMount(async () => {
    const unsub = handStore.subscribe(s => { currentHandState = s })
    cleanupFns.push(unsub)

    // ── Pixi setup ───────────────────────────────────────────────────────────
    pixiApp = new Application()
    await pixiApp.init({
      background: 0x000005,
      resizeTo: window,
      antialias: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true
    })
    canvasContainer.appendChild(pixiApp.canvas)

    glowTexture = buildGlowTexture()

    pool = createPool()
    particleContainer = new Container()
    pixiApp.stage.addChild(particleContainer)

    // ── Mouse tracking ───────────────────────────────────────────────────────
    function onMouseMove(e) {
      if (activeMode !== 'camera') updateFromMouse(e.clientX, e.clientY)
    }
    window.addEventListener('mousemove', onMouseMove)
    cleanupFns.push(() => window.removeEventListener('mousemove', onMouseMove))

    const staleTimer = setInterval(clearMouseIfStale, 100)
    cleanupFns.push(() => clearInterval(staleTimer))

    // ── Fullscreen change listener ───────────────────────────────────────────
    function onFsChange() {
      isFullscreen = !!document.fullscreenElement
      if (isFullscreen) {
        showFsHint = true
        clearTimeout(fsHintTimer)
        fsHintTimer = setTimeout(() => { showFsHint = false }, 2800)
      }
    }
    document.addEventListener('fullscreenchange', onFsChange)
    cleanupFns.push(() => {
      document.removeEventListener('fullscreenchange', onFsChange)
      clearTimeout(fsHintTimer)
    })

    // ── Main ticker ──────────────────────────────────────────────────────────
    pixiApp.ticker.add((ticker) => {
      const elapsedMs = ticker.deltaMS
      const state     = currentHandState
      const w         = pixiApp.screen.width
      const h         = pixiApp.screen.height

      ambientAccum += elapsedMs
      if (ambientAccum >= ambientInterval) {
        ambientAccum    = 0
        ambientInterval = nextAmbientInterval()
        spawnAmbient(pool, particleContainer, glowTexture, w, h)
      }

      if (state.source !== 'none') {
        state.hands.forEach((hand, idx) => {
          const isSecond = idx === 1
          if (hand.isMoving) {
            spawnBurst(pool, particleContainer, glowTexture, hand, isSecond)
          } else {
            spawnTrickle(pool, particleContainer, glowTexture, hand, isSecond)
          }
        })
      }

      tickParticles(pool, elapsedMs)
    })
  })

  onDestroy(() => {
    cleanupFns.forEach(fn => fn())
    stopCamera()
    if (pixiApp) pixiApp.destroy(true, { children: true })
  })

  // ── Fullscreen ───────────────────────────────────────────────────────────────
  async function toggleFullscreen() {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen()
    } else {
      await document.exitFullscreen()
    }
  }

  // ── Mode helpers ─────────────────────────────────────────────────────────────
  function stopCamera() {
    stopHandTracker()
    if (videoEl?.srcObject) {
      videoEl.srcObject.getTracks().forEach(t => t.stop())
      videoEl.srcObject = null
    }
  }

  async function enableCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      stopCamera()

      videoEl.srcObject = stream
      await videoEl.play()

      showPrompt = false
      activeMode = 'camera'
      handStore.set({ source: 'none', hands: [] })

      await initHandTracker(
        videoEl,
        () => ({ w: pixiApp.screen.width, h: pixiApp.screen.height }),
        onHandResult
      )
    } catch {
      enableMouse()
    }
  }

  function enableMouse() {
    stopCamera()
    showPrompt = false
    activeMode = 'mouse'
    handStore.set({ source: 'none', hands: [] })
  }

  function onHandResult(hands) {
    handStore.set({ source: 'camera', hands })
  }
</script>

<!-- ── Vignette ──────────────────────────────────────────────────────────── -->
<div class="vignette" />

<!-- ── Start screen ─────────────────────────────────────────────────────── -->
{#if showPrompt}
  <div class="prompt" transition:fade={{ duration: 700 }}>
    <p class="title">bioluminescence</p>
    <p class="sub">move your hands to wake the light</p>
    <div class="buttons">
      <button class="btn-primary" on:click={enableCamera}>enable camera</button>
      <p class="camera-hint">hold your hands up · good lighting helps · up to two hands</p>
      <button class="btn-secondary" on:click={enableMouse}>use mouse instead</button>
    </div>
  </div>
{/if}

<!-- ── Mode toggle ───────────────────────────────────────────────────────── -->
{#if !showPrompt}
  <div class="mode-toggle" transition:fade={{ duration: 500, delay: 300 }}>
    <button
      class="toggle-seg"
      class:active={activeMode === 'camera'}
      on:click={enableCamera}
    >camera</button>
    <button
      class="toggle-seg"
      class:active={activeMode === 'mouse'}
      on:click={enableMouse}
    >mouse</button>
  </div>
{/if}

<!-- ── Fullscreen button (top-right) ─────────────────────────────────────── -->
<button class="fs-btn" on:click={toggleFullscreen} title={isFullscreen ? 'exit fullscreen' : 'fullscreen'}>
  {#if isFullscreen}
    <!-- Compress icon -->
    <svg width="22" height="22" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 1v4h4M5 1v4H1M1 10h4v4M10 14v-4h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  {:else}
    <!-- Expand icon -->
    <svg width="22" height="22" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 1h5v5M6 1H1v5M1 9v5h5M14 9v5h-5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  {/if}
</button>

<!-- ── Fullscreen hint ────────────────────────────────────────────────────── -->
{#if showFsHint}
  <p class="fs-hint" transition:fade={{ duration: 600 }}>press esc to exit fullscreen</p>
{/if}

<!-- ── Camera video feed ──────────────────────────────────────────────────── -->
<!-- svelte-ignore a11y-media-has-caption -->
<video
  bind:this={videoEl}
  class="video-feed"
  class:visible={activeMode === 'camera' && !showPrompt}
  autoplay
  playsinline
  muted
/>

<!-- ── Canvas mount point ────────────────────────────────────────────────── -->
<div bind:this={canvasContainer} class="canvas-wrap" />

<style>
  .canvas-wrap {
    position: fixed;
    inset: 0;
    z-index: 0;
  }

  .vignette {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 10;
    background: radial-gradient(
      ellipse at 50% 50%,
      transparent 40%,
      rgba(0, 0, 4, 0.55) 70%,
      rgba(0, 0, 4, 0.88) 100%
    );
  }

  /* ── Start screen ─────────────────────────────────────────────────────── */
  .prompt {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: clamp(0.8rem, 2vw, 1.4rem);
    z-index: 20;
    background: rgba(0, 0, 5, 0.96);
    color: #fff;
    font-family: 'Courier New', Courier, monospace;
    padding: 1.5rem;
  }

  .title {
    font-size: clamp(1.8rem, 7vw, 4rem);
    letter-spacing: 0.5em;
    color: #00ffcc;
    text-transform: lowercase;
    margin-bottom: clamp(0.2rem, 1vw, 0.5rem);
    opacity: 0.92;
    text-align: center;
  }

  .sub {
    font-size: clamp(0.75rem, 2vw, 1.1rem);
    letter-spacing: 0.22em;
    color: rgba(255, 255, 255, 0.38);
    text-transform: lowercase;
    margin-bottom: clamp(1.5rem, 4vw, 2.8rem);
    text-align: center;
  }

  .buttons {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: clamp(0.7rem, 2vw, 1.2rem);
  }

  .camera-hint {
    font-size: clamp(0.62rem, 1.5vw, 0.78rem);
    letter-spacing: 0.18em;
    color: rgba(0, 255, 204, 0.32);
    text-align: center;
    margin-top: -0.2rem;
    margin-bottom: 0.2rem;
  }

  .btn-primary,
  .btn-secondary {
    font-family: 'Courier New', Courier, monospace;
    font-size: clamp(0.78rem, 2vw, 1.05rem);
    letter-spacing: 0.22em;
    text-transform: lowercase;
    cursor: pointer;
    border-radius: 1px;
    padding: clamp(0.6rem, 1.5vw, 1rem) clamp(1.5rem, 6vw, 3.8rem);
    transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease;
  }

  .btn-primary {
    background: transparent;
    border: 1px solid #00ffcc;
    color: #00ffcc;
  }

  .btn-primary:hover {
    background: #00ffcc;
    color: #000005;
  }

  .btn-secondary {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.18);
    color: rgba(255, 255, 255, 0.35);
  }

  .btn-secondary:hover {
    border-color: rgba(255, 255, 255, 0.45);
    color: rgba(255, 255, 255, 0.65);
  }

  /* ── Mode toggle ──────────────────────────────────────────────────────── */
  .mode-toggle {
    position: fixed;
    top: 15vh;
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    display: flex;
    border: 1px solid rgba(0, 255, 204, 0.22);
    border-radius: 2px;
    overflow: hidden;
    backdrop-filter: blur(6px);
  }

  .toggle-seg {
    font-family: 'Courier New', Courier, monospace;
    font-size: 0.92rem;
    letter-spacing: 0.25em;
    text-transform: lowercase;
    cursor: pointer;
    border: none;
    border-radius: 0;
    padding: 0.7rem 2.4rem;
    background: rgba(0, 0, 5, 0.6);
    color: rgba(255, 255, 255, 0.28);
    transition: background 0.2s ease, color 0.2s ease;
  }

  .toggle-seg:first-child {
    border-right: 1px solid rgba(0, 255, 204, 0.22);
  }

  .toggle-seg.active {
    background: rgba(0, 255, 204, 0.15);
    color: #00ffcc;
  }

  .toggle-seg:not(.active):hover {
    color: rgba(255, 255, 255, 0.6);
    background: rgba(255, 255, 255, 0.05);
  }

  /* ── Fullscreen button ────────────────────────────────────────────────── */
  .fs-btn {
    position: fixed;
    top: 1.4rem;
    right: 1.6rem;
    z-index: 30;
    background: rgba(0, 0, 5, 0.55);
    border: 1px solid rgba(0, 255, 204, 0.22);
    border-radius: 2px;
    color: rgba(0, 255, 204, 0.55);
    cursor: pointer;
    padding: 0.6rem 0.65rem;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(6px);
    transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease;
  }

  .fs-btn:hover {
    color: #00ffcc;
    border-color: rgba(0, 255, 204, 0.55);
    background: rgba(0, 255, 204, 0.1);
  }

  /* ── Camera video feed ────────────────────────────────────────────────── */
  .video-feed {
    position: fixed;
    top: 1rem;
    left: 50%;
    transform: translateX(-50%) scaleX(-1);
    width: clamp(100px, 18vw, 160px);
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border: 1px solid rgba(0, 255, 204, 0.28);
    border-radius: 3px;
    box-shadow: 0 0 12px rgba(0, 255, 204, 0.12);
    z-index: 30;
    background: #000005;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.5s ease;
  }

  .video-feed.visible {
    opacity: 1;
  }

  /* ── Fullscreen hint ──────────────────────────────────────────────────── */
  .fs-hint {
    position: fixed;
    top: calc(15vh + 3.6rem);
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    font-family: 'Courier New', Courier, monospace;
    font-size: 0.9rem;
    letter-spacing: 0.25em;
    text-transform: lowercase;
    color: rgba(0, 255, 204, 0.7);
    white-space: nowrap;
    pointer-events: none;
  }

  /* ── Mobile ───────────────────────────────────────────────────────────── */
  @media (hover: none) {
    .fs-btn { display: none; }
  }

  @media (max-width: 1068px) {
    .title       { letter-spacing: 0.12em; }
    .sub         { letter-spacing: 0.12em; }
    .camera-hint { letter-spacing: 0.08em; }
  }

  @media (max-width: 400px) {
    .title { font-size: clamp(1.2rem, 7vw, 1.8rem); }
  }
</style>
