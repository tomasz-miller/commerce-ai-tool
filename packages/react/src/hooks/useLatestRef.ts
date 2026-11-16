import { useEffect, useRef, type RefObject } from "react";
import {
  resolveCommerceAISearchMessages,
  type CommerceAISearchMessages,
} from "@commerce-ai-tool/core/client";

/**
 * Holds the latest `value` for callbacks that outlive a render (async handlers, timers). It is
 * updated in an effect, never during render, so a discarded or replayed render cannot leak into it.
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** The widget messages with host overrides applied, as a ref that async error handlers read. */
export function useMessagesRef(
  overrides?: Partial<CommerceAISearchMessages>,
): RefObject<CommerceAISearchMessages> {
  return useLatestRef(resolveCommerceAISearchMessages(overrides));
}
