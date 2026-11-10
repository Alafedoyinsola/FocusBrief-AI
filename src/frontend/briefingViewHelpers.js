/**
 * FocusBrief AI — Pure Frontend View Helpers
 *
 * This module contains stateless helper functions used by the FocusBrief AI
 * UI Kit dashboard components. Keeping presentation logic, filtering, theme
 * palette resolution, URL safety checks, and recent-activity derivation pure
 * allows deterministic unit testing via Node's built-in test runner without
 * requiring a browser DOM or live Jira/Confluence API calls.
 */

export const JIRA_MAX_RESULTS_LIMIT = 50;
const MS_PER_HOUR = 3600000;
const MS_PER_DAY = 86400000;

/**
 * Normalizes a color mode string to either 'light' or 'dark'.
 *
 * @param {string|null|undefined} mode - Color mode from Forge theme context or user toggle.
 * @returns {'light'|'dark'} Normalized color mode.
 */
export function normalizeColorMode(mode) {
  return mode === 'dark' ? 'dark' : 'light';
}

/**
 * Resolves surface, border, and text token configurations for FocusBrief AI's
 * custom containers based on Jira's host color mode and the user's session toggle.
 *
 * Forge UI Kit does not provide a `data-color-mode` wrapper prop or a global CSS
 * token override, so built-in composite widgets (DynamicTable, Tabs, Modal,
 * SectionMessage, Textfield, Select) always follow Jira's host `--ds-*` tokens.
 *
 * To keep every surface accessible and legible:
 * - When the user's selected mode matches Jira's host mode, standard Atlassian
 *   Design System tokens (`elevation.surface.*`, `color.border`, `color.text`) are used.
 * - When the user overrides the appearance to contrast with Jira's host mode,
 *   custom Box cards receive explicit hex pairs along with `color.text.inverse`,
 *   while built-in composite components remain wrapped inside `hostSurfaceBg`
 *   (`elevation.surface`) so their host-themed text stays readable.
 *
 * @param {string|null|undefined} hostMode - Host Jira color mode from `useTheme()`.
 * @param {string|null|undefined} userOverride - Session-only override ('light'|'dark'|null).
 * @returns {Object} Resolved surface palette and mode metadata.
 */
export function getThemeSurfacePalette(hostMode, userOverride = null) {
  const normalizedHostMode = normalizeColorMode(hostMode);
  const effectiveMode = userOverride ? normalizeColorMode(userOverride) : normalizedHostMode;
  const isCustomOverride = effectiveMode !== normalizedHostMode;

  if (!isCustomOverride) {
    return {
      hostColorMode: normalizedHostMode,
      effectiveColorMode: effectiveMode,
      isCustomOverride: false,
      pageBg: 'elevation.surface.sunken',
      cardBg: 'elevation.surface.raised',
      subtleCardBg: 'elevation.surface',
      hostSurfaceBg: 'elevation.surface',
      borderColor: 'color.border',
      headingColor: 'color.text',
      textColor: 'color.text',
      subduedTextColor: 'color.text.subtle',
      iconColor: 'color.icon',
      buttonAppearance: 'default'
    };
  }

  if (effectiveMode === 'dark') {
    // Host is Light while user toggled custom Dark surfaces.
    // Note: in a Light host, `color.text.inverse` resolves to white (#FFFFFF).
    return {
      hostColorMode: normalizedHostMode,
      effectiveColorMode: 'dark',
      isCustomOverride: true,
      pageBg: { light: '#161A1D', dark: '#161A1D' },
      cardBg: { light: '#1D2125', dark: '#1D2125' },
      subtleCardBg: { light: '#22272B', dark: '#22272B' },
      hostSurfaceBg: 'elevation.surface',
      borderColor: { light: '#38414A', dark: '#38414A' },
      headingColor: 'color.text.inverse',
      textColor: 'color.text.inverse',
      subduedTextColor: 'color.text.inverse',
      iconColor: 'color.icon.inverse',
      buttonAppearance: 'default'
    };
  }

  // Host is Dark while user toggled custom Light surfaces.
  // Note: in a Dark host, `color.text.inverse` resolves to dark slate (#1D2125).
  return {
    hostColorMode: normalizedHostMode,
    effectiveColorMode: 'light',
    isCustomOverride: true,
    pageBg: { light: '#F1F2F4', dark: '#F1F2F4' },
    cardBg: { light: '#FFFFFF', dark: '#FFFFFF' },
    subtleCardBg: { light: '#F7F8F9', dark: '#F7F8F9' },
    hostSurfaceBg: 'elevation.surface',
    borderColor: { light: '#DCDFE4', dark: '#DCDFE4' },
    headingColor: 'color.text.inverse',
    textColor: 'color.text.inverse',
    subduedTextColor: 'color.text.inverse',
    iconColor: 'color.icon.inverse',
    buttonAppearance: 'default'
  };
}

