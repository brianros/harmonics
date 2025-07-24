import React, { useState } from 'react';
import * as Tone from 'tone';
import { Midi } from '@tonejs/midi';

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

const INSTRUMENTS = [
  'Synth',
  'AMSynth',
  'FMSynth',
  'DuoSynth',
  'MonoSynth',
  'MembraneSynth',
  'PluckSynth',
  'MetalSynth',
  'PolySynth',
];

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

const NoteGenerator: React.FC = () => {
  const [root, setRoot] = useState('C');
  const [scaleIdx, setScaleIdx] = useState(0); // Major by default
  const [modeIdx, setModeIdx] = useState(0); // Ionian by default
  const [noteCount, setNoteCount] = useState(3);
  const [instrument, setInstrument] = useState('Synth');
  const [notes, setNotes] = useState<string[]>([]);

  // Compute the rotated interval pattern for the selected mode
  const rotatedIntervals = rotateIntervals(SCALES[scaleIdx].intervals, MODES[modeIdx].degree);
  const scaleNotes = buildScale(root, rotatedIntervals);

  const generateNotes = () => {
    const selected = getRandomElements(scaleNotes.slice(0, 7), noteCount);
    const harmonics = getHarmonics(selected, 12 - noteCount);
    setNotes([...selected, ...harmonics].slice(0, 12));
  };

  const playNotes = async () => {
    let synth: any;
    if (instrument === 'PolySynth') {
      synth = new Tone.PolySynth().toDestination();
    } else {
      // @ts-ignore
      synth = new Tone[instrument]().toDestination();
    }
    await Tone.start();
    for (const note of notes) {
      synth.triggerAttackRelease(note, '8n');
      await new Promise(res => setTimeout(res, 250));
    }
    synth.dispose();
  };

  const playMelody = async () => {
    if (!notes.length) return;
    let synth: any;
    if (instrument === 'PolySynth') {
      synth = new Tone.PolySynth().toDestination();
    } else {
      // @ts-ignore
      synth = new Tone[instrument]().toDestination();
    }
    await Tone.start();
    const shuffled = [...notes].sort(() => Math.random() - 0.5);
    for (const note of shuffled) {
      synth.triggerAttackRelease(note, '4n');
      await new Promise(res => setTimeout(res, 400));
    }
    synth.dispose();
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
          {INSTRUMENTS.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
      </label>
      <br />
      <button onClick={generateNotes}>Generate</button>
      <button onClick={playNotes} disabled={!notes.length}>Preview</button>
      <button onClick={playMelody} disabled={!notes.length}>Play Melody</button>
      <button onClick={exportMidi} disabled={!notes.length}>Export MIDI & Text</button>
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