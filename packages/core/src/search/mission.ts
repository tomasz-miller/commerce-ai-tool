import type { DecomposedShoppingMission, MissionsConfig } from "../types/index.js";
import { MAX_MISSION_INTENTS } from "../prompts/index.js";

export const DEFAULT_MISSION_MAX_INTENTS = MAX_MISSION_INTENTS;
export const DEFAULT_MISSION_PER_INTENT_LIMIT = 4;
export const DEFAULT_MISSION_MIN_CONFIDENCE = 0.6;

export interface ResolvedMissionOptions {
  enabled: boolean;
  maxIntents: number;
  perIntentLimit: number;
  minConfidence: number;
}

export function resolveMissionOptions(
  config: MissionsConfig | undefined,
  enableMissions?: boolean,
): ResolvedMissionOptions {
  return {
    enabled: enableMissions ?? config?.enabled === true,
    maxIntents: clampPositiveInt(config?.maxIntents, DEFAULT_MISSION_MAX_INTENTS, MAX_MISSION_INTENTS),
    perIntentLimit: clampPositiveInt(config?.perIntentLimit, DEFAULT_MISSION_PER_INTENT_LIMIT, 20),
    minConfidence: clampConfidence(config?.minConfidence),
  };
}

export function isUsableMission(
  mission: DecomposedShoppingMission | null | undefined,
  minConfidence: number,
): mission is DecomposedShoppingMission {
  if (!mission?.isMission) {
    return false;
  }
  if (mission.confidence < minConfidence) {
    return false;
  }
  return mission.intents.length >= 2;
}

function clampPositiveInt(value: number | undefined, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(1, Math.floor(value)));
}

function clampConfidence(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_MISSION_MIN_CONFIDENCE;
  }
  return Math.min(1, Math.max(0, value));
}
