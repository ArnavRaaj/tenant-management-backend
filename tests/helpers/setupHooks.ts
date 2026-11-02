import { beforeEach } from "vitest";
import { clearMemoryCache } from "../../src/core/cache/cache";
import { resetRateLimiters } from "../../src/core/middleware/rateLimit";

// Loaded after setupEnv.ts, so application config sees the test environment.
beforeEach(() => {
  resetRateLimiters();
  clearMemoryCache();
});
