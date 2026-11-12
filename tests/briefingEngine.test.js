import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  parseCalendarDate,
  getUserLocalDateInfo,
  analyzeDeadline,
  analyzeBlockers,
  isIssueCompleted,
  isLinkedIssueResolved,
  scoreIssue,
  buildDailyBriefing
} from '../src/resolvers/briefingEngine.js';

import {
  fetchJiraDailyBriefingData,
  handleGetDailyBriefing
} from '../src/resolvers/index.js';

/**
 * Helper to create a clean normalized issue fixture for tests.
 */
function makeIssue(overrides = {}) {
  return {
    id: overrides.id || '10001',
    key: overrides.key || 'PROJ-1',
    summary: overrides.summary || 'Default task summary',
    status: overrides.status || {
      name: 'To Do',
      category: 'To Do',
      colorName: 'blue-gray'
    },
    priority: overrides.priority || {
      name: 'Medium',
      iconUrl: null
    },
    dueDate: overrides.dueDate !== undefined ? overrides.dueDate : null,
    issueType: overrides.issueType || {
      name: 'Task',
      iconUrl: null,
      subtask: false
    },
    project: overrides.project || {
      id: '10000',
      key: 'PROJ',
      name: 'FocusBrief'
    },
    updated: overrides.updated || '2026-11-10T09:00:00.000Z',
    issueLinks: overrides.issueLinks || []
  };
}

describe('Date validation and user timezone handling', () => {
  it('validates real calendar dates and rejects impossible dates', () => {
    assert.deepEqual(parseCalendarDate('2024-02-29')?.dateString, '2024-02-29'); // Valid leap year
    assert.equal(parseCalendarDate('2025-02-29'), null); // Non-leap year Feb 29
    assert.equal(parseCalendarDate('2026-02-30'), null); // Impossible Feb 30
    assert.equal(parseCalendarDate('2026-04-31'), null); // April has 30 days
    assert.equal(parseCalendarDate('2026-13-01'), null); // Invalid month
    assert.equal(parseCalendarDate('2026-00-10'), null); // Zero month
    assert.equal(parseCalendarDate('2026/11/10'), null); // Wrong format
    assert.equal(parseCalendarDate(null), null);
  });

  it('resolves local calendar dates accurately across user timezones', () => {
    // 2026-11-10 02:30 UTC is still 2026-11-09 21:30 in America/New_York (UTC-5)
    const utcMorning = new Date('2026-11-10T02:30:00.000Z');
    const nyInfo = getUserLocalDateInfo('America/New_York', utcMorning);
    const utcInfo = getUserLocalDateInfo('UTC', utcMorning);

    assert.equal(nyInfo.dateString, '2026-11-09');
    assert.equal(nyInfo.timeZone, 'America/New_York');
    assert.equal(utcInfo.dateString, '2026-11-10');

    // 2026-11-09 20:00 UTC is already 2026-11-10 05:00 in Asia/Tokyo (UTC+9)
    const utcEvening = new Date('2026-11-09T20:00:00.000Z');
    const tokyoInfo = getUserLocalDateInfo('Asia/Tokyo', utcEvening);
    assert.equal(tokyoInfo.dateString, '2026-11-10');
  });

  it('falls back safely to UTC when timezone is invalid or missing', () => {
    const ref = new Date('2026-11-10T12:00:00.000Z');
    assert.deepEqual(getUserLocalDateInfo('Invalid/Timezone_Name', ref), {
      dateString: '2026-11-10',
      timeZone: 'UTC'
    });
    assert.deepEqual(getUserLocalDateInfo('', ref), {
      dateString: '2026-11-10',
      timeZone: 'UTC'
    });
  });

  it('evaluates the same dueDate according to the user timezone without off-by-one drift', () => {
    const utcMoment = new Date('2026-11-10T02:30:00.000Z');
    const nyDate = getUserLocalDateInfo('America/New_York', utcMoment).dateString; // 2026-11-09
    const utcDate = getUserLocalDateInfo('UTC', utcMoment).dateString; // 2026-11-10

    const nyResult = analyzeDeadline('2026-11-09', nyDate);
    const utcResult = analyzeDeadline('2026-11-09', utcDate);

    assert.equal(nyResult.status, 'due_today');
    assert.equal(utcResult.status, 'overdue');
    assert.equal(utcResult.daysOverdue, 1);
  });
});

