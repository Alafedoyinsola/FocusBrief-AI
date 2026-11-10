/**
 * FocusBrief AI — Deterministic Briefing & Prioritization Engine
 *
 * This module contains pure JavaScript business rules for analyzing normalized Jira
 * issues without relying on paid AI services or external APIs.
 *
 * Responsibilities:
 * 1. Timezone-safe calendar date parsing and deadline classification.
 * 2. Directional dependency inspection and status-based blocker detection.
 * 3. Explainable 0–100 priority scoring with stable deterministic sorting.
 * 4. Summary metrics, urgent alerts, and up to 3 actionable recommendations.
 */

const MS_PER_DAY = 86400000;
const APPROACHING_WINDOW_DAYS = 3;
const MAX_RECOMMENDED_ACTIONS = 3;

/**
 * Priority weights mapped from standard Jira priority names (lowercased).
 * Every active task receives a baseline priority score so unscheduled tasks
 * still rank predictably and receive clear score explanations.
 */
const PRIORITY_CONFIG = {
  highest: { weight: 35, rank: 5, label: 'Highest' },
  blocker: { weight: 35, rank: 5, label: 'Blocker' },
  critical: { weight: 35, rank: 5, label: 'Critical' },
  high: { weight: 25, rank: 4, label: 'High' },
  medium: { weight: 15, rank: 3, label: 'Medium' },
  low: { weight: 8, rank: 2, label: 'Low' },
  lowest: { weight: 4, rank: 1, label: 'Lowest' }
};

const DEFAULT_PRIORITY = { weight: 15, rank: 3, label: 'Medium' };

/**
 * Status names treated as resolved when Jira statusCategory metadata is absent.
 */
const RESOLVED_STATUS_NAMES = new Set([
  'done',
  'closed',
  'resolved',
  'completed',
  'cancelled',
  'canceled',
  "won't do",
  'wont do',
  'fixed'
]);

/**
 * Link relation patterns evaluated from the perspective of the current issue.
 * - PASSIVE: This issue is waiting on / blocked by another issue.
 * - ACTIVE: This issue is blocking / holding up another issue.
 */
const PASSIVE_BLOCKED_LINK_PATTERN = /\b(is blocked by|blocked by|depends on|is waiting on|waiting on)\b/i;
const ACTIVE_BLOCKING_LINK_PATTERN = /\b(blocks|is depended on by)\b/i;

/**
 * Explicit blocked workflow status patterns. Avoids matching normal workflow
 * stages (e.g., "In Review", "Ready for QA", or "To Do").
 */
const STATUS_BLOCKER_PATTERN = /\b(blocked|on hold|impeded)\b/i;

/**
 * Parses and strictly validates a YYYY-MM-DD calendar date string.
 * Rejects impossible calendar dates such as "2026-02-30" or "2026-13-01".
 *
 * @param {string|null|undefined} dateStr - Date string to validate.
 * @returns {{ year: number, month: number, day: number, dateString: string, epochDay: number }|null}
 */
export function parseCalendarDate(dateStr) {
  if (typeof dateStr !== 'string') {
    return null;
  }

  const trimmed = dateStr.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // Verify UTC calendar round-trip to reject overflow dates like 2026-02-30 -> March 2
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return null;
  }

  return {
    year,
    month,
    day,
    dateString: trimmed,
    epochDay: Math.floor(utcDate.getTime() / MS_PER_DAY)
  };
}

/**
 * Formats a JavaScript Date into a YYYY-MM-DD calendar string in the specified IANA timezone.
 * Falls back safely to 'UTC' if the provided timezone is missing or unrecognized.
 *
 * @param {string} [timeZone='UTC'] - User's IANA timezone from Jira profile (e.g., "America/New_York").
 * @param {Date} [referenceDate=new Date()] - Reference moment (injectable for deterministic testing).
 * @returns {{ dateString: string, timeZone: string }} Resolved calendar date and effective timezone.
 */