/**
 * Formats a YYYY-MM-DD calendar date string into a readable date label without
 * applying local timezone shifts that could move the calendar day by +/-1 day.
 *
 * @param {string|null|undefined} dateString - Date string formatted as YYYY-MM-DD.
 * @returns {string} Formatted calendar date or fallback text.
 */
export function formatBriefingDate(dateString) {
  if (typeof dateString !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateString.trim())) {
    return 'Today';
  }

  const [yearStr, monthStr, dayStr] = dateString.trim().split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return dateString.trim();
  }

  try {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC'
    }).format(utcDate);
  } catch {
    return dateString.trim();
  }
}

/**
 * Formats an ISO timestamp in the user's configured Jira timezone.
 * Safely falls back to 'UTC' if an invalid timezone identifier is supplied.
 *
 * @param {string|null|undefined} isoString - ISO 8601 date-time string.
 * @param {string} [timeZone='UTC'] - User's IANA timeZone string.
 * @returns {string} Formatted date-time label or 'Unavailable'.
 */
export function formatTimestampInTimeZone(isoString, timeZone = 'UTC') {
  if (typeof isoString !== 'string' || !isoString.trim()) {
    return 'Unavailable';
  }

  const parsedMs = Date.parse(isoString);
  if (Number.isNaN(parsedMs)) {
    return 'Unavailable';
  }

  const dateObj = new Date(parsedMs);
  const formatOptions = {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  };

  try {
    return new Intl.DateTimeFormat('en-US', {
      ...formatOptions,
      timeZone: timeZone || 'UTC'
    }).format(dateObj);
  } catch {
    try {
      return new Intl.DateTimeFormat('en-US', {
        ...formatOptions,
        timeZone: 'UTC'
      }).format(dateObj);
    } catch {
      return dateObj.toISOString();
    }
  }
}

/**
 * Maps deadline classification status to a Forge UI Kit Lozenge appearance.
 *
 * @param {string|null|undefined} deadlineStatus - One of overdue|due_today|approaching|upcoming|none.
 * @returns {'danger'|'warning'|'information'|'neutral'} Lozenge appearance.
 */
export function getDeadlineAppearance(deadlineStatus) {
  switch (deadlineStatus) {
    case 'overdue':
      return 'danger';
    case 'due_today':
      return 'warning';
    case 'approaching':
      return 'information';
    default:
      return 'neutral';
  }
}

/**
 * Maps Jira issue status category metadata to a Forge UI Kit Lozenge appearance.
 *
 * @param {string|null|undefined} statusCategoryKey - Jira category key ('done'|'indeterminate'|'new').
 * @param {string|null|undefined} categoryName - Fallback English category name.
 * @returns {'success'|'information'|'neutral'} Lozenge appearance.
 */
export function getStatusAppearance(statusCategoryKey, categoryName) {
  const key = typeof statusCategoryKey === 'string' ? statusCategoryKey.trim().toLowerCase() : '';
  const name = typeof categoryName === 'string' ? categoryName.trim().toLowerCase() : '';

  if (key === 'done' || (!key && name === 'done')) {
    return 'success';
  }
  if (key === 'indeterminate' || (!key && name === 'in progress')) {
    return 'information';
  }
  return 'neutral';
}

