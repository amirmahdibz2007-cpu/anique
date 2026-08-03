import type { EvidencePack } from "./evidence.js";

let lastPack: EvidencePack | null = null;

export function setLastEvidencePack(pack: EvidencePack): void {
  lastPack = pack;
}

export function getLastEvidencePack(): EvidencePack | null {
  return lastPack;
}
