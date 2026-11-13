import ResolverModule from '@forge/resolver';
import api, { route } from '@forge/api';
import { buildDailyBriefing } from './briefingEngine.js';
import { fetchRelevantConfluenceDocs } from './confluenceKnowledge.js';

/**
 * FocusBrief AI — Jira Data Retrieval Resolver
 *
 * This module handles data retrieval from the Jira Cloud REST API v3.
 * Requests are authenticated as the logged-in user using `api.asUser()`,
 * ensuring that data access strictly respects the user's Jira permissions.
 */

// Support both bundler-unwrapped ESM default exports (Forge) and native Node.js ESM-over-CJS imports (tests)
const Resolver = ResolverModule.default || ResolverModule;
const resolver = new Resolver();

/**
 * Normalizes a raw Jira issue into a structured, lightweight object.
 *
 * Extracts only the fields needed for the daily briefing, stripping unnecessary
 * nested properties and providing safe defaults for null/undefined values.
 *
 * @param {Object} issue - Raw Jira issue object returned by Jira REST API.
 * @returns {Object} Cleaned, predictable issue structure.
 */
function normalizeIssue(issue) {
  const fields = issue.fields || {};

  return {
    id: issue.id,
    key: issue.key,
    summary: fields.summary || 'Untitled Issue',
    status: {
      name: fields.status ? fields.status.name : 'Unknown',
      category: fields.status && fields.status.statusCategory ? fields.status.statusCategory.name : 'To Do',
      statusCategoryKey:
        fields.status && fields.status.statusCategory ? fields.status.statusCategory.key || null : null,
      colorName: fields.status && fields.status.statusCategory ? fields.status.statusCategory.colorName : 'default'
    },
    priority: {
      name: fields.priority ? fields.priority.name : 'Medium',
      iconUrl: fields.priority ? fields.priority.iconUrl : null
    },
    dueDate: fields.duedate || null,
    issueType: {
      name: fields.issuetype ? fields.issuetype.name : 'Task',
      iconUrl: fields.issuetype ? fields.issuetype.iconUrl : null,
      subtask: Boolean(fields.issuetype && fields.issuetype.subtask)
    },
    project: {
      id: fields.project ? fields.project.id : null,
      key: fields.project ? fields.project.key : '',
      name: fields.project ? fields.project.name : ''
    },
    updated: fields.updated || null,
    issueLinks: Array.isArray(fields.issuelinks)
      ? fields.issuelinks.map((link) => ({
          id: link.id,
          type: {
            name: link.type ? link.type.name : '',
            inward: link.type ? link.type.inward : '',
            outward: link.type ? link.type.outward : ''
          },
          inwardIssue: link.inwardIssue
            ? {
                id: link.inwardIssue.id,
                key: link.inwardIssue.key,
                summary: link.inwardIssue.fields ? link.inwardIssue.fields.summary : '',
                status: link.inwardIssue.fields && link.inwardIssue.fields.status ? link.inwardIssue.fields.status.name : '',
                statusCategory:
                  link.inwardIssue.fields &&
                  link.inwardIssue.fields.status &&
                  link.inwardIssue.fields.status.statusCategory
                    ? link.inwardIssue.fields.status.statusCategory.name
                    : null,
                statusCategoryKey:
                  link.inwardIssue.fields &&
                  link.inwardIssue.fields.status &&
                  link.inwardIssue.fields.status.statusCategory
                    ? link.inwardIssue.fields.status.statusCategory.key || null
                    : null
              }
            : null,
          outwardIssue: link.outwardIssue
            ? {
                id: link.outwardIssue.id,
                key: link.outwardIssue.key,
                summary: link.outwardIssue.fields ? link.outwardIssue.fields.summary : '',
                status: link.outwardIssue.fields && link.outwardIssue.fields.status ? link.outwardIssue.fields.status.name : '',
                statusCategory:
                  link.outwardIssue.fields &&
                  link.outwardIssue.fields.status &&
                  link.outwardIssue.fields.status.statusCategory
                    ? link.outwardIssue.fields.status.statusCategory.name
                    : null,
                statusCategoryKey:
                  link.outwardIssue.fields &&
                  link.outwardIssue.fields.status &&
                  link.outwardIssue.fields.status.statusCategory
                    ? link.outwardIssue.fields.status.statusCategory.key || null
                    : null
              }
            : null
        }))
      : []
  };
}

/**
 * Fetches the current user profile and assigned unresolved issues from Jira.
 *
 * Executes both requests concurrently via Promise.all to minimize latency.
 *
 * @returns {Promise<Object>} Object containing user details and issues, or an error description.
 */
