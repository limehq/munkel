import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge conditional class names, deduping conflicting Tailwind utilities. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Promise-based timer used by the hero notch demo and the terminal typing demo. */
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