/**
 * Maps a numeric 0-100 priority score to Forge Badge, ProgressBar, and text labels.
 * Note: UI Kit ProgressBar only accepts 'default', 'success', or 'inverse'.
 *
 * @param {number} score - Deterministic 0-100 priority score.
 * @returns {{ badgeAppearance: string, progressAppearance: 'default'|'success'|'inverse', label: string }}
 */
export function getScorePresentation(score) {
  const numericScore = typeof score === 'number' && !Number.isNaN(score) ? score : 0;

  if (numericScore >= 75) {
    return {
      badgeAppearance: 'danger',
      progressAppearance: 'default',
      label: 'Critical focus'
    };
  }
  if (numericScore >= 45) {
    return {
      badgeAppearance: 'important',
      progressAppearance: 'default',
      label: 'High priority'
    };
  }
  return {
    badgeAppearance: 'default',
    progressAppearance: 'default',
    label: 'Standard'
  };
}

/**
 * Checks whether an issue matches the selected Priority Queue filter tab/dropdown.
 *
 * @param {Object} issue - Analyzed Jira issue from getDailyBriefing.
 * @param {string} filterKey - Filter identifier ('all'|'actionable'|'urgent'|'blocked'|'blocking_others').
 * @returns {boolean} True if issue matches filter.
 */
export function matchesIssueFilter(issue, filterKey) {
  if (!issue || typeof issue !== 'object') {
    return false;
  }

  const isBlocked = Boolean(issue.blocker?.isBlocked);
  const blocksOthers = Array.isArray(issue.blocker?.blocksOthersKeys) && issue.blocker.blocksOthersKeys.length > 0;
  const deadlineStatus = issue.deadline?.status || 'none';

  switch (filterKey) {
    case 'actionable':
      return !isBlocked;
    case 'urgent':
      return deadlineStatus === 'overdue' || deadlineStatus === 'due_today' || deadlineStatus === 'approaching';
    case 'blocked':
      return isBlocked;
    case 'blocking_others':
      return blocksOthers;
    case 'all':
    default:
      return true;
  }
}

/**
 * Filters prioritized Jira issues by category filter and case-insensitive search text.
 * Preserves the deterministic backend ordering of matching issues.
 *
 * @param {Object[]} issues - Analyzed issues array from getDailyBriefing.
 * @param {string} [filterKey='all'] - Active category filter key.
 * @param {string} [searchQuery=''] - User search query.
 * @returns {Object[]} Filtered subset in original deterministic order.
 */
export function filterIssues(issues, filterKey = 'all', searchQuery = '') {
  if (!Array.isArray(issues)) {
    return [];
  }

  const normalizedQuery = typeof searchQuery === 'string' ? searchQuery.trim().toLowerCase() : '';

  return issues.filter((issue) => {
    if (!matchesIssueFilter(issue, filterKey)) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const haystackParts = [
      issue.key,
      issue.summary,
      issue.status?.name,
      issue.priority?.name,
      issue.project?.name,
      issue.project?.key,
      ...(Array.isArray(issue.reasons) ? issue.reasons : []),
      ...(Array.isArray(issue.blocker?.blockedByKeys) ? issue.blocker.blockedByKeys : []),
      ...(Array.isArray(issue.blocker?.blocksOthersKeys) ? issue.blocker.blocksOthersKeys : [])
    ];

    return haystackParts.some(
      (part) => typeof part === 'string' && part.toLowerCase().includes(normalizedQuery)
    );
  });
}

/**
 * Derives honest, non-fabricated recent activity signals strictly from fields
 * returned by the existing backend (`issue.updated`, `summary.completedExcludedCount`,
 * `metadata.retrievedAt`, `metadata.analyzedAt`, and `metadata.totalIssues`).
 *
 * Does not invent cross-day deltas or historical score comparisons.
 *
 * @param {Object|null|undefined} briefing - Successful daily briefing payload.
 * @returns {Object} Structured recent-activity data for UI rendering.
 */