describe('Deadline classification', () => {
  const today = '2026-11-10';

  it('classifies overdue, due_today, approaching, upcoming, and none correctly', () => {
    assert.deepEqual(analyzeDeadline('2026-11-07', today), {
      status: 'overdue',
      dueDate: '2026-11-07',
      daysUntilDue: -3,
      daysOverdue: 3,
      hasInvalidDate: false,
      label: 'Overdue by 3 days'
    });

    assert.equal(analyzeDeadline('2026-11-09', today).label, 'Overdue by 1 day');
    assert.equal(analyzeDeadline('2026-11-10', today).status, 'due_today');
    assert.equal(analyzeDeadline('2026-11-11', today).status, 'approaching');
    assert.equal(analyzeDeadline('2026-11-13', today).status, 'approaching');
    assert.equal(analyzeDeadline('2026-11-14', today).status, 'upcoming');
    assert.equal(analyzeDeadline(null, today).status, 'none');

    const invalidResult = analyzeDeadline('2026-02-30', today);
    assert.equal(invalidResult.status, 'none');
    assert.equal(invalidResult.hasInvalidDate, true);

    const whitespaceResult = analyzeDeadline('   ', today);
    assert.equal(whitespaceResult.status, 'none');
    assert.equal(whitespaceResult.hasInvalidDate, false);
    assert.equal(whitespaceResult.label, 'No due date set');

    const emptyResult = analyzeDeadline('', today);
    assert.equal(emptyResult.status, 'none');
    assert.equal(emptyResult.hasInvalidDate, false);
    assert.equal(emptyResult.label, 'No due date set');
  });
});