export function getUserLocalDateInfo(timeZone = 'UTC', referenceDate = new Date()) {
  const validDate =
    referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime())
      ? referenceDate
      : new Date();

  let effectiveTimeZone = typeof timeZone === 'string' && timeZone.trim() ? timeZone.trim() : 'UTC';
  let formatter;

  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: effectiveTimeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  } catch {
    effectiveTimeZone = 'UTC';
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  const parts = formatter.formatToParts(validDate);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return {
    dateString: `${year}-${month}-${day}`,
    timeZone: effectiveTimeZone
  };
}

/**
 * Formats a day count with singular or plural phrasing.
 *
 * @param {number} count - Number of days.
 * @returns {string} Formatted phrase (e.g., "1 day", "3 days").
 */
function formatDays(count) {
  return count === 1 ? '1 day' : `${count} days`;
}

/**
 * Evaluates a Jira date-only due date against the user's current local calendar date.
 *
 * @param {string|null|undefined} dueDate - Jira duedate (YYYY-MM-DD).
 * @param {string} todayDateString - User's current calendar date (YYYY-MM-DD).
 * @returns {Object} Deadline classification, day delta, and human-readable label.
 */
export function analyzeDeadline(dueDate, todayDateString) {
  const normalizedDueInput = typeof dueDate === 'string' ? dueDate.trim() : dueDate;
  const hasProvidedDueDate =
    normalizedDueInput !== null && normalizedDueInput !== undefined && normalizedDueInput !== '';
  const todayParsed = parseCalendarDate(todayDateString);
  const dueParsed = parseCalendarDate(normalizedDueInput);

  if (!todayParsed || !dueParsed) {
    const isInvalid = Boolean(hasProvidedDueDate && !dueParsed);
    return {
      status: 'none',
      dueDate: null,
      daysUntilDue: null,
      daysOverdue: 0,
      hasInvalidDate: isInvalid,
      label: isInvalid ? 'Invalid due date' : 'No due date set'
    };
  }

  const daysUntilDue = dueParsed.epochDay - todayParsed.epochDay;

  if (daysUntilDue < 0) {
    const daysOverdue = Math.abs(daysUntilDue);
    return {
      status: 'overdue',
      dueDate: dueParsed.dateString,
      daysUntilDue,
      daysOverdue,
      hasInvalidDate: false,
      label: `Overdue by ${formatDays(daysOverdue)}`
    };
  }

  if (daysUntilDue === 0) {
    return {
      status: 'due_today',
      dueDate: dueParsed.dateString,
      daysUntilDue: 0,
      daysOverdue: 0,
      hasInvalidDate: false,
      label: 'Due today'
    };
  }

  if (daysUntilDue <= APPROACHING_WINDOW_DAYS) {
    return {
      status: 'approaching',
      dueDate: dueParsed.dateString,
      daysUntilDue,
      daysOverdue: 0,
      hasInvalidDate: false,
      label: `Due in ${formatDays(daysUntilDue)}`
    };
  }

  return {
    status: 'upcoming',
    dueDate: dueParsed.dateString,
    daysUntilDue,
    daysOverdue: 0,
    hasInvalidDate: false,
    label: `Due on ${dueParsed.dateString}`
  };
}

/**
 * Determines whether a normalized Jira issue is already completed.
 * Prefers Jira's language-invariant statusCategoryKey ('done'), falling back to
 * English status category names and known resolved status names.
 * Completed issues must never be flagged as blocked or recommended as actions.
 *
 * @param {Object} issue - Normalized Jira issue.
 * @returns {boolean} True if completed.
 */