export function deriveRecentSignals(briefing) {
  if (!briefing || briefing.success !== true) {
    return {
      referenceTimestamp: null,
      retrievedAt: null,
      updatedLast24HoursCount: 0,
      updatedLast7DaysCount: 0,
      recentlyUpdatedIssues: [],
      completedExcludedCount: 0,
      hasHistoricalComparison: false
    };
  }

  const retrievedAt = briefing.metadata?.retrievedAt || null;
  const analyzedAt = briefing.metadata?.analyzedAt || retrievedAt || null;
  const referenceMs = analyzedAt ? Date.parse(analyzedAt) : Number.NaN;
  const issues = Array.isArray(briefing.issues) ? briefing.issues : [];

  const withValidUpdate = [];
  let updatedLast24HoursCount = 0;
  let updatedLast7DaysCount = 0;

  for (const issue of issues) {
    if (!issue || typeof issue.updated !== 'string' || !issue.updated.trim()) {
      continue;
    }

    const updatedMs = Date.parse(issue.updated);
    if (Number.isNaN(updatedMs)) {
      continue;
    }

    let recencyBucket = 'earlier';
    if (!Number.isNaN(referenceMs)) {
      const ageMs = referenceMs - updatedMs;
      // Allow a small 5-minute clock skew window for freshly updated items
      if (ageMs >= -300000 && ageMs <= 24 * MS_PER_HOUR) {
        updatedLast24HoursCount += 1;
        updatedLast7DaysCount += 1;
        recencyBucket = 'last_24h';
      } else if (ageMs > 24 * MS_PER_HOUR && ageMs <= 7 * MS_PER_DAY) {
        updatedLast7DaysCount += 1;
        recencyBucket = 'last_7d';
      }
    }

    withValidUpdate.push({
      key: issue.key,
      summary: issue.summary,
      statusName: issue.status?.name || 'Unknown',
      statusCategoryKey: issue.status?.statusCategoryKey || null,
      statusCategory: issue.status?.category || null,
      updated: issue.updated,
      recencyBucket,
      _updatedMs: updatedMs
    });
  }

  withValidUpdate.sort((a, b) => {
    if (b._updatedMs !== a._updatedMs) {
      return b._updatedMs - a._updatedMs;
    }
    return String(a.key || '').localeCompare(String(b.key || ''), 'en', { numeric: true });
  });

  const recentlyUpdatedIssues = withValidUpdate
    .slice(0, 8)
    .map(({ _updatedMs, ...cleanItem }) => cleanItem);

  return {
    referenceTimestamp: analyzedAt,
    retrievedAt,
    updatedLast24HoursCount,
    updatedLast7DaysCount,
    recentlyUpdatedIssues,
    completedExcludedCount:
      typeof briefing.summary?.completedExcludedCount === 'number'
        ? briefing.summary.completedExcludedCount
        : 0,
    hasHistoricalComparison: false
  };
}

/**
 * Computes transparent disclosure details when Jira's backend retrieval limit (50 issues)
 * or Done-status exclusion affects the displayed task list.
 *
 * @param {Object|null|undefined} briefing - Successful daily briefing payload.
 * @returns {{ isTruncated: boolean, totalIssues: number, displayedCount: number, completedExcludedCount: number, message: string|null }}
 */