describe('Blocker detection, link directionality, and false-positive prevention', () => {
  it('flags issues with an active inward "is blocked by" link', () => {
    const issue = makeIssue({
      key: 'PROJ-10',
      issueLinks: [
        {
          id: '1',
          type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
          inwardIssue: {
            id: '10099',
            key: 'PROJ-99',
            summary: 'Provision database',
            status: 'In Progress',
            statusCategory: 'In Progress'
          },
          outwardIssue: null
        }
      ]
    });

    const result = analyzeBlockers(issue);
    assert.equal(result.isBlocked, true);
    assert.deepEqual(result.blockedByKeys, ['PROJ-99']);
    assert.deepEqual(result.blocksOthersKeys, []);
  });

  it('does NOT flag a task that blocks another task (outward "blocks" link)', () => {
    const issue = makeIssue({
      key: 'PROJ-20',
      issueLinks: [
        {
          id: '2',
          type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
          inwardIssue: null,
          outwardIssue: {
            id: '10050',
            key: 'PROJ-50',
            summary: 'Deploy UI',
            status: 'To Do',
            statusCategory: 'To Do'
          }
        }
      ]
    });

    const result = analyzeBlockers(issue);
    assert.equal(result.isBlocked, false);
    assert.deepEqual(result.blockedByKeys, []);
    assert.deepEqual(result.blocksOthersKeys, ['PROJ-50']);
  });

  it('ignores resolved blocking dependencies by statusCategory or status name', () => {
    const issue = makeIssue({
      key: 'PROJ-11',
      issueLinks: [
        {
          id: '3',
          type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
          inwardIssue: {
            id: '10002',
            key: 'PROJ-2',
            summary: 'Completed dependency',
            status: 'Shipped',
            statusCategory: 'Done'
          },
          outwardIssue: null
        },
        {
          id: '4',
          type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
          inwardIssue: {
            id: '10003',
            key: 'PROJ-3',
            summary: 'Legacy fallback resolved dependency',
            status: 'Resolved',
            statusCategory: null
          },
          outwardIssue: null
        }
      ]
    });

    const result = analyzeBlockers(issue);
    assert.equal(result.isBlocked, false);
    assert.deepEqual(result.blockedByKeys, []);
  });

  it('ignores neutral link types and never misclassifies summary text', () => {
    const issue = makeIssue({
      key: 'PROJ-12',
      summary: 'Fix ad-blocker and code block rendering issues',
      status: { name: 'In Review', category: 'In Progress', colorName: 'yellow' },
      issueLinks: [
        {
          id: '5',
          type: { name: 'Relates', inward: 'relates to', outward: 'relates to' },
          inwardIssue: { id: '10004', key: 'PROJ-4', summary: 'Related work', status: 'To Do', statusCategory: 'To Do' },
          outwardIssue: null
        },
        {
          id: '6',
          type: { name: 'Duplicate', inward: 'is duplicated by', outward: 'duplicates' },
          inwardIssue: null,
          outwardIssue: { id: '10005', key: 'PROJ-5', summary: 'Dup task', status: 'Open', statusCategory: 'To Do' }
        }
      ]
    });

    const result = analyzeBlockers(issue);
    assert.equal(result.isBlocked, false);
    assert.equal(result.statusBlocked, false);
    assert.deepEqual(result.blockedByKeys, []);
    assert.deepEqual(result.blocksOthersKeys, []);
  });

  it('detects explicit blocked statuses without flagging normal review/QA stages', () => {
    const blockedStatusIssue = makeIssue({
      key: 'PROJ-13',
      status: { name: 'On Hold', category: 'In Progress', colorName: 'yellow' }
    });
    const reviewStatusIssue = makeIssue({
      key: 'PROJ-14',
      status: { name: 'Ready for QA', category: 'In Progress', colorName: 'yellow' }
    });

    assert.equal(analyzeBlockers(blockedStatusIssue).isBlocked, true);
    assert.equal(analyzeBlockers(blockedStatusIssue).statusBlocked, true);
    assert.equal(analyzeBlockers(reviewStatusIssue).isBlocked, false);
  });

  it('detects custom passive "depends on" links even when mapped on outwardIssue', () => {
    const issue = makeIssue({
      key: 'PROJ-15',
      issueLinks: [
        {
          id: '7',
          type: { name: 'Dependency', inward: 'is depended on by', outward: 'depends on' },
          inwardIssue: null,
          outwardIssue: {
            id: '10077',
            key: 'PROJ-77',
            summary: 'Shared auth service',
            status: 'In Progress',
            statusCategory: 'In Progress'
          }
        }
      ]
    });

    const result = analyzeBlockers(issue);
    assert.equal(result.isBlocked, true);
    assert.deepEqual(result.blockedByKeys, ['PROJ-77']);
  });

  it('deduplicates repeated blocking links and lists multiple distinct blockers', () => {
    const issue = makeIssue({
      key: 'PROJ-16',
      issueLinks: [
        {
          id: '101',
          type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
          inwardIssue: { id: '10100', key: 'PROJ-10', summary: 'Blocker A', status: 'In Progress', statusCategoryKey: 'indeterminate' },
          outwardIssue: null
        },
        {
          id: '102',
          type: { name: 'Dependency', inward: 'depends on', outward: 'is depended on by' },
          inwardIssue: { id: '10100', key: 'PROJ-10', summary: 'Blocker A', status: 'In Progress', statusCategoryKey: 'indeterminate' },
          outwardIssue: null
        },
        {
          id: '103',
          type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
          inwardIssue: { id: '10101', key: 'PROJ-11', summary: 'Blocker B', status: 'To Do', statusCategoryKey: 'new' },
          outwardIssue: null
        }
      ]
    });

    const result = analyzeBlockers(issue);
    assert.equal(result.isBlocked, true);
    assert.deepEqual(result.blockedByKeys, ['PROJ-10', 'PROJ-11']);
    assert.deepEqual(result.reasons, ['Blocked by PROJ-10, PROJ-11']);
  });

  it('uses stable statusCategoryKey for localized Jira category names', () => {
    const localizedDoneParent = makeIssue({
      key: 'PROJ-17',
      status: { name: 'Abgeschlossen', category: 'Fertig', statusCategoryKey: 'done' }
    });
    const localizedInProgressParent = makeIssue({
      key: 'PROJ-18',
      status: { name: 'In Bearbeitung', category: 'In Arbeit', statusCategoryKey: 'indeterminate' }
    });
    const localizedLinkedDone = {
      key: 'PROJ-19',
      status: 'Erledigt',
      statusCategory: 'Fertig',
      statusCategoryKey: 'done'
    };
    const localizedLinkedOpen = {
      key: 'PROJ-20',
      status: 'Offen',
      statusCategory: 'Zu erledigen',
      statusCategoryKey: 'new'
    };

    assert.equal(isIssueCompleted(localizedDoneParent), true);
    assert.equal(isIssueCompleted(localizedInProgressParent), false);
    assert.equal(isLinkedIssueResolved(localizedLinkedDone), true);
    assert.equal(isLinkedIssueResolved(localizedLinkedOpen), false);

    const scoredInProgress = scoreIssue(
      localizedInProgressParent,
      analyzeDeadline(null, '2026-11-10'),
      analyzeBlockers(localizedInProgressParent)
    );
    assert.ok(scoredInProgress.reasons.includes('Current status: In Bearbeitung'));
    assert.equal(scoredInProgress.reasons.includes('Currently in progress'), false);
    assert.equal(scoredInProgress.score, 20); // Medium 15 + In Progress 5
  });

  it('uses actual workflow status name for indeterminate statuses like In Review', () => {
    const inReviewIssue = makeIssue({
      key: 'PROJ-22',
      summary: 'Verify API rate-limit handling',
      status: {
        name: 'In Review',
        category: 'In Progress',
        statusCategoryKey: 'indeterminate',
        colorName: 'yellow'
      },
      priority: { name: 'Medium' }
    });

    const scoredInReview = scoreIssue(
      inReviewIssue,
      analyzeDeadline(null, '2026-11-10'),
      analyzeBlockers(inReviewIssue)
    );
    assert.equal(scoredInReview.score, 20); // Preserves Medium 15 + indeterminate +5 momentum weight
    assert.ok(scoredInReview.reasons.includes('Current status: In Review'));
    assert.equal(scoredInReview.reasons.includes('Currently in progress'), false);

    const briefing = buildDailyBriefing(
      {
        success: true,
        user: { displayName: 'Alex', timeZone: 'UTC', avatarUrl: null },
        issues: [inReviewIssue]
      },
      { referenceDate: new Date('2026-11-10T09:00:00.000Z') }
    );
    assert.equal(briefing.recommendedActions.length, 1);
    assert.deepEqual(briefing.recommendedActions[0].status, inReviewIssue.status);
    assert.ok(briefing.recommendedActions[0].reasons.includes('Current status: In Review'));
    assert.equal(briefing.recommendedActions[0].reasons.includes('Currently in progress'), false);
  });

  it('detects completed tasks via status-name fallback when statusCategoryKey is missing', () => {
    const closedFallbackIssue = makeIssue({
      key: 'PROJ-21',
      status: { name: 'Closed', category: null, statusCategoryKey: null },
      priority: { name: 'Highest' },
      dueDate: '2026-11-01'
    });
    const localizedCategoryFallbackIssue = makeIssue({
      key: 'PROJ-22',
      status: { name: 'Done', category: 'Fertig', statusCategoryKey: null }
    });

    assert.equal(isIssueCompleted(closedFallbackIssue), true);
    assert.equal(isIssueCompleted(localizedCategoryFallbackIssue), true);
    assert.equal(analyzeBlockers(closedFallbackIssue).isBlocked, false);
    assert.equal(
      scoreIssue(closedFallbackIssue, analyzeDeadline('2026-11-01', '2026-11-10'), analyzeBlockers(closedFallbackIssue)).score,
      0
    );

    const briefing = buildDailyBriefing(
      {
        success: true,
        user: { displayName: 'Test', timeZone: 'UTC' },
        issues: [closedFallbackIssue]
      },
      { referenceDate: new Date('2026-11-10T10:00:00.000Z') }
    );
    assert.equal(briefing.summary.totalActive, 0);
    assert.equal(briefing.summary.completedExcludedCount, 1);
    assert.deepEqual(briefing.recommendedActions, []);
  });
});