export function isIssueCompleted(issue) {
  const statusCategoryKey = issue?.status?.statusCategoryKey;
  if (typeof statusCategoryKey === 'string' && statusCategoryKey.trim() !== '') {
    return statusCategoryKey.trim().toLowerCase() === 'done';
  }

  const category = issue?.status?.category;
  if (typeof category === 'string' && category.trim() !== '') {
    const normalizedCategory = category.trim().toLowerCase();
    if (normalizedCategory === 'done') {
      return true;
    }
    if (normalizedCategory === 'to do' || normalizedCategory === 'in progress') {
      return false;
    }
  }

  const statusName = issue?.status?.name;
  if (typeof statusName === 'string' && statusName.trim() !== '') {
    return RESOLVED_STATUS_NAMES.has(statusName.trim().toLowerCase());
  }

  return false;
}

/**
 * Determines whether a linked Jira issue is resolved/completed.
 * Uses stable statusCategoryKey when present and falls back to category/status names.
 *
 * @param {Object|null|undefined} linkedIssue - Inward or outward linked issue summary.
 * @returns {boolean} True if the linked dependency is already resolved.
 */
export function isLinkedIssueResolved(linkedIssue) {
  if (!linkedIssue) {
    return false;
  }

  if (typeof linkedIssue.statusCategoryKey === 'string' && linkedIssue.statusCategoryKey.trim() !== '') {
    return linkedIssue.statusCategoryKey.trim().toLowerCase() === 'done';
  }

  if (typeof linkedIssue.statusCategory === 'string' && linkedIssue.statusCategory.trim() !== '') {
    const normalizedCategory = linkedIssue.statusCategory.trim().toLowerCase();
    if (normalizedCategory === 'done') {
      return true;
    }
    if (normalizedCategory === 'to do' || normalizedCategory === 'in progress') {
      return false;
    }
  }

  if (typeof linkedIssue.status === 'string' && linkedIssue.status.trim() !== '') {
    return RESOLVED_STATUS_NAMES.has(linkedIssue.status.trim().toLowerCase());
  }

  return false;
}

/**
 * Detects whether an issue is blocked using directional issueLinks and explicit status names.
 * Never inspects free-text issue summaries, preventing false positives on unrelated tasks.
 * Also distinguishes tasks blocked by others from tasks blocking other work.
 *
 * @param {Object} issue - Normalized Jira issue.
 * @returns {Object} Blocker analysis including blockedBy, blocksOthers, and reasons.
 */
export function analyzeBlockers(issue) {
  if (isIssueCompleted(issue)) {
    return {
      isBlocked: false,
      statusBlocked: false,
      blockedBy: [],
      blockedByKeys: [],
      blocksOthers: [],
      blocksOthersKeys: [],
      reasons: []
    };
  }

  const links = Array.isArray(issue?.issueLinks) ? issue.issueLinks : [];
  const blockedByMap = new Map();
  const blocksOthersMap = new Map();

  for (const link of links) {
    if (!link) {
      continue;
    }

    // Determine which side of the link is populated and read the relation from THIS issue's viewpoint
    let targetIssue = null;
    let relationText = '';

    if (link.inwardIssue) {
      targetIssue = link.inwardIssue;
      relationText = link.type?.inward || '';
    } else if (link.outwardIssue) {
      targetIssue = link.outwardIssue;
      relationText = link.type?.outward || '';
    } else {
      continue;
    }

    // Ignore resolved dependencies so completed blockers do not trigger false alarms
    if (isLinkedIssueResolved(targetIssue)) {
      continue;
    }

    const targetKey = targetIssue.key || targetIssue.id;
    if (!targetKey) {
      continue;
    }

    if (PASSIVE_BLOCKED_LINK_PATTERN.test(relationText)) {
      if (!blockedByMap.has(targetKey)) {
        blockedByMap.set(targetKey, {
          key: targetKey,
          summary: targetIssue.summary || '',
          status: targetIssue.status || 'Unknown',
          relation: relationText
        });
      }
    } else if (ACTIVE_BLOCKING_LINK_PATTERN.test(relationText)) {
      if (!blocksOthersMap.has(targetKey)) {
        blocksOthersMap.set(targetKey, {
          key: targetKey,
          summary: targetIssue.summary || '',
          status: targetIssue.status || 'Unknown',
          relation: relationText
        });
      }
    }
  }

  const statusName = typeof issue?.status?.name === 'string' ? issue.status.name.trim() : '';
  const statusBlocked = STATUS_BLOCKER_PATTERN.test(statusName);

  const blockedBy = Array.from(blockedByMap.values());
  const blockedByKeys = blockedBy.map((item) => item.key);
  const blocksOthers = Array.from(blocksOthersMap.values());
  const blocksOthersKeys = blocksOthers.map((item) => item.key);

  const reasons = [];
  if (blockedByKeys.length > 0) {
    reasons.push(`Blocked by ${blockedByKeys.join(', ')}`);
  }
  if (statusBlocked) {
    reasons.push(`Status is '${statusName}'`);
  }

  return {
    isBlocked: blockedBy.length > 0 || statusBlocked,
    statusBlocked,
    blockedBy,
    blockedByKeys,
    blocksOthers,
    blocksOthersKeys,
    reasons
  };
}

