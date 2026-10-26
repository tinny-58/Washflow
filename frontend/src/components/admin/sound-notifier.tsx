"use client";

import React, { useEffect } from "react";
import { Volume2, VolumeX } from "lucide-react";

export function playBookingChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Harmonic multi-tone chime (D5 -> F#5 -> A5 -> D6)
    const notes = [587.33, 739.99, 880.0, 1174.66];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);

      gain.gain.setValueAtTime(0.001, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.2, now + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.5);
    });
  } catch (err) {
    console.warn("Audio chime playback blocked or unavailable:", err);
  }
}

interface SoundNotifierProps {
  soundEnabled: boolean;
  onToggleSound: () => void;
}

export function SoundNotifierToggle({ soundEnabled, onToggleSound }: SoundNotifierProps) {
  return (
    <button
      type="button"
      onClick={() => {
        onToggleSound();
        if (!soundEnabled) {
          playBookingChime(); // Test chime immediately when enabled
        }
      }}
      className={`p-2 rounded-xl border text-xs font-medium flex items-center gap-1.5 transition ${
        soundEnabled
          ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
          : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
      }`}
      title={soundEnabled ? "Mute order sound notifications" : "Enable order sound notifications"}
    >
      {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
      <span className="hidden sm:inline">{soundEnabled ? "Sound ON" : "Sound Muted"}</span>
    </button>
  );
}
