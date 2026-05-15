/**
 * Review Status Calculation Utilities
 *
 * Tag-based status logic for determining review contact status.
 * Replaces workflow-ID-based detection with tag-based detection.
 *
 * Status priority:
 * 1. DND → "DND"
 * 2. Won in Review pipeline → "Clicked"
 * 3. Active workflow tag → "Follow up"
 * 4. Finished workflow tag (no active) → "Finished"
 * 5. None of above → "" (blank/unchanged)
 */

// ─── Constants ───────────────────────────────────────────────────────

export const REVIEW_STATUS_TAGS = {
  reviewReactivationActive: "review_reactivation_active",
  reviewReactivationFinished: "review_reactivation_finished",
  reviewRequestActive: "review_request_active",
  reviewRequestFinished: "review_request_finished",
} as const;

export type ReviewContactStatus = "DND" | "Clicked" | "Follow up" | "Finished" | "";

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Normalize a string for comparison.
 * Converts to lowercase, trims whitespace, and collapses multiple spaces.
 */
export function normalize(value: string): string {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Determine if a contact is DND (Do Not Disturb).
 * Defensive check for various possible field names.
 */
export function isContactDnd(contact: any): boolean {
  if (!contact) return false;

  if (contact.dnd === true) return true;
  if (contact.doNotDisturb === true) return true;

  if (contact.dndSettings && typeof contact.dndSettings === "object") {
    return Object.values(contact.dndSettings).some((value: any) => value === true);
  }

  return false;
}

/**
 * Normalize a single tag value (string or object with name/tag property).
 */
export function normalizeTag(tag: unknown): string {
  if (typeof tag === "string") return normalize(tag);
  if (tag && typeof tag === "object") {
    const value = (tag as any).name ?? (tag as any).tag ?? (tag as any).value ?? "";
    return normalize(value);
  }
  return "";
}

/**
 * Extract and normalize all tags from a contact.
 * Defensive extraction supporting various response shapes.
 */
export function getNormalizedTags(contact: any): string[] {
  const rawTags = contact?.tags ?? [];
  if (!Array.isArray(rawTags)) return [];
  return rawTags.map(normalizeTag).filter(Boolean);
}

/**
 * Check if a normalized tag exists in the tag list.
 * Uses exact normalized equality.
 */
export function hasTag(tags: string[], expectedTag: string): boolean {
  return tags.includes(normalize(expectedTag));
}

/**
 * Check if a normalized tag contains a substring.
 * Use this if tags have prefixes or suffixes.
 */
export function hasTagContaining(tags: string[], expectedTag: string): boolean {
  const expected = normalize(expectedTag);
  return tags.some((tag) => tag.includes(expected));
}

/**
 * Get workflow tag state from contact.
 * Returns whether contact has active and/or finished workflow tags.
 */
export function getWorkflowTagState(contact: any) {
  const tags = getNormalizedTags(contact);

  const hasActiveWorkflowTag =
    hasTag(tags, REVIEW_STATUS_TAGS.reviewReactivationActive) ||
    hasTag(tags, REVIEW_STATUS_TAGS.reviewRequestActive);

  const hasFinishedWorkflowTag =
    hasTag(tags, REVIEW_STATUS_TAGS.reviewReactivationFinished) ||
    hasTag(tags, REVIEW_STATUS_TAGS.reviewRequestFinished);

  return {
    tags,
    hasActiveWorkflowTag,
    hasFinishedWorkflowTag,
  };
}

/**
 * Find the Review pipeline ID from a list of pipelines.
 * Matches pipeline name containing "review" (case-insensitive).
 */
export function findReviewPipelineId(pipelines: any[]): string | null {
  if (!Array.isArray(pipelines)) return null;

  const match = pipelines.find((pipeline) => {
    const name = typeof pipeline.name === "string" ? pipeline.name : "";
    return normalize(name).includes("review");
  });

  return match?.id || match?._id || null;
}

/**
 * Calculate the review contact status based on contact data and won opportunity status.
 *
 * Priority order (corrected):
 * 1. DND → "DND" (always highest priority)
 * 2. Finished workflow tag → "Finished" (overrides everything except DND)
 * 3. Won in Review pipeline → "Clicked"
 * 4. Active workflow tag → "Follow up"
 * 5. None → "" (blank)
 */
export function calculateReviewContactStatus(params: {
  contact: any;
  isWonInReviewPipeline: boolean;
}): ReviewContactStatus {
  const { contact, isWonInReviewPipeline } = params;
  const isDnd = isContactDnd(contact);
  const { hasActiveWorkflowTag, hasFinishedWorkflowTag } = getWorkflowTagState(contact);

  // Priority 1: DND always overrides everything
  if (isDnd) return "DND";

  // Priority 2: Finished tag overrides all other statuses (Clicked, Follow up, Active)
  if (hasFinishedWorkflowTag) return "Finished";

  // Priority 3: Won opportunity (Clicked) overrides active workflow tag
  if (isWonInReviewPipeline) return "Clicked";

  // Priority 4: Active workflow tag
  if (hasActiveWorkflowTag) return "Follow up";

  // Priority 5: No matching conditions
  return "";
}
