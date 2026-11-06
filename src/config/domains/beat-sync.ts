/**
 * 节拍域：麦克风节拍检测参数。
 */

import { z } from 'zod'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { persistOptions } from '../persistence'

export const beatSyncSchema = z.object({
  sensitivity: z.number().min(0).max(1),
  minBeatIntervalMs: z.number().min(60).max(2000),
  bufferDurationMs: z.number().min(200).max(4000),
  lowpassHz: z.number().min(20).max(400),
  highpassHz: z.number().min(80).max(2000),
  envelopeMs: z.number().min(20).max(1000),
  adaptiveThreshold: z.boolean(),
  spectralFlux: z.boolean(),
  warmupMs: z.number().min(0).max(5000),
  spectrumScale: z.enum(['linear', 'log']),
})

export type BeatSyncConfig = z.infer<typeof beatSyncSchema>

interface BeatSyncState extends BeatSyncConfig {
  update: (patch: Partial<BeatSyncConfig>) => void
}

export const useBeatSyncStore = create<BeatSyncState>()(
  persist(
    set => ({
      sensitivity: 0.6,
      minBeatIntervalMs: 120,
      bufferDurationMs: 800,
      lowpassHz: 160,
      highpassHz: 400,
      envelopeMs: 120,
      adaptiveThreshold: true,
      spectralFlux: true,
      warmupMs: 800,
      spectrumScale: 'log',
      update: patch => set(patch),
    }),
    persistOptions<BeatSyncState>('beatSync'),
  ),
)
