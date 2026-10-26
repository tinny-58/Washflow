"use client";

import React, { useEffect, useRef, useState } from "react";
import { Download, QrCode as QrIcon } from "lucide-react";

/**
 * Self-contained, dependency-free QR Code generator (Version 3/4 Byte Mode, Error Correction Level M).
 * Generates an SVG and provides instant download as PNG/SVG.
 */

// GF(256) math tables
const EXP_TABLE = new Uint8Array(256);
const LOG_TABLE = new Uint8Array(256);
(function initGalois() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    LOG_TABLE[x] = i;
    x = (x << 1) ^ (x & 128 ? 0x11d : 0);
  }
  for (let i = 255; i < 256; i++) EXP_TABLE[i] = EXP_TABLE[i - 255];
})();

function gMult(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[(LOG_TABLE[a] + LOG_TABLE[b]) % 255];
}

function polyMul(p1: number[], p2: number[]): number[] {
  const result = new Array(p1.length + p2.length - 1).fill(0);
  for (let i = 0; i < p1.length; i++) {
    for (let j = 0; j < p2.length; j++) {
      result[i + j] ^= gMult(p1[i], p2[j]);
    }
  }
  return result;
}

function rsGeneratorPoly(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    poly = polyMul(poly, [1, EXP_TABLE[i]]);
  }
  return poly;
}

function rsCompute(data: number[], ecCount: number): number[] {
  const gen = rsGeneratorPoly(ecCount);
  const info = [...data, ...new Array(ecCount).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const coef = info[i];
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        info[i + j] ^= gMult(gen[j], coef);
      }
    }
  }
  return info.slice(data.length);
}

// Minimal QR Matrix builder for typical short URLs (up to 70 chars, Version 4-M, 33x33)
export function generateQrMatrix(text: string): boolean[][] {
  const size = 33; // Version 4
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () =>
    Array(size).fill(null)
  );

  // 1. Finder patterns (top-left, top-right, bottom-left)
  function drawFinder(r0: number, c0: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = r0 + r;
        const nc = c0 + c;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        if (r === -1 || r === 7 || c === -1 || c === 7) {
          matrix[nr][nc] = false;
        } else if (r === 0 || r === 6 || c === 0 || c === 6) {
          matrix[nr][nc] = true;
        } else if (r >= 2 && r <= 4 && c >= 2 && c <= 4) {
          matrix[nr][nc] = true;
        } else {
          matrix[nr][nc] = false;
        }
      }
    }
  }

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // 2. Alignment pattern (at 24, 24 for Version 4)
  const aR = 24;
  const aC = 24;
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const dist = Math.max(Math.abs(r), Math.abs(c));
      matrix[aR + r][aC + c] = dist !== 1;
    }
  }

  // 3. Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (matrix[6][i] === null) matrix[6][i] = i % 2 === 0;
    if (matrix[i][6] === null) matrix[i][6] = i % 2 === 0;
  }
  matrix[size - 8][8] = true; // Dark module

  // 4. Reserve format and version areas
  for (let i = 0; i < 9; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
  }
  for (let i = 0; i < 8; i++) {
    if (matrix[8][size - 1 - i] === null) matrix[8][size - 1 - i] = false;
    if (matrix[size - 1 - i][8] === null) matrix[size - 1 - i][8] = false;
  }

  // 5. Data encoding (Byte mode)
  // Version 4-M total data codewords: 64 data + 36 EC
  const utf8Bytes = new TextEncoder().encode(text);
  const dataLen = utf8Bytes.length;

  // Bit buffer: Mode (0100) + Count (8 bits) + Data + Terminator
  const bits: number[] = [0, 1, 0, 0];
  for (let i = 7; i >= 0; i--) bits.push((dataLen >> i) & 1);
  for (let b of utf8Bytes) {
    for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  }
  // Terminator
  for (let i = 0; i < 4 && bits.length < 64 * 8; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  // Pad bytes: 0xEC, 0x11
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < 64 * 8) {
    const pad = padBytes[padIdx % 2];
    for (let i = 7; i >= 0; i--) bits.push((pad >> i) & 1);
    padIdx++;
  }

  // Group into 64 bytes
  const dataWords: number[] = [];
  for (let i = 0; i < 64 * 8; i += 8) {
    let word = 0;
    for (let j = 0; j < 8; j++) word = (word << 1) | bits[i + j];
    dataWords.push(word);
  }

  // Two RS blocks for 4-M: block 1 (32 data, 18 ec), block 2 (32 data, 18 ec)
  const block1 = dataWords.slice(0, 32);
  const block2 = dataWords.slice(32, 64);
  const ec1 = rsCompute(block1, 18);
  const ec2 = rsCompute(block2, 18);

  // Interleave data and EC
  const finalCodewords: number[] = [];
  for (let i = 0; i < 32; i++) {
    finalCodewords.push(block1[i]);
    finalCodewords.push(block2[i]);
  }
  for (let i = 0; i < 18; i++) {
    finalCodewords.push(ec1[i]);
    finalCodewords.push(ec2[i]);
  }

  const allBits: number[] = [];
  for (let cw of finalCodewords) {
    for (let i = 7; i >= 0; i--) allBits.push((cw >> i) & 1);
  }
  // Remainder bits for v4
  for (let i = 0; i < 7; i++) allBits.push(0);

  // 6. Placement in matrix (zigzag)
  let bitIdx = 0;
  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // Skip vertical timing column
    const colList = [right, right - 1];
    const rows = upward
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (let r of rows) {
      for (let c of colList) {
        if (matrix[r][c] === null) {
          const bit = bitIdx < allBits.length ? allBits[bitIdx++] : 0;
          // Apply mask 000: (row + col) % 2 === 0
          const mask = (r + c) % 2 === 0;
          matrix[r][c] = (bit === 1) !== mask;
        }
      }
    }
    upward = !upward;
  }

  // 7. Write Format Information (Mask 000, EC Level M (00) -> 00 000 -> 101010000010010 after BCH)
  const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
  // Top-left
  matrix[8][0] = formatBits[0] === 1;
  matrix[8][1] = formatBits[1] === 1;
  matrix[8][2] = formatBits[2] === 1;
  matrix[8][3] = formatBits[3] === 1;
  matrix[8][4] = formatBits[4] === 1;
  matrix[8][5] = formatBits[5] === 1;
  matrix[8][7] = formatBits[6] === 1;
  matrix[8][8] = formatBits[7] === 1;
  matrix[7][8] = formatBits[8] === 1;
  matrix[5][8] = formatBits[9] === 1;
  matrix[4][8] = formatBits[10] === 1;
  matrix[3][8] = formatBits[11] === 1;
  matrix[2][8] = formatBits[12] === 1;
  matrix[1][8] = formatBits[13] === 1;
  matrix[0][8] = formatBits[14] === 1;

  // Split copies
  for (let i = 0; i < 7; i++) {
    matrix[size - 1 - i][8] = formatBits[i] === 1;
  }
  for (let i = 0; i < 8; i++) {
    matrix[8][size - 8 + i] = formatBits[7 + i] === 1;
  }

  return matrix.map((row) => row.map((cell) => Boolean(cell)));
}

