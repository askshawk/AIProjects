// ======================================================================
// audio.js — tiny procedural sound effects (Web Audio, no asset files)
// ----------------------------------------------------------------------
// Synthesizes short blips/chimes for game actions. window.SFX.play("coin")
// etc. A mute toggle persists in localStorage. The audio context is
// resumed on the first user gesture (browser autoplay policy).
// ======================================================================

window.SFX = (function () {
  let ctx = null, muted = false;

  function ensure() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }
  function tone(freq, dur, type, gain, when) {
    const c = ensure(); if (!c || muted) return;
    const t = c.currentTime + (when || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain || 0.18, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.03);
  }

  const sfx = {
    coin()  { tone(880, 0.12, "triangle", 0.16); tone(1320, 0.14, "triangle", 0.12, 0.06); },
    build() { tone(170, 0.18, "sine", 0.22); tone(255, 0.12, "sine", 0.12, 0.05); },
    horn()  { tone(220, 0.5, "sawtooth", 0.16); tone(165, 0.6, "sawtooth", 0.12, 0.06); },
    click() { tone(620, 0.05, "square", 0.06); },
    win()   { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.34, "triangle", 0.16, i * 0.13)); },
    lose()  { [392, 311, 233].forEach((f, i) => tone(f, 0.4, "sawtooth", 0.14, i * 0.16)); },
  };

  return {
    play(name) { if (!muted && sfx[name]) sfx[name](); },
    toggleMute() { muted = !muted; try { localStorage.setItem("aegean.muted", muted ? "1" : "0"); } catch (e) {} return muted; },
    isMuted() { return muted; },
    init() {
      try { muted = localStorage.getItem("aegean.muted") === "1"; } catch (e) {}
      const resume = () => { ensure(); window.removeEventListener("pointerdown", resume); };
      window.addEventListener("pointerdown", resume);
    },
  };
})();
window.SFX.init();