export async function fetchJiraDailyBriefingData(options = {}) {
  const requestJira =
    typeof options.requestJira === 'function'
      ? options.requestJira
      : (endpoint, init) => api.asUser().requestJira(endpoint, init);

  const jql = 'assignee = currentUser() AND resolution IS EMPTY ORDER BY duedate ASC, priority DESC';
  const fields = [
    'summary',
    'status',
    'priority',
    'duedate',
    'issuelinks',
    'project',
    'issuetype',
    'updated'
  ];

  try {
    // Execute both requests in parallel using the current user's security context (asUser)
    const [userResponse, searchResponse] = await Promise.all([
      requestJira(route`/rest/api/3/myself`),
      requestJira(route`/rest/api/3/search/jql`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jql: jql,
          fields: fields,
          maxResults: 50
        })
      })
    ]);

    // Handle unexpected user profile fetch errors
    if (!userResponse.ok) {
      console.error(`Jira API error (/rest/api/3/myself) - Status: ${userResponse.status}`);
      return {
        success: false,
        error: {
          message: 'Unable to retrieve user profile from Jira. Please check permissions.',
          code: 'USER_PROFILE_FETCH_FAILED'
        }
      };
    }

    // Handle unexpected search fetch errors
    if (!searchResponse.ok) {
      console.error(`Jira API error (/rest/api/3/search/jql) - Status: ${searchResponse.status}`);
      return {
        success: false,
        error: {
          message: 'Unable to retrieve assigned Jira tasks. Please check permissions.',
          code: 'SEARCH_JQL_FETCH_FAILED'
        }
      };
    }

    const userData = await userResponse.json();
    const searchData = await searchResponse.json();

    // Map and sanitize issues list
    const rawIssues = Array.isArray(searchData.issues) ? searchData.issues : [];
    const normalizedIssues = rawIssues.map(normalizeIssue);

    return {
      success: true,
      user: {
        displayName: userData.displayName || 'Team Member',
        timeZone: userData.timeZone || 'UTC',
        avatarUrl: userData.avatarUrls ? userData.avatarUrls['48x48'] : null
      },
      issues: normalizedIssues,
      metadata: {
        totalIssues: typeof searchData.total === 'number' ? searchData.total : normalizedIssues.length,
        retrievedAt: new Date().toISOString(),
        jql: jql
      }
    };
  } catch {
    // Keep server-side diagnostics free of raw exception details.
    console.error('[FocusBrief AI] Jira briefing data retrieval failed.');

    return {
      success: false,
      error: {
        message: 'An unexpected error occurred while communicating with Jira.',
        code: 'UNEXPECTED_ERROR'
      }
    };
  }
}

/**
 * Orchestrates Jira retrieval, deterministic briefing analysis, and supplementary
 * read-only Confluence knowledge retrieval.
 *
 * Safeguards:
 * - If Jira retrieval or briefing validation fails, returns the error unchanged
 *   without calling Confluence.
 * - Confluence failures degrade gracefully into `knowledge.status` without
 *   turning a successful Jira briefing into a failed response.
 *
 * @param {Object} [options={}] - Optional overrides for dependency injection or runtime context.
 * @returns {Promise<Object>} Analyzed daily briefing with `knowledge`, or Jira error payload.
 */
export async function handleGetDailyBriefing(options = {}) {
  const jiraResult = await fetchJiraDailyBriefingData(options);
  const briefing = buildDailyBriefing(jiraResult, options);

  if (!briefing || briefing.success !== true) {
    return briefing;
  }

  const knowledge = await fetchRelevantConfluenceDocs({
    briefing,
    resolverContext: options.resolverContext,
    withContext: options.withContext,
    confluenceContextAri: options.confluenceContextAri,
    getAppContext: options.getAppContext,
    referenceDate: options.referenceDate
  });

  return {
    ...briefing,
    knowledge
  };
}

/**
 * Resolver function: getDailyBriefing
 *
 * Primary entry point for FocusBrief AI daily briefing data retrieval and analysis.
 * Passes only Forge platform-provided `req.context` (never frontend `req.payload`).
 */
resolver.define('getDailyBriefing', async (req) => {
  return await handleGetDailyBriefing({
    resolverContext: req?.context
  });
});

/**
 * Resolver function: getJiraData
 *
 * Alias for fetching raw Jira briefing data.
 */
resolver.define('getJiraData', async () => {
  return await fetchJiraDailyBriefingData();
});

/**
 * Resolver function: getText
 *
 * Maintained for backward compatibility with the existing initial UI template.
 * Invoking getText now connects to Jira and returns an informative summary string.
 */
resolver.define('getText', async () => {
  const briefingData = await fetchJiraDailyBriefingData();
  if (briefingData.success) {
    return `Hello ${briefingData.user.displayName}! You have ${briefingData.issues.length} active Jira tasks assigned.`;
  }
  return 'Unable to load your Jira tasks. Please check your Jira access and try again.';
});

export const handler = resolver.getDefinitions();