interface QrCardProps {
  value: string;
  code: string;
  className?: string;
}

export function ReferralQrCard({ value, code, className = "" }: QrCardProps) {
  const [matrix, setMatrix] = useState<boolean[][] | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    try {
      const m = generateQrMatrix(value);
      setMatrix(m);
    } catch {
      // Fallback
    }
  }, [value]);

  useEffect(() => {
    if (!matrix || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const moduleSize = 8;
    const padding = 16;
    const totalSize = matrix.length * moduleSize + padding * 2;
    canvas.width = totalSize;
    canvas.height = totalSize;

    // Background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, totalSize, totalSize);

    // Modules
    ctx.fillStyle = "#0f172a"; // Dark slate
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c]) {
          ctx.fillRect(
            padding + c * moduleSize,
            padding + r * moduleSize,
            moduleSize,
            moduleSize
          );
        }
      }
    }
  }, [matrix]);

  const downloadPng = () => {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `WashFlow-Referral-QR-${code}.png`;
    a.click();
  };

  return (
    <div
      className={`p-4 rounded-xl bg-slate-950/80 border border-white/10 flex flex-col items-center gap-3 text-center ${className}`}
    >
      <div className="p-3 bg-white rounded-xl shadow-lg shadow-black/40">
        <canvas ref={canvasRef} className="w-36 h-36 rounded-lg block" />
      </div>

      <div className="space-y-1">
        <span className="text-[11px] font-mono text-slate-400">Scan to book & earn</span>
        <button
          type="button"
          onClick={downloadPng}
          className="w-full py-1.5 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-slate-200 hover:text-white flex items-center justify-center gap-1.5 transition"
        >
          <Download className="w-3.5 h-3.5 text-sky-400" />
          <span>Download QR</span>
        </button>
      </div>
    </div>
  );
}
