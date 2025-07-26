import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as Tone from 'tone';
import { Midi } from '@tonejs/midi';
import Soundfont from 'soundfont-player';
import JSZip from 'jszip';

// Scale interval definitions
const SCALES = [
  { name: 'Major', intervals: [2, 2, 1, 2, 2, 2, 1] }, // Ionian
  { name: 'Natural Minor', intervals: [2, 1, 2, 2, 1, 2, 2] }, // Aeolian
  { name: 'Harmonic Minor', intervals: [2, 1, 2, 2, 1, 3, 1] },
  { name: 'Melodic Minor', intervals: [2, 1, 2, 2, 2, 2, 1] },
];

const MODES = [
  { name: 'Ionian', degree: 0 },
  { name: 'Dorian', degree: 1 },
  { name: 'Phrygian', degree: 2 },
  { name: 'Lydian', degree: 3 },
  { name: 'Mixolydian', degree: 4 },
  { name: 'Aeolian', degree: 5 },
  { name: 'Locrian', degree: 6 },
];

const ROOTS = [
  'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'
];

function rotateIntervals(intervals: number[], modeDegree: number): number[] {
  // Rotate intervals to start from the selected mode degree
  return intervals.slice(modeDegree).concat(intervals.slice(0, modeDegree));
}

function buildScale(root: string, intervals: number[], octave: number = 4): string[] {
  let notes = [];
  let midi = Tone.Frequency(root + octave).toMidi();
  notes.push(Tone.Frequency(midi, 'midi').toNote());
  for (let i = 0; i < intervals.length - 1; i++) {
    midi += intervals[i];
    notes.push(Tone.Frequency(midi, 'midi').toNote());
  }
  return notes;
}

const TONE_SYNTHS = [
  { label: 'Synth', value: 'Synth' },
  { label: 'AMSynth', value: 'AMSynth' },
  { label: 'FMSynth', value: 'FMSynth' },
  { label: 'DuoSynth', value: 'DuoSynth' },
  { label: 'MonoSynth', value: 'MonoSynth' },
  { label: 'MembraneSynth', value: 'MembraneSynth' },
  { label: 'PluckSynth', value: 'PluckSynth' },
  { label: 'MetalSynth', value: 'MetalSynth' },
  { label: 'PolySynth', value: 'PolySynth' },
  { label: 'Acoustic Grand Piano', value: 'Piano' },
];

const SOUNDFONT_INSTRUMENTS = [
  { label: 'Violin', value: 'violin' },
  { label: 'Flute', value: 'flute' },
  { label: 'Electric Guitar (clean)', value: 'electric_guitar_clean' },
  { label: 'Trumpet', value: 'trumpet' },
  { label: 'Cello', value: 'cello' },
  { label: 'Clarinet', value: 'clarinet' },
  { label: 'Tuba', value: 'tuba' },
  { label: 'Xylophone', value: 'xylophone' },
  { label: 'Acoustic Bass', value: 'acoustic_bass' },
  { label: 'Oboe', value: 'oboe' },
  { label: 'Accordion', value: 'accordion' },
  { label: 'Harmonica', value: 'harmonica' },
  { label: 'Acoustic Guitar (nylon)', value: 'acoustic_guitar_nylon' },
  { label: 'Electric Piano', value: 'electric_piano_1' },
  // ...add more as desired
];

const INSTRUMENTS = [
  ...TONE_SYNTHS,
  ...SOUNDFONT_INSTRUMENTS,
];

