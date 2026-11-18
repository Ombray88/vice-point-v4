/**
 * @file audio.js
 * @description Procedural WebAudio sound effects, engine hum, police siren, and radio stations for Vice Point 3D.
 */

export function createAudio() {
  let ctx = null;
  let masterGain = null;
  let musicGain = null;
  let sfxGain = null;
  let muted = false;
  let paused = false;

  // Engine state
  let engineOsc = null;
  let engineGain = null;
  let currentSpeed = 0;
  let maxSpeedCar = 1;

  // Siren state
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenToggle = false;
  let currentWanted = 0;

  // Radio state
  let currentStationIndex = 0;
  let trackTimer = 0;
  let trackIndex = 0;

  const stationDefs = [
    {
      name: 'WAVE 88.1 · Neon Drive',
      tracks: ['Neon Horizon', 'Midnight Chase', 'Synthetica']
    },
    {
      name: 'VICE FM · Funk Line',
      tracks: ['Biscayne Groove', 'Ocean Drive Strut', 'Funky Vice']
    },
    {
      name: 'OCEAN 99.5 · Sunset Chill',
      tracks: ['Palm Breeze', 'Sands of Time', 'Golden Horizon']
    }
  ];

  // Music sequencer state
  let seqTime = 0;
  let stepIndex = 0;

  function initContext() {
    if (ctx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      ctx = new AudioContext();

      masterGain = ctx.createGain();
      masterGain.gain.value = 0.5;
      masterGain.connect(ctx.destination);

      musicGain = ctx.createGain();
      musicGain.gain.value = 0.35;
      musicGain.connect(masterGain);

      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.3;
      sfxGain.connect(masterGain);

      // Setup engine oscillator
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineGain.connect(sfxGain);

      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      engineOsc.start();
      engineOsc.connect(engineGain);

      // Setup siren oscillator
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenGain.connect(sfxGain);

      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 600;
      sirenOsc.start();
      sirenOsc.connect(sirenGain);
    } catch (e) {}
  }

  function resume() {
    initContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }
  }

  function setMuted(m) {
    muted = !!m;
    if (masterGain && ctx) {
      masterGain.gain.setValueAtTime(muted ? 0 : 0.5, ctx.currentTime);
    }
  }

  function isMuted() {
    return muted;
  }

  function setPaused(p) {
    paused = !!p;
    if (ctx) {
      if (paused && ctx.state === 'running') {
        ctx.suspend();
      } else if (!paused && ctx.state === 'suspended' && !muted) {
        ctx.resume();
      }
    }
  }

  function setSpeed(speed, maxSpeed) {
    currentSpeed = speed || 0;
    maxSpeedCar = maxSpeed || 1;
    if (!engineGain || !engineOsc || !ctx) return;
    
    const active = Math.abs(currentSpeed) > 1;
    const targetGain = active && !paused ? 0.2 : 0;
    engineGain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.05);

    const freq = 50 + (Math.abs(currentSpeed) / maxSpeedCar) * 150;
    engineOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.05);
  }

  function setWanted(wanted) {
    currentWanted = wanted || 0;
    if (!sirenGain || !sirenOsc || !ctx) return;
    const targetGain = (currentWanted > 0 && !paused) ? 0.15 : 0;
    sirenGain.gain.setTargetAtTime(targetGain, ctx.currentTime, 0.1);
  }

  function setStation(index) {
    currentStationIndex = ((index % 3) + 3) % 3;
    trackTimer = 0;
    trackIndex = 0;
    return currentStation();
  }

  function stations() {
    return stationDefs.map((s) => ({
      name: s.name,
      track: s.tracks[0]
    }));
  }

  function currentStation() {
    const def = stationDefs[currentStationIndex];
    const track = def.tracks[trackIndex % def.tracks.length];
    return {
      name: def.name,
      track: track,
      index: currentStationIndex
    };
  }

  function tick(dt) {
    if (!ctx || paused || muted) return;

    if (currentWanted > 0) {
      sirenTimer += dt;
      if (sirenTimer > 0.4) {
        sirenTimer = 0;
        sirenToggle = !sirenToggle;
        sirenOsc.frequency.setValueAtTime(sirenToggle ? 750 : 550, ctx.currentTime);
      }
    }

    trackTimer += dt;
    if (trackTimer > 30) {
      trackTimer = 0;
      trackIndex++;
    }

    seqTime += dt;
    if (seqTime >= 0.25) {
      seqTime = 0;
      playMusicStep(stepIndex);
      stepIndex = (stepIndex + 1) % 16;
    }
  }

  function playMusicStep(step) {
    if (!ctx || !musicGain) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(musicGain);

    const rootFreq = currentStationIndex === 0 ? 110 : (currentStationIndex === 1 ? 82.41 : 130.81);
    const pentatonic = [0, 3, 5, 7, 10, 12, 15, 17];
    const funkNotes = [0, 0, 3, 5, 7, 10, 7, 5];
    const chillNotes = [0, 4, 7, 11, 14, 11, 7, 4];

    let noteOffset = 0;
    if (currentStationIndex === 0) {
      noteOffset = pentatonic[step % pentatonic.length];
      osc.type = 'sawtooth';
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800 + Math.sin(step * 0.5) * 400, now);
    } else if (currentStationIndex === 1) {
      noteOffset = funkNotes[step % funkNotes.length];
      osc.type = 'square';
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, now);
    } else {
      noteOffset = chillNotes[step % chillNotes.length];
      osc.type = 'sine';
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, now);
    }

    const playTrigger = currentStationIndex === 0 ? (step % 2 === 0) : (currentStationIndex === 1 ? (step % 4 !== 2) : (step % 4 === 0));
    if (!playTrigger) return;

    const freq = rootFreq * Math.pow(2, noteOffset / 12);
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.start(now);
    osc.stop(now + 0.25);
  }

  function complete() {
    if (!ctx || paused || muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(sfxGain);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.setValueAtTime(554.37, now + 0.1);
    osc.frequency.setValueAtTime(659.25, now + 0.2);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.start(now);
    osc.stop(now + 0.4);
  }

  function crash() {
    if (!ctx || paused || muted) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(sfxGain);

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.3);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  return {
    resume,
    setSpeed,
    setWanted,
    setStation,
    stations,
    currentStation,
    setMuted,
    isMuted,
    setPaused,
    tick,
    complete,
    crash
  };
}