export function getTruncationDisclosure(briefing) {
  if (!briefing || briefing.success !== true) {
    return {
      isTruncated: false,
      totalIssues: 0,
      displayedCount: 0,
      completedExcludedCount: 0,
      message: null
    };
  }

  const issues = Array.isArray(briefing.issues) ? briefing.issues : [];
  const displayedCount = issues.length;
  const completedExcludedCount =
    typeof briefing.summary?.completedExcludedCount === 'number'
      ? briefing.summary.completedExcludedCount
      : 0;
  const rawTotal =
    typeof briefing.metadata?.totalIssues === 'number'
      ? briefing.metadata.totalIssues
      : displayedCount + completedExcludedCount;

  // Detect when Jira's 50-issue page limit potentially truncated the user's queue
  // (either totalIssues exceeds fetchedCount, or Jira returned a full 50-issue page).
  const fetchedCount = displayedCount + completedExcludedCount;
  const hasKnownRemaining = rawTotal > fetchedCount;
  const hitPageLimit = fetchedCount >= JIRA_MAX_RESULTS_LIMIT;

  if (!hasKnownRemaining && !hitPageLimit) {
    return {
      isTruncated: false,
      totalIssues: rawTotal,
      displayedCount,
      completedExcludedCount,
      message: null
    };
  }

  const message = hasKnownRemaining
    ? `Showing ${displayedCount} active tasks from the first ${JIRA_MAX_RESULTS_LIMIT} unresolved Jira issues retrieved (out of ${rawTotal} matching your assignment query).`
    : `Retrieved Jira's maximum page of ${JIRA_MAX_RESULTS_LIMIT} unresolved issues (${displayedCount} active shown${completedExcludedCount > 0 ? `, ${completedExcludedCount} Done excluded` : ''}). Additional assigned issues beyond ${JIRA_MAX_RESULTS_LIMIT} are not analyzed in this briefing.`;

  return {
    isTruncated: true,
    totalIssues: rawTotal,
    displayedCount,
    completedExcludedCount,
    message
  };
}

/**
 * Clamps a requested DynamicTable page number to the valid 1-based page range
 * `[1, totalPages]` so refreshing data or filtering cannot strand the table on
 * an empty out-of-range page.
 *
 * @param {number} requestedPage - Desired 1-based page number.
 * @param {number} totalItems - Number of currently filtered rows.
 * @param {number} [rowsPerPage=10] - Configured rows per page.
 * @returns {number} Safe 1-based page index.
 */
export function clampTablePage(requestedPage, totalItems, rowsPerPage = 10) {
  const safePerPage =
    typeof rowsPerPage === 'number' && Number.isFinite(rowsPerPage) && rowsPerPage > 0
      ? Math.floor(rowsPerPage)
      : 10;
  const safeTotal =
    typeof totalItems === 'number' && Number.isFinite(totalItems) && totalItems > 0
      ? Math.floor(totalItems)
      : 0;
  const totalPages = Math.max(1, Math.ceil(safeTotal / safePerPage));
  const numericPage =
    typeof requestedPage === 'number' && Number.isFinite(requestedPage)
      ? Math.floor(requestedPage)
      : 1;

  return Math.min(Math.max(1, numericPage), totalPages);
}

/**
 * Combines backend alert buckets (`overdue`, `dueToday`, `blocked`, `approaching`)
 * into a flat ordered list with distinct semantic Lozenge appearances for Overview.
 *
 * @param {Object|null|undefined} alerts - `briefing.alerts` object from backend.
 * @param {number} [maxItems=8] - Maximum alert rows to display in Overview.
 * @returns {Object[]} Categorized alert items ready for rendering.
 */
export function buildUrgentAlertItems(alerts, maxItems = 8) {
  const safeAlerts = alerts && typeof alerts === 'object' ? alerts : {};
  const overdueAlerts = Array.isArray(safeAlerts.overdue) ? safeAlerts.overdue : [];
  const dueTodayAlerts = Array.isArray(safeAlerts.dueToday) ? safeAlerts.dueToday : [];
  const blockedAlerts = Array.isArray(safeAlerts.blocked) ? safeAlerts.blocked : [];
  const approachingAlerts = Array.isArray(safeAlerts.approaching) ? safeAlerts.approaching : [];

  const combined = [
    ...overdueAlerts.map((item) => ({
      ...item,
      categoryLabel: 'Overdue',
      appearance: 'danger'
    })),
    ...dueTodayAlerts.map((item) => ({
      ...item,
      categoryLabel: 'Due Today',
      appearance: 'warning'
    })),
    ...blockedAlerts.map((item) => ({
      ...item,
      categoryLabel: 'Blocked',
      appearance: 'removed'
    })),
    ...approachingAlerts.map((item) => ({
      ...item,
      categoryLabel: 'Approaching',
      appearance: 'information'
    }))
  ];

  const limit = typeof maxItems === 'number' && maxItems > 0 ? Math.floor(maxItems) : 8;
  return combined.slice(0, limit);
}