/**
 * Resolves priority metadata and numeric weight for a Jira priority name.
 *
 * @param {string|undefined} priorityName - Priority name from Jira issue.
 * @returns {{ weight: number, rank: number, label: string }}
 */
function getPriorityMetadata(priorityName) {
  if (typeof priorityName !== 'string' || !priorityName.trim()) {
    return DEFAULT_PRIORITY;
  }

  const normalized = priorityName.trim().toLowerCase();
  return PRIORITY_CONFIG[normalized] || {
    weight: DEFAULT_PRIORITY.weight,
    rank: DEFAULT_PRIORITY.rank,
    label: priorityName.trim()
  };
}

/**
 * Calculates a deterministic, explainable priority score in the range [0, 100].
 *
 * Scoring factors:
 * - Jira Priority: +4 to +35 points
 * - Deadline Urgency: +45 (overdue), +38 (due today), +25 (approaching), +8 (upcoming), +0 (none)
 * - Blocking Other Active Work: +15 points (high leverage to unblock teammates)
 * - In Progress Momentum: +5 points
 * - Currently Blocked Penalty: -25 points
 *
 * @param {Object} issue - Normalized Jira issue.
 * @param {Object} deadlineInfo - Result from analyzeDeadline().
 * @param {Object} blockerInfo - Result from analyzeBlockers().
 * @returns {{ score: number, priorityRank: number, reasons: string[] }}
 */
export function scoreIssue(issue, deadlineInfo, blockerInfo) {
  if (isIssueCompleted(issue)) {
    return {
      score: 0,
      priorityRank: 0,
      reasons: ['Task is already completed']
    };
  }

  const reasons = [];
  let rawScore = 0;

  // 1. Jira Priority
  const priorityMeta = getPriorityMetadata(issue?.priority?.name);
  rawScore += priorityMeta.weight;
  reasons.push(`Priority is ${priorityMeta.label}`);

  // 2. Deadline Urgency
  switch (deadlineInfo.status) {
    case 'overdue':
      rawScore += 45;
      reasons.push(deadlineInfo.label);
      break;
    case 'due_today':
      rawScore += 38;
      reasons.push('Due today');
      break;
    case 'approaching':
      rawScore += 25;
      reasons.push(deadlineInfo.label);
      break;
    case 'upcoming':
      rawScore += 8;
      reasons.push(deadlineInfo.label);
      break;
    default:
      reasons.push(deadlineInfo.label);
      break;
  }

  // 3. High-leverage unblocking signal (this task blocks other unresolved work)
  if (blockerInfo.blocksOthersKeys.length > 0) {
    rawScore += 15;
    const countLabel =
      blockerInfo.blocksOthersKeys.length === 1 ? '1 active task' : `${blockerInfo.blocksOthersKeys.length} active tasks`;
    reasons.push(`Blocks ${countLabel} (${blockerInfo.blocksOthersKeys.join(', ')})`);
  }

  // 4. Work-in-progress momentum (prefer stable statusCategoryKey, fallback to category name)
  const statusCategoryKey =
    typeof issue?.status?.statusCategoryKey === 'string' ? issue.status.statusCategoryKey.trim().toLowerCase() : '';
  const statusCategory =
    typeof issue?.status?.category === 'string' ? issue.status.category.trim().toLowerCase() : '';
  if (statusCategoryKey === 'indeterminate' || (!statusCategoryKey && statusCategory === 'in progress')) {
    rawScore += 5;
    reasons.push('Currently in progress');
  }

  // 5. Blocked penalty and explanation
  if (blockerInfo.isBlocked) {
    rawScore -= 25;
    for (const blockerReason of blockerInfo.reasons) {
      reasons.push(blockerReason);
    }
  }

  const score = Math.max(0, Math.min(100, rawScore));

  return {
    score,
    priorityRank: priorityMeta.rank,
    reasons
  };
}

