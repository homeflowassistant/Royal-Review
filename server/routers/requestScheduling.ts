import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc.js";
import { getLocationCustomValueMap, upsertGhlCustomValue } from "../ghl-service.js";

const TIMING_LABEL_TO_INDEX: Record<string, 0 | 1 | 2 | 3> = {
  "within_24h": 0,
  "within 24 hours": 0,
  "24h": 1,
  "24 hours": 1,
  "48h": 2,
  "48 hours": 2,
  "1week": 3,
  "1 week": 3,
};

const REVERSE_TIMING_MAP: Record<string, 0 | 1 | 2 | 3> = {
  within_24h: 0,
  "24h": 1,
  "48h": 2,
  "1week": 3,
};

const REQUEST_SCHEDULING_LABELS = ["Within 24 Hours", "24 Hours", "48 Hours", "1 Week"] as const;
const FOLLOW_UP_LIMITS = ["0", "1", "2", "3"] as const;

export const requestSchedulingRouter = router({
  getSettings: publicProcedure
    .input(
      z.object({
        locationId: z.string().min(1),
      })
    )
    .query(async ({ input }) => {
      const locationId = input.locationId.trim();
      const customValueMap = await getLocationCustomValueMap(locationId);

      const getCustomValue = (key: string) => {
        for (const [apiKey, entry] of customValueMap.entries()) {
          if (apiKey.toLowerCase() === key.toLowerCase() || apiKey.toLowerCase() === `location.${key.toLowerCase()}`) {
            return entry.value;
          }
        }
        return "";
      };

      const initialRequestScheduling = getCustomValue("initial_request_scheduling");
      const followUpLimit = getCustomValue("follow_up_limit");

      return {
        initialTiming: TIMING_LABEL_TO_INDEX[initialRequestScheduling.toLowerCase().trim()] ?? REVERSE_TIMING_MAP[initialRequestScheduling] ?? 0,
        followUpCount: FOLLOW_UP_LIMITS.includes(followUpLimit as (typeof FOLLOW_UP_LIMITS)[number])
          ? Number.parseInt(followUpLimit, 10)
          : 3,
      };
    }),

  /**
   * Save custom values to GHL location.
   * Maps UI slider values to GHL custom value names and values.
   * initialTiming: 0-3 → "Within 24 Hours", "24 Hours", "48 Hours", "1 Week"
   * followUpCount: 0-3 → "0", "1", "2", "3"
   */
  saveCustomValuesSettings: publicProcedure
    .input(
      z.object({
        locationId: z.string().min(1, "Location ID is required"),
        initialRequestScheduling: z.enum(REQUEST_SCHEDULING_LABELS),
        followUpLimit: z.enum(FOLLOW_UP_LIMITS),
      })
    )
    .mutation(async ({ input }) => {
      try {
        // Validate inputs are properly formatted
        const locationId = input.locationId.trim();
        if (!locationId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Location ID cannot be empty",
          });
        }
        // Upsert both custom values at location level
        const [initialResults, followUpResults] = await Promise.all([
          upsertGhlCustomValue(locationId, "initial_request_scheduling", input.initialRequestScheduling),
          upsertGhlCustomValue(locationId, "follow_up_limit", input.followUpLimit),
        ]);

        return {
          success: true,
          saved: {
            initial_request_scheduling: initialResults.value,
            follow_up_limit: followUpResults.value,
          },
          results: {
            initial_request_scheduling: {
              action: "created_or_updated",
              id: initialResults.id,
            },
            follow_up_limit: {
              action: "created_or_updated",
              id: followUpResults.id,
            },
          },
        };
      } catch (error) {
        // Handle GHL API errors
        if (error instanceof TRPCError) {
          throw error;
        }

        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        // Provide actionable error messages
        if (errorMessage.includes("401") || errorMessage.includes("Unauthorized") || errorMessage.includes("token")) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "GHL authentication failed. Your access token may be missing, expired, or lack the required custom values scopes.",
          });
        }

        if (errorMessage.includes("400") || errorMessage.includes("Bad Request")) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Failed to save custom values: ${errorMessage}`,
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to save custom values. Please try again.",
        });
      }
    }),
});