/**
 * Normalizes the Confluence `knowledge` payload across all 7 backend states
 * (`ok`, `empty`, `skipped`, `unauthorized`, `unavailable`, `rate_limited`, `error`)
 * as well as unexpected missing objects.
 *
 * @param {Object|null|undefined} knowledge - `briefing.knowledge` object from backend.
 * @returns {Object} Normalized UI presentation configuration.
 */
export function getKnowledgeStatusConfig(knowledge) {
  const status = typeof knowledge?.status === 'string' ? knowledge.status : 'unavailable';
  const documents = Array.isArray(knowledge?.documents) ? knowledge.documents : [];
  const queryTermsUsed = Array.isArray(knowledge?.metadata?.queryTermsUsed)
    ? knowledge.metadata.queryTermsUsed
    : [];
  const totalFound = typeof knowledge?.metadata?.totalFound === 'number' ? knowledge.metadata.totalFound : 0;
  const returnedCount =
    typeof knowledge?.metadata?.returnedCount === 'number'
      ? knowledge.metadata.returnedCount
      : documents.length;

  switch (status) {
    case 'ok':
      if (documents.length > 0) {
        return {
          status: 'ok',
          hasDocuments: true,
          alertAppearance: 'information',
          alertTitle: 'Relevant Confluence Documentation',
          message: null,
          documents,
          queryTermsUsed,
          totalFound,
          returnedCount
        };
      }
      return {
        status: 'empty',
        hasDocuments: false,
        alertAppearance: 'information',
        alertTitle: 'No matching Confluence pages found',
        message: 'No matching Confluence documentation was found for your active tasks.',
        documents: [],
        queryTermsUsed,
        totalFound: 0,
        returnedCount: 0
      };
    case 'unauthorized':
      return {
        status: 'unauthorized',
        hasDocuments: false,
        alertAppearance: 'warning',
        alertTitle: 'Confluence authorization required',
        message:
          knowledge?.message || 'You do not have permission to search Confluence documentation.',
        documents: [],
        queryTermsUsed,
        totalFound: 0,
        returnedCount: 0
      };
    case 'rate_limited':
      return {
        status: 'rate_limited',
        hasDocuments: false,
        alertAppearance: 'warning',
        alertTitle: 'Confluence search temporarily rate-limited',
        message:
          knowledge?.message ||
          'Confluence search is temporarily rate-limited. Your Jira briefing remains unaffected — try refreshing shortly.',
        documents: [],
        queryTermsUsed,
        totalFound: 0,
        returnedCount: 0
      };
    case 'unavailable':
      return {
        status: 'unavailable',
        hasDocuments: false,
        alertAppearance: 'information',
        alertTitle: 'Confluence integration unavailable',
        message:
          knowledge?.message ||
          'Confluence documentation is unavailable in the current installation context.',
        documents: [],
        queryTermsUsed,
        totalFound: 0,
        returnedCount: 0
      };
    case 'skipped':
      return {
        status: 'skipped',
        hasDocuments: false,
        alertAppearance: 'information',
        alertTitle: 'Confluence search skipped',
        message:
          knowledge?.message || 'No active Jira task keywords were available for Confluence search.',
        documents: [],
        queryTermsUsed,
        totalFound: 0,
        returnedCount: 0
      };
    case 'empty':
      return {
        status: 'empty',
        hasDocuments: false,
        alertAppearance: 'information',
        alertTitle: 'No matching Confluence pages found',
        message:
          knowledge?.message ||
          'No matching Confluence documentation was found for your active tasks.',
        documents: [],
        queryTermsUsed,
        totalFound: 0,
        returnedCount: 0
      };
    case 'error':
    default:
      return {
        status: 'error',
        hasDocuments: false,
        alertAppearance: 'error',
        alertTitle: 'Confluence documentation unavailable',
        message:
          knowledge?.message || 'Unable to retrieve Confluence documentation right now.',
        documents: [],
        queryTermsUsed,
        totalFound: 0,
        returnedCount: 0
      };
  }
}

