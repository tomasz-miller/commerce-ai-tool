import { describe, expect, it } from "vitest";
import { DEFAULT_COMMERCE_AI_SEARCH_MESSAGES as messages } from "../messages/index.js";
import {
  formatResultsCount,
  searchAnnouncement,
  type SearchAnnouncementState,
} from "./announcement.js";

const idle: SearchAnnouncementState = {
  isRecording: false,
  isProcessing: false,
  isLoadingTts: false,
  isLoading: false,
  hasError: false,
  resultCount: null,
  showEmptyResults: false,
  noSuggestions: false,
};

describe("formatResultsCount", () => {
  it("replaces every {count} placeholder", () => {
    expect(formatResultsCount("{count} results ({count})", 3)).toBe("3 results (3)");
  });

  it("appends the count when the template has no placeholder", () => {
    expect(formatResultsCount("Ergebnisse", 4)).toBe("Ergebnisse (4)");
  });
});

describe("searchAnnouncement", () => {
  it("is empty when nothing is happening", () => {
    expect(searchAnnouncement(messages, idle)).toBe("");
  });

  it("announces the voice states, most specific first", () => {
    expect(searchAnnouncement(messages, { ...idle, isRecording: true, isLoading: true })).toBe(
      messages.listening,
    );
    expect(searchAnnouncement(messages, { ...idle, isProcessing: true })).toBe(
      messages.understandingQuery,
    );
    expect(searchAnnouncement(messages, { ...idle, isLoadingTts: true, resultCount: 2 })).toBe(
      messages.preparingAudioSummary,
    );
  });

  it("announces searching while a search is in flight", () => {
    expect(searchAnnouncement(messages, { ...idle, isLoading: true, resultCount: 5 })).toBe(
      messages.searching,
    );
  });

  it("stays silent on an error, which has its own alert", () => {
    expect(searchAnnouncement(messages, { ...idle, hasError: true, resultCount: 5 })).toBe("");
  });

  it("announces the result count, the empty state and empty suggestions", () => {
    expect(searchAnnouncement(messages, { ...idle, resultCount: 5 })).toBe("Results: 5");
    expect(searchAnnouncement(messages, { ...idle, showEmptyResults: true })).toBe(
      messages.noProductsFound,
    );
    expect(searchAnnouncement(messages, { ...idle, noSuggestions: true })).toBe(
      messages.noSuggestions,
    );
  });

  it("appends mission lane failures and empty lanes to the count", () => {
    expect(
      searchAnnouncement(messages, { ...idle, resultCount: 3, missionFailedLanes: 1 }),
    ).toBe(`Results: 3. ${messages.missionIntentFailed}`);
    expect(
      searchAnnouncement(messages, { ...idle, resultCount: 3, missionEmptyLanes: 2 }),
    ).toBe(`Results: 3. ${messages.missionIntentEmpty}`);
    expect(
      searchAnnouncement(messages, {
        ...idle,
        resultCount: 0,
        missionFailedLanes: 1,
        missionEmptyLanes: 1,
      }),
    ).toBe(`Results: 0. ${messages.missionIntentFailed}. ${messages.missionIntentEmpty}`);
  });

  it("ignores lane counts of zero and works without the lane messages", () => {
    expect(
      searchAnnouncement(messages, {
        ...idle,
        resultCount: 3,
        missionFailedLanes: 0,
        missionEmptyLanes: 0,
      }),
    ).toBe("Results: 3");
    const { missionIntentFailed: _failed, missionIntentEmpty: _empty, ...withoutLaneMessages } =
      messages;
    expect(
      searchAnnouncement(withoutLaneMessages, { ...idle, resultCount: 3, missionFailedLanes: 1 }),
    ).toBe("Results: 3");
  });

  it("does not announce lane notices while searching or on an error", () => {
    expect(
      searchAnnouncement(messages, { ...idle, isLoading: true, resultCount: 1, missionFailedLanes: 1 }),
    ).toBe(messages.searching);
    expect(
      searchAnnouncement(messages, { ...idle, hasError: true, resultCount: 1, missionFailedLanes: 1 }),
    ).toBe("");
  });

  it("does not double the period of a host message that already ends a sentence", () => {
    const custom = { ...messages, missionIntentFailed: "Search failed.", resultsCount: "{count} found!" };
    expect(
      searchAnnouncement(custom, {
        ...idle,
        resultCount: 2,
        missionFailedLanes: 1,
        missionEmptyLanes: 1,
      }),
    ).toBe(`2 found! Search failed. ${messages.missionIntentEmpty}`);
  });
});