const SAMPLE_MAP: Record<string, any> = {
  Piano: {
    urls: { C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3', A4: 'A4.mp3' },
    baseUrl: 'https://tonejs.github.io/audio/salamander/',
  },
};

function getRandomElements<T>(arr: T[], n: number): T[] {
  const result = [];
  const arrCopy = [...arr];
  while (result.length < n && arrCopy.length) {
    const idx = Math.floor(Math.random() * arrCopy.length);
    result.push(arrCopy.splice(idx, 1)[0]);
  }
  return result;
}

function getHarmonics(notes: string[], count: number): string[] {
  const harmonics: string[] = [];
  for (let i = 0; i < count; i++) {
    const note = notes[i % notes.length];
    const midi = Tone.Frequency(note).toMidi() + 7;
    harmonics.push(Tone.Frequency(midi, 'midi').toNote());
  }
  return harmonics;
}

function isSoundfontInstrument(instr: string) {
  return SOUNDFONT_INSTRUMENTS.some(i => i.value === instr);
}

const NoteGenerator: React.FC = () => {
  const [root, setRoot] = useState('C');
  const [scaleIdx, setScaleIdx] = useState(0); // Major by default
  const [modeIdx, setModeIdx] = useState(0); // Ionian by default
  const [noteCount, setNoteCount] = useState(3);
  const [instrument, setInstrument] = useState('Synth');
  const [notes, setNotes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [zipProgress, setZipProgress] = useState(0);
  const [sampleDuration, setSampleDuration] = useState(2);
  const [preloadProgress, setPreloadProgress] = useState(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  
  // Add caching for instruments
  const instrumentCache = useRef<Map<string, any>>(new Map());
  const samplerCache = useRef<Map<string, Tone.Sampler>>(new Map());
  const [preloadedInstruments, setPreloadedInstruments] = useState<Set<string>>(new Set());

  // Compute the rotated interval pattern for the selected mode
  const rotatedIntervals = rotateIntervals(SCALES[scaleIdx].intervals, MODES[modeIdx].degree);
  const scaleNotes = buildScale(root, rotatedIntervals);

  // Preload common instruments when component mounts
  useEffect(() => {
    const preloadCommonInstruments = async () => {
      const commonInstruments = ['Synth', 'Piano', 'violin', 'flute'];
      
      for (let i = 0; i < commonInstruments.length; i++) {
        const instr = commonInstruments[i];
        try {
          setPreloadProgress(Math.round(((i + 1) / commonInstruments.length) * 100));
          
          if (isSoundfontInstrument(instr)) {
            await preloadSoundfontInstrument(instr);
          } else if (instr === 'Piano') {
            await preloadSampler(instr);
          }
          setPreloadedInstruments(prev => new Set([...prev, instr]));
        } catch (error) {
          console.warn(`Failed to preload ${instr}:`, error);
        }
      }
      setPreloadProgress(0);
    };

    preloadCommonInstruments();
  }, []);

  // Preload instrument when user changes selection
  useEffect(() => {
    const preloadSelectedInstrument = async () => {
      if (preloadedInstruments.has(instrument)) {
        return; // Already preloaded
      }

      try {
        if (isSoundfontInstrument(instrument)) {
          await preloadSoundfontInstrument(instrument);
        } else if (instrument === 'Piano') {
          await preloadSampler(instrument);
        }
        setPreloadedInstruments(prev => new Set([...prev, instrument]));
      } catch (error) {
        console.warn(`Failed to preload ${instrument}:`, error);
      }
    };

    preloadSelectedInstrument();
  }, [instrument]);

  // Preload soundfont instrument
  const preloadSoundfontInstrument = async (instrumentName: string) => {
    if (instrumentCache.current.has(instrumentName)) {
      return instrumentCache.current.get(instrumentName);
    }

    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    const instrument = await Soundfont.instrument(audioCtxRef.current, instrumentName as any);
    instrumentCache.current.set(instrumentName, instrument);
    return instrument;
  };

  // Preload sampler
  const preloadSampler = async (instrumentName: string) => {
    if (samplerCache.current.has(instrumentName)) {
      return samplerCache.current.get(instrumentName);
    }

    const sampler = new Tone.Sampler({
      urls: SAMPLE_MAP[instrumentName].urls,
      baseUrl: SAMPLE_MAP[instrumentName].baseUrl,
    }).toDestination();
    
    await sampler.loaded;
    samplerCache.current.set(instrumentName, sampler);
    return sampler;
  };

  const getSynthOrSampler = useCallback(async () => {
    if (instrument === 'Piano') {
      // Check cache first
      if (samplerCache.current.has(instrument)) {
        return samplerCache.current.get(instrument);
      }

      // Load in background without blocking UI
      const loadPromise = preloadSampler(instrument);
      setLoading(true);
      
      // If we need it immediately, wait for it
      if (loading) {
        const sampler = await loadPromise;
        setLoading(false);
        return sampler;
      } else {
        // Otherwise, let it load in background
        loadPromise.then(() => setLoading(false));
        // Return a temporary synth while loading
        return new Tone.Synth().toDestination();
      }
    } else if (instrument === 'PolySynth') {
      return new Tone.PolySynth().toDestination();
    } else if ((Tone as any)[instrument]) {
      return new (Tone as any)[instrument]().toDestination();
    } else {
      return new Tone.Synth().toDestination();
    }
  }, [instrument, loading]);

  const getSoundfontInstrument = useCallback(async () => {
    // Check cache first
    if (instrumentCache.current.has(instrument)) {
      return instrumentCache.current.get(instrument);
    }

    // Load in background without blocking UI
    const loadPromise = preloadSoundfontInstrument(instrument);
    setLoading(true);
    
    // If we need it immediately, wait for it
    if (loading) {
      const player = await loadPromise;
      setLoading(false);
      return player;
    } else {
      // Otherwise, let it load in background
      loadPromise.then(() => setLoading(false));
      // Return a temporary synth while loading
      return new Tone.Synth().toDestination();
    }
  }, [instrument, loading]);

  const generateNotes = () => {
    const selected = getRandomElements(scaleNotes.slice(0, 7), noteCount);
    const harmonics = getHarmonics(selected, 12 - noteCount);
    setNotes([...selected, ...harmonics].slice(0, 12));
  };

  const playNotes = async () => {
    if (isSoundfontInstrument(instrument)) {
      const player = await getSoundfontInstrument();
      for (const note of notes) {
        player.play(note, 0, { duration: 0.25 });
        await new Promise(res => setTimeout(res, 250));
      }
    } else {
      const synth = await getSynthOrSampler();
      await Tone.start();
      for (const note of notes) {
        synth.triggerAttackRelease(note, '8n');
        await new Promise(res => setTimeout(res, 250));
      }
      synth.dispose && synth.dispose();
    }
  };

  const playMelody = async () => {
    if (!notes.length) return;
    if (isSoundfontInstrument(instrument)) {
      const player = await getSoundfontInstrument();
      const shuffled = [...notes].sort(() => Math.random() - 0.5);
      for (const note of shuffled) {
        player.play(note, 0, { duration: 0.4 });
        await new Promise(res => setTimeout(res, 400));
      }
    } else {
      const synth = await getSynthOrSampler();
      await Tone.start();
      const shuffled = [...notes].sort(() => Math.random() - 0.5);
      for (const note of shuffled) {
        synth.triggerAttackRelease(note, '4n');
        await new Promise(res => setTimeout(res, 400));
      }
      synth.dispose && synth.dispose();
    }
  };

  const exportMidi = () => {
    const midi = new Midi();
    const track = midi.addTrack();
    notes.forEach((note, i) => {
      track.addNote({ name: note, time: i * 0.25, duration: 0.2 });
    });
    const blob = new Blob([midi.toArray()], { type: 'audio/midi' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sequence.mid';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportText = () => {
    const midiNumbers = notes.map(n => Tone.Frequency(n).toMidi()).join(', ');
    const textBlob = new Blob([
      `MIDI note numbers: ${midiNumbers}\nNotes: ${notes.join(', ')}`
    ], { type: 'text/plain' });
    const textUrl = URL.createObjectURL(textBlob);
    const a2 = document.createElement('a');
    a2.href = textUrl;
    a2.download = 'sequence.txt';
    a2.click();
    URL.revokeObjectURL(textUrl);
  };

  const downloadZipSamples = async () => {
    if (!notes.length) return;
    
    setLoading(true);
    setZipProgress(0);
    const zip = new JSZip();
    
    try {
      await Tone.start();
      
      // Create a buffer for each note
      for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        
        // Update progress
        setZipProgress(Math.round(((i + 1) / notes.length) * 100));
        
                 // Generate audio buffer directly instead of using recorder
         const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
         const sampleRate = audioContext.sampleRate;
         const duration = sampleDuration; // Use selected duration
         const bufferSize = sampleRate * duration;
        const buffer = audioContext.createBuffer(1, bufferSize, sampleRate);
        const channelData = buffer.getChannelData(0);
        
        // Get the frequency for the note
        const frequency = Tone.Frequency(note).toFrequency();
        
        // Generate audio samples
        for (let j = 0; j < bufferSize; j++) {
          const time = j / sampleRate;
          
          // Create a more complex waveform based on the instrument
          let sample = 0;
          
          if (instrument === 'Piano' || instrument === 'PolySynth') {
            // Piano-like sound with harmonics
            sample = Math.sin(2 * Math.PI * frequency * time) * 0.3;
            sample += Math.sin(2 * Math.PI * frequency * 2 * time) * 0.15;
            sample += Math.sin(2 * Math.PI * frequency * 3 * time) * 0.1;
          } else if (instrument === 'FMSynth') {
            // FM synthesis-like sound
            const modulator = Math.sin(2 * Math.PI * frequency * 2 * time);
            sample = Math.sin(2 * Math.PI * frequency * time + modulator * 0.5) * 0.3;
          } else if (instrument === 'AMSynth') {
            // AM synthesis-like sound
            const modulator = Math.sin(2 * Math.PI * frequency * 1.5 * time);
            sample = Math.sin(2 * Math.PI * frequency * time) * (0.5 + 0.3 * modulator) * 0.3;
          } else if (instrument === 'PluckSynth') {
            // Pluck-like sound with decay
            const decay = Math.exp(-time * 2);
            sample = Math.sin(2 * Math.PI * frequency * time) * decay * 0.4;
          } else if (instrument === 'MetalSynth') {
            // Metal-like sound with inharmonic content
            sample = Math.sin(2 * Math.PI * frequency * time) * 0.2;
            sample += Math.sin(2 * Math.PI * frequency * 2.1 * time) * 0.1;
            sample += Math.sin(2 * Math.PI * frequency * 3.2 * time) * 0.05;
          } else {
            // Default synth sound
            sample = Math.sin(2 * Math.PI * frequency * time) * 0.3;
          }
          
          // Apply envelope (attack, sustain, release)
          const attackTime = 0.1;
          const releaseTime = 0.5;
          let envelope = 1;
          
          if (time < attackTime) {
            envelope = time / attackTime;
          } else if (time > duration - releaseTime) {
            envelope = (duration - time) / releaseTime;
          }
          
          channelData[j] = sample * envelope;
        }
        
        // Convert to WAV format
        const wavBuffer = await audioBufferToWav(buffer);
        const fileName = `note_${i + 1}_${note.replace('#', 'sharp').replace('b', 'flat')}.wav`;
        zip.file(fileName, wavBuffer);
        
        // Clean up audio context
        audioContext.close();
      }
      
      // Generate the zip file
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
             a.download = `harmonics_samples_${root}_${SCALES[scaleIdx].name.toLowerCase()}_${sampleDuration}s.zip`;
      a.click();
      URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Error generating zip file:', error);
      alert('Error generating zip file. Please try again.');
    } finally {
      setLoading(false);
      setZipProgress(0);
    }
  };

  // Helper function to convert AudioBuffer to WAV format
  const audioBufferToWav = async (buffer: AudioBuffer): Promise<ArrayBuffer> => {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const length = buffer.length;
    const arrayBuffer = new ArrayBuffer(44 + length * numChannels * 2);
    const view = new DataView(arrayBuffer);
    
    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * numChannels * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * numChannels * 2, true);
    
    // Write audio data
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample * 0x7FFF, true);
        offset += 2;
      }
    }
    
    return arrayBuffer;
  };

  return (
    <div style={{ maxWidth: 400, margin: 'auto' }}>
      <h2>Note & Harmonics Generator</h2>
      <label>Root:
        <select value={root} onChange={e => setRoot(e.target.value)}>
          {ROOTS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </label>
      <br />
      <label>Scale:
        <select value={scaleIdx} onChange={e => setScaleIdx(Number(e.target.value))}>
          {SCALES.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}
        </select>
      </label>
      <br />
      <label>Mode:
        <select value={modeIdx} onChange={e => setModeIdx(Number(e.target.value))}>
          {MODES.map((m, i) => <option key={m.name} value={i}>{m.name}</option>)}
        </select>
      </label>
      <br />
      <label>Number of Notes:
        <input type="number" min={1} max={5} value={noteCount} onChange={e => setNoteCount(Number(e.target.value))} />
      </label>
      <br />
             <label>Instrument:
         <select value={instrument} onChange={e => setInstrument(e.target.value)}>
           {INSTRUMENTS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
         </select>
       </label>
       <br />
       <label>Sample Duration: {sampleDuration} seconds
         <input 
           type="range" 
           min="0.5" 
           max="10" 
           step="0.5" 
           value={sampleDuration} 
           onChange={e => setSampleDuration(Number(e.target.value))}
           style={{ width: '100%', marginTop: '4px' }}
         />
       </label>
       <br />
      {loading && <div>Loading instrument samples...</div>}
      {preloadProgress > 0 && (
        <div style={{ marginBottom: '8px' }}>
          <div>Preloading instruments: {preloadProgress}%</div>
          <div style={{ 
            width: '100%', 
            height: '16px', 
            backgroundColor: '#f0f0f0', 
            borderRadius: '8px',
            overflow: 'hidden'
          }}>
            <div style={{ 
              width: `${preloadProgress}%`, 
              height: '100%', 
              backgroundColor: '#2196F3', 
              transition: 'width 0.3s ease'
            }}></div>
          </div>
        </div>
      )}
      {preloadedInstruments.size > 0 && (
        <div style={{ fontSize: '0.8em', color: '#666', marginBottom: '8px' }}>
          Preloaded: {Array.from(preloadedInstruments).join(', ')}
        </div>
      )}
      <button onClick={generateNotes}>Generate</button>
      <button onClick={playNotes} disabled={!notes.length || loading}>Preview</button>
      <button onClick={playMelody} disabled={!notes.length || loading}>Play Melody</button>
            <button onClick={exportMidi} disabled={!notes.length}>Export MIDI</button>
      <button onClick={exportText} disabled={!notes.length}>Export Text</button>
      <button onClick={downloadZipSamples} disabled={!notes.length || loading}>Download {sampleDuration}s Samples</button>
      <button 
        onClick={async () => {
          setPreloadProgress(0);
          const allInstruments = INSTRUMENTS.map(i => i.value);
          for (let i = 0; i < allInstruments.length; i++) {
            const instr = allInstruments[i];
            try {
              setPreloadProgress(Math.round(((i + 1) / allInstruments.length) * 100));
              if (isSoundfontInstrument(instr)) {
                await preloadSoundfontInstrument(instr);
              } else if (instr === 'Piano') {
                await preloadSampler(instr);
              }
              setPreloadedInstruments(prev => new Set([...prev, instr]));
            } catch (error) {
              console.warn(`Failed to preload ${instr}:`, error);
            }
          }
          setPreloadProgress(0);
        }}
        disabled={loading}
        style={{ fontSize: '0.8em', padding: '4px 8px' }}
      >
        Preload All Instruments
      </button>
      {loading && zipProgress > 0 && (
        <div style={{ marginTop: 8 }}>
          <div>Generating samples: {zipProgress}%</div>
          <div style={{ 
            width: '100%', 
            height: '20px', 
            backgroundColor: '#f0f0f0', 
            borderRadius: '10px',
            overflow: 'hidden'
          }}>
            <div style={{ 
              width: `${zipProgress}%`, 
              height: '100%', 
              backgroundColor: '#4CAF50', 
              transition: 'width 0.3s ease'
            }}></div>
          </div>
        </div>
      )}
      <div style={{ marginTop: 16 }}>
        <strong>Notes:</strong> {notes.join(', ')}
      </div>
      <div style={{ marginTop: 8, fontSize: '0.9em' }}>
        <strong>Scale:</strong> {scaleNotes.slice(0, 7).join(', ')}
      </div>
    </div>
  );
};

export default NoteGenerator; 