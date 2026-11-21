// Ambient sea + wind, generated in the browser (no audio file to download). Off by default.
export class Sound {
  constructor(){ this.on = false; this.ctx = null; }
  build(){
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; } // brown noise
    const src = () => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * 4); return s; };
    this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination);
    // waves: low noise swelling slowly
    const sea = src(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    this.seaGain = ctx.createGain(); this.seaGain.gain.value = 0.55;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.11; lg.gain.value = 0.3; lfo.connect(lg).connect(this.seaGain.gain); lfo.start();
    sea.connect(lp).connect(this.seaGain).connect(this.master);
    // wind / airy hum for the cosmic ocean
    const wind = src(), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.7;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.08; wind.connect(bp).connect(this.windGain).connect(this.master);
    const hum = ctx.createOscillator(); hum.type = 'sine'; hum.frequency.value = 55; this.humGain = ctx.createGain(); this.humGain.gain.value = 0; hum.connect(this.humGain).connect(this.master); hum.start();
  }
  toggle(){
    this.on = !this.on; if (!this.ctx) this.build();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.master.gain.setTargetAtTime(this.on ? 0.5 : 0, this.ctx.currentTime, 0.6);
    return this.on;
  }
  pause(){ if (this.ctx && this.on) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2); }
  update(mix){
    if (!this.ctx || !this.on) return; const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(0.5, t, 0.6);
    this.seaGain.gain.setTargetAtTime(0.55 * (1 - mix * 0.75), t, 0.5); this.windGain.gain.setTargetAtTime(0.08 + mix * 0.12, t, 0.5); this.humGain.gain.setTargetAtTime(mix * 0.05, t, 0.8);
  }
}