/**
 * Stable deterministic comparator for sorting analyzed active issues.
 * Order:
 * 1. Highest priority score
 * 2. Unblocked tasks before blocked tasks
 * 3. Earliest deadline (issues with a due date before those without)
 * 4. Highest Jira priority rank
 * 5. Natural issue key ascending (e.g., PROJ-2 before PROJ-10)
 * 6. Original array index fallback
 *
 * @param {Object} a - Analyzed issue item.
 * @param {Object} b - Analyzed issue item.
 * @returns {number} Sort comparison result.
 */
function compareAnalyzedIssues(a, b) {
  if (b.score !== a.score) {
    return b.score - a.score;
  }

  if (a.blocker.isBlocked !== b.blocker.isBlocked) {
    return a.blocker.isBlocked ? 1 : -1;
  }

  const aDue = a.deadline.daysUntilDue;
  const bDue = b.deadline.daysUntilDue;
  if (aDue !== null && bDue !== null && aDue !== bDue) {
    return aDue - bDue;
  }
  if (aDue !== null && bDue === null) {
    return -1;
  }
  if (aDue === null && bDue !== null) {
    return 1;
  }

  if (b.priorityRank !== a.priorityRank) {
    return b.priorityRank - a.priorityRank;
  }

  const keyA = String(a.key || '');
  const keyB = String(b.key || '');
  const keyCompare = keyA.localeCompare(keyB, 'en', { numeric: true, sensitivity: 'base' });
  if (keyCompare !== 0) {
    return keyCompare;
  }

  return a._originalIndex - b._originalIndex;
}

/**
 * Generates up to 3 recommended next actions using the Actionable-First policy:
 *
 * Policy:
 * 1. Actionable (unblocked) tasks are recommended first as 'focus' actions, ordered by
 *    their deterministic priority score (even if a blocked task has a higher urgency score),
 *    because unblocked work can be progressed immediately by the assignee.
 * 2. Blocked tasks are only surfaced as 'unblock' actions if fewer than 3 unblocked tasks
 *    exist, ordered by score descending, so the user knows which blocker to follow up on.
 * 3. Completed tasks are strictly excluded and never recommended.
 *
 * @param {Object[]} sortedActiveIssues - Sorted list of analyzed non-completed issues.
 * @returns {Object[]} Up to 3 recommended action objects.
 */