describe('Priority scoring, stable sorting, recommendations, and completed task guard', () => {
  const referenceDate = new Date('2026-11-10T10:00:00.000Z');

  it('produces explainable 0-100 scores clamped safely within bounds', () => {
    const maxIssue = makeIssue({
      key: 'PROJ-1',
      priority: { name: 'Highest' },
      dueDate: '2026-11-08',
      status: { name: 'In Progress', category: 'In Progress', colorName: 'yellow' },
      issueLinks: [
        {
          id: '1',
          type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
          inwardIssue: null,
          outwardIssue: { id: '2', key: 'PROJ-2', summary: 'Downstream', status: 'To Do', statusCategory: 'To Do' }
        }
      ]
    });

    const deadlineMax = analyzeDeadline(maxIssue.dueDate, '2026-11-10');
    const blockerMax = analyzeBlockers(maxIssue);
    const maxScored = scoreIssue(maxIssue, deadlineMax, blockerMax);

    assert.equal(maxScored.score, 100); // 35 + 45 + 15 + 5 = 100
    assert.ok(maxScored.reasons.length >= 4);

    const minIssue = makeIssue({
      key: 'PROJ-9',
      priority: { name: 'Lowest' },
      dueDate: null,
      status: { name: 'Blocked', category: 'To Do', colorName: 'blue-gray' }
    });

    const deadlineMin = analyzeDeadline(minIssue.dueDate, '2026-11-10');
    const blockerMin = analyzeBlockers(minIssue);
    const minScored = scoreIssue(minIssue, deadlineMin, blockerMin);

    assert.equal(minScored.score, 0); // 4 + 0 - 25 clamped to 0
    assert.ok(minScored.reasons.includes('Priority is Lowest'));
    assert.ok(minScored.reasons.includes("Status is 'Blocked'"));
  });

  it('ranks tasks deterministically, uses stable tie-breakers, limits recommendations to 3, and excludes completed tasks', () => {
    const rawData = {
      success: true,
      user: { displayName: 'Alice', timeZone: 'UTC', avatarUrl: null },
      issues: [
        // Completed task should never be recommended or counted in active alerts
        makeIssue({
          key: 'PROJ-99',
          summary: 'Finished critical task',
          priority: { name: 'Highest' },
          dueDate: '2026-11-01',
          status: { name: 'Done', category: 'Done', colorName: 'green' }
        }),
        // Tie-breaker test pair: identical score (Medium 15 + Due today 38 = 53), PROJ-10 listed before PROJ-2
        makeIssue({
          key: 'PROJ-10',
          summary: 'Second alphabetically and numerically',
          priority: { name: 'Medium' },
          dueDate: '2026-11-10'
        }),
        makeIssue({
          key: 'PROJ-2',
          summary: 'First numerically on tie',
          priority: { name: 'Medium' },
          dueDate: '2026-11-10'
        }),
        // Top task: High priority overdue
        makeIssue({
          key: 'PROJ-1',
          summary: 'Critical overdue bug',
          priority: { name: 'High' },
          dueDate: '2026-11-09'
        }),
        // Fourth unblocked task (should be omitted from top 3 recommendations)
        makeIssue({
          key: 'PROJ-3',
          summary: 'Future low priority work',
          priority: { name: 'Low' },
          dueDate: '2026-11-20'
        }),
        // Blocked task
        makeIssue({
          key: 'PROJ-4',
          summary: 'Blocked task',
          priority: { name: 'High' },
          dueDate: '2026-11-11',
          status: { name: 'Blocked', category: 'To Do', colorName: 'blue-gray' }
        })
      ]
    };

    const briefing = buildDailyBriefing(rawData, { referenceDate });

    assert.equal(briefing.success, true);
    assert.equal(briefing.summary.totalActive, 5);
    assert.equal(briefing.summary.completedExcludedCount, 1);
    assert.equal(briefing.summary.overdueCount, 1);
    assert.equal(briefing.summary.dueTodayCount, 2);
    assert.equal(briefing.summary.approachingCount, 1);
    assert.equal(briefing.summary.blockedCount, 1);

    // Completed task excluded from issues, alerts, and recommendations
    assert.equal(briefing.issues.some((i) => i.key === 'PROJ-99'), false);

    // Stable tie-breaker puts PROJ-2 before PROJ-10
    assert.deepEqual(
      briefing.issues.map((i) => i.key),
      ['PROJ-1', 'PROJ-2', 'PROJ-10', 'PROJ-4', 'PROJ-3']
    );

    // Top 3 recommended actions are actionable tasks PROJ-1, PROJ-2, PROJ-10
    assert.equal(briefing.recommendedActions.length, 3);
    assert.deepEqual(
      briefing.recommendedActions.map((a) => a.issueKey),
      ['PROJ-1', 'PROJ-2', 'PROJ-10']
    );
    assert.ok(briefing.recommendedActions.every((a) => a.actionType === 'focus'));
    assert.ok(briefing.recommendedActions.every((a) => Array.isArray(a.reasons) && a.reasons.length > 0));
  });

  it('surfaces unblock recommendations when fewer than 3 unblocked tasks exist', () => {
    const rawData = {
      success: true,
      user: { displayName: 'Bob', timeZone: 'UTC', avatarUrl: null },
      issues: [
        makeIssue({
          key: 'PROJ-1',
          priority: { name: 'Medium' },
          dueDate: '2026-11-11'
        }),
        makeIssue({
          key: 'PROJ-2',
          priority: { name: 'High' },
          dueDate: '2026-11-10',
          issueLinks: [
            {
              id: '10',
              type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
              inwardIssue: { id: '10088', key: 'PROJ-88', summary: 'Upstream', status: 'To Do', statusCategory: 'To Do' },
              outwardIssue: null
            }
          ]
        })
      ]
    };

    const briefing = buildDailyBriefing(rawData, { referenceDate });
    assert.equal(briefing.recommendedActions.length, 2);
    assert.equal(briefing.recommendedActions[0].issueKey, 'PROJ-1');
    assert.equal(briefing.recommendedActions[0].actionType, 'focus');
    assert.equal(briefing.recommendedActions[1].issueKey, 'PROJ-2');
    assert.equal(briefing.recommendedActions[1].actionType, 'unblock');
    assert.match(briefing.recommendedActions[1].title, /PROJ-88/);
  });

  it('breaks equal-score ties cleanly by unblocked status, earlier due date, and natural key', () => {
    const rawData = {
      success: true,
      user: { displayName: 'Eva', timeZone: 'UTC', avatarUrl: null },
      issues: [
        // Score 35 (Highest 35 + Approaching 25 - Blocked 25) -> blocked, listed first in raw array
        makeIssue({
          key: 'PROJ-1',
          priority: { name: 'Highest' },
          dueDate: '2026-11-11',
          status: { name: 'Blocked', category: 'To Do', colorName: 'blue-gray' }
        }),
        // Score 35 (Highest 35 + No due date 0) -> unblocked, must beat blocked PROJ-1 on tie
        makeIssue({
          key: 'PROJ-5',
          priority: { name: 'Highest' },
          dueDate: null
        })
      ]
    };

    const briefing = buildDailyBriefing(rawData, { referenceDate });
    assert.equal(briefing.issues[0].score, 35);
    assert.equal(briefing.issues[1].score, 35);
    assert.deepEqual(
      briefing.issues.map((i) => i.key),
      ['PROJ-5', 'PROJ-1']
    );
  });

  it('breaks equal-score ties deterministically by due date delta and priority rank', () => {
    const rawData = {
      success: true,
      user: { displayName: 'Frank', timeZone: 'UTC', avatarUrl: null },
      issues: [
        // Score 40 (Medium 15 + Approaching 25), due in 3 days
        makeIssue({
          key: 'PROJ-3',
          priority: { name: 'Medium' },
          dueDate: '2026-11-13'
        }),
        // Score 40 (Medium 15 + Approaching 25), due in 1 day -> beats PROJ-3 via earlier dueDate
        makeIssue({
          key: 'PROJ-4',
          priority: { name: 'Medium' },
          dueDate: '2026-11-11'
        }),
        // Score 30 (Medium 15 + Blocking 15), no due date -> loses to PROJ-6 on priorityRank
        makeIssue({
          key: 'PROJ-1',
          priority: { name: 'Medium' },
          dueDate: null,
          issueLinks: [
            {
              id: '50',
              type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
              inwardIssue: null,
              outwardIssue: { id: '999', key: 'PROJ-99', summary: 'Blocked downstream', status: 'To Do', statusCategoryKey: 'new' }
            }
          ]
        }),
        // Score 30 (High 25 + In Progress 5), no due date -> beats PROJ-1 via higher priorityRank
        makeIssue({
          key: 'PROJ-6',
          priority: { name: 'High' },
          dueDate: null,
          status: { name: 'In Progress', category: 'In Progress', statusCategoryKey: 'indeterminate' }
        }),
        // Score 23 (Low 8 + Blocking 15), no due date
        makeIssue({
          key: 'PROJ-7',
          priority: { name: 'Low' },
          dueDate: null,
          issueLinks: [
            {
              id: '51',
              type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
              inwardIssue: null,
              outwardIssue: { id: '998', key: 'PROJ-98', summary: 'Another downstream', status: 'To Do', statusCategoryKey: 'new' }
            }
          ]
        }),
        // Score 23 (Medium 15 + Upcoming 8), has due date -> beats PROJ-7 (null due date)
        makeIssue({
          key: 'PROJ-8',
          priority: { name: 'Medium' },
          dueDate: '2026-11-20'
        })
      ]
    };

    const briefing = buildDailyBriefing(rawData, { referenceDate });
    assert.deepEqual(
      briefing.issues.map((i) => i.key),
      ['PROJ-4', 'PROJ-3', 'PROJ-6', 'PROJ-1', 'PROJ-8', 'PROJ-7']
    );
  });

  it('handles unknown priority labels with default weight while preserving the label in reasons', () => {
    const customPriorityIssue = makeIssue({
      key: 'PROJ-25',
      priority: { name: 'P1 - Urgent' },
      dueDate: '   '
    });

    const briefing = buildDailyBriefing(
      {
        success: true,
        user: { displayName: 'Grace', timeZone: 'UTC' },
        issues: [customPriorityIssue]
      },
      { referenceDate }
    );

    assert.equal(briefing.issues[0].score, 15);
    assert.ok(briefing.issues[0].reasons.includes('Priority is P1 - Urgent'));
    assert.ok(briefing.issues[0].reasons.includes('No due date set'));
    assert.equal(briefing.issues[0].deadline.hasInvalidDate, false);
  });

  it('maintains recommendation and headline consistency under the Actionable-First policy', () => {
    // Mixed case: blocked high-urgency task (score 70) vs actionable unblocked task (score 40)
    const mixedBriefing = buildDailyBriefing(
      {
        success: true,
        user: { displayName: 'Hannah', timeZone: 'UTC' },
        issues: [
          makeIssue({
            key: 'PROJ-BLOCKED',
            summary: 'Critical blocked item',
            priority: { name: 'Highest' },
            dueDate: '2026-11-08',
            status: { name: 'Blocked', category: 'To Do', statusCategoryKey: 'new' },
            issueLinks: [
              {
                id: '60',
                type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
                inwardIssue: null,
                outwardIssue: { id: '61', key: 'PROJ-DOWN', summary: 'Waiting', status: 'To Do', statusCategoryKey: 'new' }
              }
            ]
          }),
          makeIssue({
            key: 'PROJ-ACTION',
            summary: 'Actionable medium task',
            priority: { name: 'Medium' },
            dueDate: '2026-11-12'
          })
        ]
      },
      { referenceDate }
    );

    assert.equal(mixedBriefing.issues[0].key, 'PROJ-BLOCKED');
    assert.equal(mixedBriefing.issues[0].score, 70);
    assert.equal(mixedBriefing.recommendedActions[0].issueKey, 'PROJ-ACTION');
    assert.equal(mixedBriefing.recommendedActions[0].actionType, 'focus');
    assert.match(mixedBriefing.summary.headline, /Top focus: PROJ-ACTION\./);

    // All-blocked case: headline reflects top unblock action instead of claiming "Top focus"
    const allBlockedBriefing = buildDailyBriefing(
      {
        success: true,
        user: { displayName: 'Ivan', timeZone: 'UTC' },
        issues: [
          makeIssue({
            key: 'PROJ-B1',
            summary: 'Low blocked',
            priority: { name: 'Low' },
            status: { name: 'Blocked', category: 'To Do', statusCategoryKey: 'new' }
          }),
          makeIssue({
            key: 'PROJ-B2',
            summary: 'High blocked',
            priority: { name: 'High' },
            dueDate: '2026-11-10',
            status: { name: 'On Hold', category: 'In Progress', statusCategoryKey: 'indeterminate' }
          })
        ]
      },
      { referenceDate }
    );

    assert.equal(allBlockedBriefing.recommendedActions[0].issueKey, 'PROJ-B2');
    assert.equal(allBlockedBriefing.recommendedActions[0].actionType, 'unblock');
    assert.match(allBlockedBriefing.summary.headline, /Top action: unblock PROJ-B2\./);
    assert.doesNotMatch(allBlockedBriefing.summary.headline, /Top focus:/);
  });

  it('falls back safely when options.referenceDate is an invalid Date', () => {
    const briefing = buildDailyBriefing(
      {
        success: true,
        user: { displayName: 'Jules', timeZone: 'UTC' },
        issues: [makeIssue({ key: 'PROJ-30' })]
      },
      { referenceDate: new Date('invalid-date-string') }
    );

    assert.equal(briefing.success, true);
    assert.match(briefing.briefingDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.doesNotThrow(() => new Date(briefing.metadata.analyzedAt).toISOString());
    assert.equal(Number.isNaN(Date.parse(briefing.metadata.analyzedAt)), false);
  });

  it('handles empty issue lists cleanly', () => {
    const briefing = buildDailyBriefing(
      {
        success: true,
        user: { displayName: 'Dana', timeZone: 'UTC', avatarUrl: null },
        issues: []
      },
      { referenceDate }
    );

    assert.equal(briefing.success, true);
    assert.equal(briefing.summary.totalActive, 0);
    assert.deepEqual(briefing.recommendedActions, []);
    assert.deepEqual(briefing.alerts.overdue, []);
    assert.deepEqual(briefing.alerts.blocked, []);
    assert.match(briefing.summary.headline, /no unresolved active tasks/i);
  });
});

describe('Error handling and resolver integration safeguards', () => {
  it('returns failed retrieval payloads unchanged and rejects malformed payloads in buildDailyBriefing', () => {
    const originalError = {
      success: false,
      error: {
        message: 'Unable to retrieve assigned Jira tasks. Please check permissions.',
        code: 'SEARCH_JQL_FETCH_FAILED'
      }
    };

    const result = buildDailyBriefing(originalError);
    assert.strictEqual(result, originalError);

    for (const malformed of [
      null,
      undefined,
      {},
      [],
      'corrupt',
      { success: true },
      { success: true, issues: 'not-an-array' }
    ]) {
      const malformedResult = buildDailyBriefing(malformed);
      assert.equal(malformedResult.success, false);
      assert.equal(malformedResult.error.code, 'MALFORMED_JIRA_RESPONSE');
    }
  });

  it('returns the original Jira error response unchanged when resolver Jira fetch fails', async () => {
    const mockSearchFail = async (endpointRoute) => {
      const url = endpointRoute?.value || String(endpointRoute);
      if (url.includes('/myself')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ displayName: 'Alice', timeZone: 'UTC' })
        };
      }
      return {
        ok: false,
        status: 500
      };
    };

    const searchFailResult = await handleGetDailyBriefing({ requestJira: mockSearchFail });
    assert.deepEqual(searchFailResult, {
      success: false,
      error: {
        message: 'Unable to retrieve assigned Jira tasks. Please check permissions.',
        code: 'SEARCH_JQL_FETCH_FAILED'
      }
    });

    const mockUserFail = async (endpointRoute) => {
      const url = endpointRoute?.value || String(endpointRoute);
      if (url.includes('/myself')) {
        return { ok: false, status: 403 };
      }
      return { ok: true, status: 200, json: async () => ({ issues: [] }) };
    };

    const userFailResult = await handleGetDailyBriefing({ requestJira: mockUserFail });
    assert.deepEqual(userFailResult, {
      success: false,
      error: {
        message: 'Unable to retrieve user profile from Jira. Please check permissions.',
        code: 'USER_PROFILE_FETCH_FAILED'
      }
    });
  });

  it('returns the original unexpected error payload when requestJira throws', async () => {
    const mockThrowingRequestJira = async () => {
      throw new Error('Simulated network failure');
    };

    const rawResult = await fetchJiraDailyBriefingData({ requestJira: mockThrowingRequestJira });
    assert.deepEqual(rawResult, {
      success: false,
      error: {
        message: 'An unexpected error occurred while communicating with Jira.',
        code: 'UNEXPECTED_ERROR'
      }
    });

    const briefingResult = await handleGetDailyBriefing({ requestJira: mockThrowingRequestJira });
    assert.deepEqual(briefingResult, rawResult);
  });

  it('processes full end-to-end mock Jira REST responses cleanly without live API calls', async () => {
    const mockRequestJira = async (endpointRoute) => {
      const url = endpointRoute?.value || String(endpointRoute);
      if (url.includes('/myself')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            displayName: 'Sam',
            timeZone: 'Europe/Berlin',
            avatarUrls: { '48x48': 'https://example.com/avatar.png' }
          })
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          total: 1,
          issues: [
            {
              id: '20001',
              key: 'FB-1',
              fields: {
                summary: 'Prepare daily briefing UI',
                status: { name: 'In Arbeit', statusCategory: { name: 'In Arbeit', key: 'indeterminate', colorName: 'yellow' } },
                priority: { name: 'High', iconUrl: null },
                duedate: '2026-11-10',
                issuetype: { name: 'Story', iconUrl: null, subtask: false },
                project: { id: '1', key: 'FB', name: 'FocusBrief' },
                updated: '2026-11-10T08:00:00.000Z',
                issuelinks: [
                  {
                    id: '300',
                    type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
                    inwardIssue: {
                      id: '20000',
                      key: 'FB-0',
                      fields: {
                        summary: 'Completed setup',
                        status: { name: 'Fertig', statusCategory: { name: 'Fertig', key: 'done' } }
                      }
                    }
                  }
                ]
              }
            }
          ]
        })
      };
    };

    const result = await handleGetDailyBriefing({
      requestJira: mockRequestJira,
      referenceDate: new Date('2026-11-10T09:00:00.000Z')
    });

    assert.equal(result.success, true);
    assert.equal(result.timeZone, 'Europe/Berlin');
    assert.equal(result.summary.totalActive, 1);
    assert.equal(result.summary.dueTodayCount, 1);
    assert.equal(result.summary.blockedCount, 0); // FB-0 is Done via key: 'done' even when localized as 'Fertig'!
    assert.equal(result.issues[0].status.statusCategoryKey, 'indeterminate');
    assert.ok(result.issues[0].reasons.includes('Current status: In Arbeit'));
    assert.equal(result.recommendedActions[0].issueKey, 'FB-1');
    assert.deepEqual(result.recommendedActions[0].status, result.issues[0].status);
  });
});