/**
 * Validates that an image URL is a safe HTTPS URL before passing it to `<Image src>`.
 *
 * @param {string|null|undefined} url - Candidate image URL.
 * @returns {boolean} True when URL begins with `https://`.
 */
export function isSafeHttpsUrl(url) {
  return typeof url === 'string' && /^https:\/\/\S+/i.test(url.trim());
}

/**
 * Validates that a Confluence page URL is either a safe HTTPS URL or a safe relative
 * `/wiki/...` path (preventing scheme injection or protocol-relative `//` redirects).
 *
 * @param {Object|null|undefined} doc - Normalized Confluence document.
 * @returns {string|null} Safe navigation target or null if invalid.
 */
export function getSafeConfluenceTarget(doc) {
  const candidates = [doc?.url, doc?.webUrlPath];
  for (const raw of candidates) {
    if (typeof raw !== 'string') {
      continue;
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      continue;
    }
    if (/^https:\/\/\S+/i.test(trimmed)) {
      return trimmed;
    }
    if (/^\/(?!\/)\S*/.test(trimmed)) {
      return trimmed;
    }
  }
  return null;
}

/**
 * Opens a Jira issue natively via Forge's `router.open()` bridge API.
 *
 * @param {string} issueKey - Jira issue key (e.g., "FB-12").
 * @param {{ open: Function }} routerApi - Forge `@forge/bridge` router object.
 * @returns {Promise<boolean>} True if navigation was initiated, false if invalid/failed.
 */
export async function openJiraIssueWithRouter(issueKey, routerApi) {
  const trimmedKey = typeof issueKey === 'string' ? issueKey.trim() : '';
  if (!trimmedKey || !routerApi || typeof routerApi.open !== 'function') {
    return false;
  }

  try {
    await routerApi.open({
      target: 'issue',
      issueKey: trimmedKey
    });
    return true;
  } catch (err) {
    console.error(`Failed to navigate to Jira issue ${trimmedKey}:`, err);
    return false;
  }
}

/**
 * Opens a validated Confluence document URL via Forge's `router.open()` bridge API.
 *
 * @param {Object} doc - Normalized Confluence document.
 * @param {{ open: Function }} routerApi - Forge `@forge/bridge` router object.
 * @returns {Promise<boolean>} True if navigation was initiated, false if unsafe/failed.
 */
export async function openConfluenceDocWithRouter(doc, routerApi) {
  const safeTarget = getSafeConfluenceTarget(doc);
  if (!safeTarget || !routerApi || typeof routerApi.open !== 'function') {
    return false;
  }

  try {
    await routerApi.open(safeTarget);
    return true;
  } catch (err) {
    console.error('Failed to navigate to Confluence page:', err);
    return false;
  }
}

/**
 * Looks up an analyzed issue by key from the active briefing issues list.
 *
 * @param {Object[]} issues - Active analyzed issues array.
 * @param {string|null|undefined} issueKey - Target issue key.
 * @returns {Object|null} Matching issue object or null.
 */
export function findIssueByKey(issues, issueKey) {
  if (!Array.isArray(issues) || typeof issueKey !== 'string' || !issueKey.trim()) {
    return null;
  }
  const target = issueKey.trim().toLowerCase();
  return issues.find((item) => typeof item?.key === 'string' && item.key.toLowerCase() === target) || null;
}