function generateRecommendedActions(sortedActiveIssues) {
  const unblocked = sortedActiveIssues.filter((item) => !item.blocker.isBlocked);
  const blocked = sortedActiveIssues.filter((item) => item.blocker.isBlocked);
  const actions = [];

  for (const item of unblocked) {
    if (actions.length >= MAX_RECOMMENDED_ACTIONS) {
      break;
    }
    actions.push({
      rank: actions.length + 1,
      actionType: 'focus',
      issueKey: item.key,
      summary: item.summary,
      score: item.score,
      title: `Work on ${item.key}: ${item.summary}`,
      reasons: item.reasons
    });
  }

  for (const item of blocked) {
    if (actions.length >= MAX_RECOMMENDED_ACTIONS) {
      break;
    }

    const title =
      item.blocker.blockedByKeys.length > 0
        ? `Resolve blocker(s) ${item.blocker.blockedByKeys.join(', ')} to unblock ${item.key}`
        : `Review '${item.status.name}' status on ${item.key}: ${item.summary}`;

    actions.push({
      rank: actions.length + 1,
      actionType: 'unblock',
      issueKey: item.key,
      summary: item.summary,
      score: item.score,
      title,
      reasons: item.reasons
    });
  }

  return actions;
}

/**
 * Generates a concise deterministic headline summarizing the daily briefing.
 * Ensures the callout matches the top actionable recommendation's actionType:
 * - 'focus'   -> "Top focus: <KEY>."
 * - 'unblock' -> "Top action: unblock <KEY>."
 *
 * @param {Object} summaryCounts - Computed metric counts.
 * @param {Object[]} recommendedActions - Generated top actions under Actionable-First policy.
 * @returns {string} Human-readable summary headline.
 */
function buildBriefingHeadline(summaryCounts, recommendedActions) {
  if (summaryCounts.totalActive === 0) {
    return 'You have no unresolved active tasks assigned right now.';
  }

  const parts = [];
  if (summaryCounts.overdueCount > 0) {
    parts.push(`${summaryCounts.overdueCount} overdue`);
  }
  if (summaryCounts.dueTodayCount > 0) {
    parts.push(`${summaryCounts.dueTodayCount} due today`);
  }
  if (summaryCounts.blockedCount > 0) {
    parts.push(`${summaryCounts.blockedCount} blocked`);
  }

  const taskLabel = summaryCounts.totalActive === 1 ? '1 active task' : `${summaryCounts.totalActive} active tasks`;
  const detailText = parts.length > 0 ? ` (${parts.join(', ')})` : '';

  let topActionText = '';
  if (recommendedActions.length > 0) {
    const topAction = recommendedActions[0];
    topActionText =
      topAction.actionType === 'unblock'
        ? ` Top action: unblock ${topAction.issueKey}.`
        : ` Top focus: ${topAction.issueKey}.`;
  }

  return `You have ${taskLabel}${detailText}.${topActionText}`;
}

/**
 * Builds the complete deterministic daily briefing from raw Jira retrieval output.
 *
 * If rawData indicates a failed Jira retrieval (success === false), returns the original
 * error response unchanged. If rawData is missing or malformed (e.g., missing success: true
 * or missing issues array), returns a safe error payload rather than fabricating a briefing.
 *
 * @param {Object} rawData - Payload returned by fetchJiraDailyBriefingData().
 * @param {Object} [options={}] - Optional overrides (e.g., { referenceDate, timeZone }).
 * @returns {Object} Complete structured daily briefing or error payload.
 */
export function buildDailyBriefing(rawData, options = {}) {
  // Preserve explicit retrieval failure objects completely unchanged
  if (rawData && typeof rawData === 'object' && !Array.isArray(rawData) && rawData.success === false) {
    return rawData;
  }

  // Safeguard: Reject malformed payloads lacking success: true or an issues array
  if (
    !rawData ||
    typeof rawData !== 'object' ||
    Array.isArray(rawData) ||
    rawData.success !== true ||
    !Array.isArray(rawData.issues)
  ) {
    return {
      success: false,
      error: {
        message: 'Unable to build daily briefing from malformed Jira response.',
        code: 'MALFORMED_JIRA_RESPONSE'
      }
    };
  }

  const referenceDate =
    options.referenceDate instanceof Date && !Number.isNaN(options.referenceDate.getTime())
      ? options.referenceDate
      : new Date();
  const requestedTimeZone = options.timeZone || rawData.user?.timeZone || 'UTC';
  const { dateString: briefingDate, timeZone: effectiveTimeZone } = getUserLocalDateInfo(
    requestedTimeZone,
    referenceDate
  );

  const inputIssues = Array.isArray(rawData.issues) ? rawData.issues : [];
  const activeIssues = [];
  let completedExcludedCount = 0;

  inputIssues.forEach((issue, index) => {
    if (!issue) {
      return;
    }

    if (isIssueCompleted(issue)) {
      completedExcludedCount += 1;
      return;
    }

    const deadline = analyzeDeadline(issue.dueDate, briefingDate);
    const blocker = analyzeBlockers(issue);
    const { score, priorityRank, reasons } = scoreIssue(issue, deadline, blocker);

    activeIssues.push({
      ...issue,
      score,
      priorityRank,
      reasons,
      deadline,
      blocker,
      _originalIndex: index
    });
  });

  // Sort deterministically with stable tie-breaking, then remove internal index property
  activeIssues.sort(compareAnalyzedIssues);
  const sortedIssues = activeIssues.map(({ _originalIndex, ...cleanIssue }) => cleanIssue);

  // Build categorized alert arrays
  const overdueAlerts = [];
  const dueTodayAlerts = [];
  const approachingAlerts = [];
  const blockedAlerts = [];
  let blockingOthersCount = 0;

  for (const item of sortedIssues) {
    if (item.blocker.blocksOthersKeys.length > 0) {
      blockingOthersCount += 1;
    }

    if (item.deadline.status === 'overdue') {
      overdueAlerts.push({
        key: item.key,
        summary: item.summary,
        dueDate: item.deadline.dueDate,
        daysOverdue: item.deadline.daysOverdue,
        priority: item.priority?.name || 'Medium',
        message: `${item.key} is ${item.deadline.label.toLowerCase()}.`
      });
    } else if (item.deadline.status === 'due_today') {
      dueTodayAlerts.push({
        key: item.key,
        summary: item.summary,
        dueDate: item.deadline.dueDate,
        priority: item.priority?.name || 'Medium',
        message: `${item.key} is due today.`
      });
    } else if (item.deadline.status === 'approaching') {
      approachingAlerts.push({
        key: item.key,
        summary: item.summary,
        dueDate: item.deadline.dueDate,
        daysUntilDue: item.deadline.daysUntilDue,
        priority: item.priority?.name || 'Medium',
        message: `${item.key} is ${item.deadline.label.toLowerCase()}.`
      });
    }

    if (item.blocker.isBlocked) {
      blockedAlerts.push({
        key: item.key,
        summary: item.summary,
        status: item.status?.name || 'Unknown',
        blockedByKeys: item.blocker.blockedByKeys,
        statusBlocked: item.blocker.statusBlocked,
        message: `${item.key}: ${item.blocker.reasons.join('; ')}.`
      });
    }
  }

  const recommendedActions = generateRecommendedActions(sortedIssues);

  const summaryCounts = {
    totalActive: sortedIssues.length,
    overdueCount: overdueAlerts.length,
    dueTodayCount: dueTodayAlerts.length,
    approachingCount: approachingAlerts.length,
    blockedCount: blockedAlerts.length,
    blockingOthersCount,
    completedExcludedCount
  };

  return {
    success: true,
    user: rawData.user || { displayName: 'Team Member', timeZone: effectiveTimeZone, avatarUrl: null },
    briefingDate,
    timeZone: effectiveTimeZone,
    summary: {
      ...summaryCounts,
      headline: buildBriefingHeadline(summaryCounts, recommendedActions)
    },
    alerts: {
      overdue: overdueAlerts,
      dueToday: dueTodayAlerts,
      approaching: approachingAlerts,
      blocked: blockedAlerts
    },
    recommendedActions,
    issues: sortedIssues,
    metadata: {
      ...(rawData.metadata || {}),
      analyzedAt: referenceDate.toISOString(),
      engineVersion: '1.0.0'
    }
  };
}
