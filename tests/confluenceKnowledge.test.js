import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  NeedsAuthenticationError,
  ProductEndpointNotAllowedError,
  RequestProductNotAllowedError
} from '@forge/api';

import {
  resolveConfluenceContextAri,
  sanitizeCqlTerm,
  extractSearchSignals,
  buildConfluenceCql,
  sanitizeSearchText,
  buildSafeConfluenceUrl,
  normalizeConfluenceResult,
  rankAndDeduplicateDocs,
  fetchRelevantConfluenceDocs
} from '../src/resolvers/confluenceKnowledge.js';

import { handleGetDailyBriefing } from '../src/resolvers/index.js';

const CONFLUENCE_ARI = 'ari:cloud:confluence:site-123:workspace/act-456';
const JIRA_ARI = 'ari:cloud:jira:site-123:workspace/act-789';

function makeBriefing(overrides = {}) {
  return {
    success: true,
    user: { displayName: 'Alex', timeZone: 'UTC', avatarUrl: null },
    briefingDate: '2026-11-10',
    timeZone: 'UTC',
    summary: {
      totalActive: 2,
      overdueCount: 0,
      dueTodayCount: 1,
      approachingCount: 1,
      blockedCount: 0,
      blockingOthersCount: 0,
      completedExcludedCount: 0,
      headline: 'You have 2 active tasks (1 due today). Top focus: FB-1.'
    },
    recommendedActions: overrides.recommendedActions || [
      { rank: 1, actionType: 'focus', issueKey: 'FB-1', summary: 'Configure webhook retry queue', score: 68 }
    ],
    issues: overrides.issues || [
      {
        id: '1001',
        key: 'FB-1',
        summary: 'Configure webhook retry queue',
        project: { id: '1', key: 'FB', name: 'FocusBrief' },
        priority: { name: 'High' },
        status: { name: 'In Progress', category: 'In Progress', statusCategoryKey: 'indeterminate' },
        dueDate: '2026-11-10',
        score: 68
      },
      {
        id: '1002',
        key: 'PAY-14',
        summary: 'Audit OAuth token refresh flow',
        project: { id: '2', key: 'PAY', name: 'Payments Core' },
        priority: { name: 'Medium' },
        status: { name: 'To Do', category: 'To Do', statusCategoryKey: 'new' },
        dueDate: '2026-11-12',
        score: 40
      }
    ]
  };
}

describe('Confluence context ARI resolution and cross-product safety', () => {
  it('resolves valid Confluence context ARIs from resolver context, ContextAri objects, or AppContext', () => {
    assert.equal(
      resolveConfluenceContextAri({
        resolverContext: { installation: { contexts: [JIRA_ARI, CONFLUENCE_ARI] } }
      }),
      CONFLUENCE_ARI
    );

    const contextAriObject = { toString: () => CONFLUENCE_ARI };
    assert.equal(
      resolveConfluenceContextAri({
        getAppContext: () => ({ installation: { contexts: [{ toString: () => JIRA_ARI }, contextAriObject] } })
      }),
      CONFLUENCE_ARI
    );

    assert.equal(
      resolveConfluenceContextAri({
        resolverContext: {
          installation: {
            contexts: [{ resourceOwner: 'confluence', cloudId: 'site-1', workspaceId: 'ws-2' }]
          }
        }
      }),
      'ari:cloud:confluence:site-1:workspace/ws-2'
    );
  });

  it('returns null when only Jira context exists and never falls back to an unqualified request', async () => {
    const resolved = resolveConfluenceContextAri({
      resolverContext: { installation: { contexts: [JIRA_ARI] } },
      getAppContext: () => ({ installation: { contexts: [JIRA_ARI] } })
    });
    assert.equal(resolved, null);

    let withContextCalled = false;
    const result = await fetchRelevantConfluenceDocs({
      briefing: makeBriefing(),
      resolverContext: { installation: { contexts: [JIRA_ARI] } },
      getAppContext: () => null,
      withContext: () => {
        withContextCalled = true;
        return { requestConfluence: async () => { throw new Error('Should not be called'); } };
      }
    });

    assert.equal(withContextCalled, false);
    assert.equal(result.status, 'unavailable');
    assert.deepEqual(result.documents, []);
    assert.equal(result.metadata.returnedCount, 0);
  });
});

describe('Search signal extraction and CQL safety', () => {
  it('sanitizes CQL operators, quotes, and reserved words', () => {
    assert.equal(sanitizeCqlTerm('webhook "retry" (v2)'), 'webhook retry v2');
    assert.equal(sanitizeCqlTerm('AND'), '');
    assert.equal(sanitizeCqlTerm('or'), '');
    assert.equal(sanitizeCqlTerm('FB-1'), 'FB-1');
  });

  it('builds text-based CQL without assuming Jira project keys match Confluence space keys', () => {
    const signals = extractSearchSignals(makeBriefing());
    const cql = buildConfluenceCql(signals);

    assert.ok(cql);
    assert.match(cql, /^type = "page" AND \(/);
    assert.match(cql, /ORDER BY lastmodified DESC$/);
    assert.match(cql, /text ~ "FB-1"/);
    assert.match(cql, /text ~ "FocusBrief"/);
    assert.doesNotMatch(cql, /space\s*=/i);
    assert.ok(signals.queryTerms.length <= 6);
  });

  it('skips Confluence API calls cleanly when briefing has zero active issues', async () => {
    let callCount = 0;
    const result = await fetchRelevantConfluenceDocs({
      briefing: makeBriefing({ issues: [], recommendedActions: [] }),
      confluenceContextAri: CONFLUENCE_ARI,
      withContext: () => ({
        requestConfluence: async () => {
          callCount += 1;
          return { ok: true, status: 200, json: async () => ({ results: [] }) };
        }
      })
    });

    assert.equal(callCount, 0);
    assert.equal(result.status, 'skipped');
    assert.deepEqual(result.documents, []);
  });
});

describe('Confluence result normalization, sanitization, and URL safety', () => {
  it('strips HTML tags, highlight markers, and entities cleanly', () => {
    const cleaned = sanitizeSearchText('@@@hl@@@Webhook@@@endhl@@@ <b>retry</b> &amp; &quot;OAuth&quot; &#39;setup&#39;');
    assert.equal(cleaned, 'Webhook retry & "OAuth" \'setup\'');

    const longText = sanitizeSearchText('Word '.repeat(100), 50);
    assert.ok(longText.length <= 50);
    assert.ok(longText.endsWith('...'));
  });

  it('constructs safe HTTPS URLs without duplicating /wiki and blocks unsafe schemes', () => {
    assert.equal(
      buildSafeConfluenceUrl('/spaces/ENG/pages/123/Doc', 'https://team.atlassian.net/wiki'),
      'https://team.atlassian.net/wiki/spaces/ENG/pages/123/Doc'
    );
    assert.equal(
      buildSafeConfluenceUrl('/wiki/spaces/ENG/pages/123/Doc', 'https://team.atlassian.net/wiki/'),
      'https://team.atlassian.net/wiki/spaces/ENG/pages/123/Doc'
    );
    assert.equal(buildSafeConfluenceUrl('javascript:alert(1)', 'https://team.atlassian.net/wiki'), null);
    assert.equal(buildSafeConfluenceUrl('http://insecure.example.com/page', null), null);
  });

  it('normalizes Confluence search result entries cleanly', () => {
    const doc = normalizeConfluenceResult(
      {
        title: '@@@hl@@@FB-1@@@endhl@@@ Webhook Runbook',
        excerpt: 'Guide for <b>webhook</b> retries.',
        url: '/spaces/PLATFORM/pages/9001/Webhook+Runbook',
        lastModified: '2026-11-09T10:00:00.000Z',
        resultGlobalContainer: {
          title: 'Platform Engineering',
          displayUrl: '/spaces/PLATFORM'
        },
        content: {
          id: '9001',
          type: 'page',
          title: 'FB-1 Webhook Runbook'
        }
      },
      'https://team.atlassian.net/wiki'
    );

    assert.deepEqual(doc, {
      id: '9001',
      title: 'FB-1 Webhook Runbook',
      url: 'https://team.atlassian.net/wiki/spaces/PLATFORM/pages/9001/Webhook+Runbook',
      webUrlPath: '/spaces/PLATFORM/pages/9001/Webhook+Runbook',
      excerpt: 'Guide for webhook retries.',
      space: { key: 'PLATFORM', name: 'Platform Engineering' },
      lastModified: '2026-11-09T10:00:00.000Z'
    });
  });
});

describe('Deduplication, deterministic ranking, and 5-document cap', () => {
  it('deduplicates repeated IDs, ranks direct key matches highest, and caps output at 5 documents', () => {
    const signals = extractSearchSignals(makeBriefing());
    const refDate = new Date('2026-11-10T12:00:00.000Z');

    const docs = [
      normalizeConfluenceResult({ content: { id: '1', title: 'Generic Notes' }, excerpt: 'Unrelated snippet', url: '/spaces/A/pages/1' }),
      normalizeConfluenceResult({ content: { id: '2', title: 'Webhook Queue Design' }, excerpt: 'Retry strategies', url: '/spaces/A/pages/2' }),
      normalizeConfluenceResult({ content: { id: '3', title: 'FocusBrief Onboarding' }, excerpt: 'Overview', url: '/spaces/A/pages/3' }),
      normalizeConfluenceResult({ content: { id: '4', title: 'FB-1 Incident & Architecture' }, excerpt: 'Covers FB-1 webhook retry queue', url: '/spaces/A/pages/4', lastModified: '2026-11-09T09:00:00.000Z' }),
      // Duplicate of ID 4
      normalizeConfluenceResult({ content: { id: '4', title: 'FB-1 Incident & Architecture' }, excerpt: 'Duplicate', url: '/spaces/A/pages/4' }),
      normalizeConfluenceResult({ content: { id: '5', title: 'OAuth Refresh Token Flow' }, excerpt: 'Token guide', url: '/spaces/A/pages/5' }),
      normalizeConfluenceResult({ content: { id: '6', title: 'Payments Core Checklist' }, excerpt: 'Checklist', url: '/spaces/A/pages/6' }),
      normalizeConfluenceResult({ content: { id: '7', title: 'Legacy Webhook Notes' }, excerpt: 'Archive', url: '/spaces/A/pages/7' })
    ];

    const ranked = rankAndDeduplicateDocs(docs, signals, refDate);

    assert.equal(ranked.length, 5);
    assert.equal(ranked[0].id, '4');
    assert.deepEqual(ranked[0].matchedIssueKeys, ['FB-1']);
    assert.ok(ranked[0].reasons.includes('References active task FB-1'));
    assert.equal(ranked.filter((d) => d.id === '4').length, 1);
  });
});

describe('Confluence API call execution, error handling, and Jira independence', () => {
  it('executes one GET /wiki/rest/api/search call via withContext and returns top 5 ranked docs', async () => {
    const recordedCalls = [];
    const mockWithContext = (ari) => ({
      requestConfluence: async (endpointRoute, init) => {
        recordedCalls.push({ ari, routeValue: endpointRoute?.value, init });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            totalSize: 2,
            _links: { base: 'https://demo.atlassian.net/wiki' },
            results: [
              {
                title: 'FB-1 Retry Queue Design',
                excerpt: 'Details on <b>webhook</b> retry queue for FB-1.',
                url: '/spaces/ENG/pages/101/FB-1',
                lastModified: '2026-11-09T10:00:00.000Z',
                resultGlobalContainer: { title: 'Engineering', displayUrl: '/spaces/ENG' },
                content: { id: '101', title: 'FB-1 Retry Queue Design' }
              },
              {
                title: 'Payments Core Runbook',
                excerpt: 'OAuth refresh troubleshooting',
                url: '/spaces/PAY/pages/102/Runbook',
                lastModified: '2026-10-01T10:00:00.000Z',
                resultGlobalContainer: { title: 'Payments', displayUrl: '/spaces/PAY' },
                content: { id: '102', title: 'Payments Core Runbook' }
              }
            ]
          })
        };
      }
    });

    const knowledge = await fetchRelevantConfluenceDocs({
      briefing: makeBriefing(),
      resolverContext: { installation: { contexts: [JIRA_ARI, CONFLUENCE_ARI] } },
      withContext: mockWithContext,
      referenceDate: new Date('2026-11-10T12:00:00.000Z')
    });

    assert.equal(recordedCalls.length, 1);
    assert.equal(recordedCalls[0].ari, CONFLUENCE_ARI);
    assert.match(recordedCalls[0].routeValue, /^\/wiki\/rest\/api\/search\?/);
    assert.match(recordedCalls[0].routeValue, /limit=10/);
    assert.equal(recordedCalls[0].init?.method, undefined); // GET request
    assert.equal(knowledge.status, 'ok');
    assert.equal(knowledge.documents.length, 2);
    assert.equal(knowledge.documents[0].id, '101');
    assert.equal(knowledge.documents[0].url, 'https://demo.atlassian.net/wiki/spaces/ENG/pages/101/FB-1');
  });

  it('degrades gracefully across empty, 401/403, 404, 429, 500, malformed, and thrown Forge errors', async () => {
    const scenarios = [
      {
        name: 'empty results',
        mockResponse: { ok: true, status: 200, json: async () => ({ results: [] }) },
        expectedStatus: 'empty'
      },
      {
        name: '403 unauthorized',
        mockResponse: { ok: false, status: 403 },
        expectedStatus: 'unauthorized'
      },
      {
        name: '404 unavailable',
        mockResponse: { ok: false, status: 404 },
        expectedStatus: 'unavailable'
      },
      {
        name: '429 rate limited',
        mockResponse: { ok: false, status: 429 },
        expectedStatus: 'rate_limited'
      },
      {
        name: '500 server error',
        mockResponse: { ok: false, status: 500 },
        expectedStatus: 'error'
      },
      {
        name: 'malformed JSON without results array',
        mockResponse: { ok: true, status: 200, json: async () => ({ unexpected: true }) },
        expectedStatus: 'error'
      }
    ];

    for (const scenario of scenarios) {
      const result = await fetchRelevantConfluenceDocs({
        briefing: makeBriefing(),
        confluenceContextAri: CONFLUENCE_ARI,
        withContext: () => ({ requestConfluence: async () => scenario.mockResponse })
      });
      assert.equal(result.status, scenario.expectedStatus, `Failed scenario: ${scenario.name}`);
      assert.deepEqual(result.documents, []);
    }

    const thrownErrors = [
      { err: new RequestProductNotAllowedError('confluence', 'jira'), expected: 'unavailable' },
      { err: new ProductEndpointNotAllowedError('/wiki/rest/api/search'), expected: 'unavailable' },
      { err: new NeedsAuthenticationError('Auth needed', 'atlassian-token-service-key'), expected: 'unauthorized' },
      { err: new Error('ECONNRESET'), expected: 'error' }
    ];

    for (const item of thrownErrors) {
      const result = await fetchRelevantConfluenceDocs({
        briefing: makeBriefing(),
        confluenceContextAri: CONFLUENCE_ARI,
        withContext: () => ({
          requestConfluence: async () => {
            throw item.err;
          }
        })
      });
      assert.equal(result.status, item.expected);
      assert.deepEqual(result.documents, []);
    }
  });

  it('keeps Jira briefing successful when Confluence fails and skips Confluence when Jira fails', async () => {
    const mockSuccessJira = async (endpointRoute) => {
      const url = endpointRoute?.value || '';
      if (url.includes('/myself')) {
        return { ok: true, status: 200, json: async () => ({ displayName: 'Maya', timeZone: 'UTC' }) };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          total: 1,
          issues: [
            {
              id: '500',
              key: 'FB-7',
              fields: {
                summary: 'Investigate webhook timeout',
                status: { name: 'In Progress', statusCategory: { name: 'In Progress', key: 'indeterminate' } },
                priority: { name: 'High' },
                duedate: '2026-11-10',
                issuetype: { name: 'Bug', subtask: false },
                project: { id: '1', key: 'FB', name: 'FocusBrief' },
                updated: '2026-11-10T08:00:00.000Z',
                issuelinks: []
              }
            }
          ]
        })
      };
    };

    // Confluence returns 500 -> Jira briefing must STILL succeed with intact actions
    const resilientResult = await handleGetDailyBriefing({
      requestJira: mockSuccessJira,
      resolverContext: { installation: { contexts: [JIRA_ARI, CONFLUENCE_ARI] } },
      withContext: () => ({ requestConfluence: async () => ({ ok: false, status: 500 }) }),
      referenceDate: new Date('2026-11-10T09:00:00.000Z')
    });

    assert.equal(resilientResult.success, true);
    assert.equal(resilientResult.summary.totalActive, 1);
    assert.equal(resilientResult.recommendedActions[0].issueKey, 'FB-7');
    assert.equal(resilientResult.knowledge.status, 'error');
    assert.deepEqual(resilientResult.knowledge.documents, []);

    // Jira fails -> Confluence must NEVER be called and original error returns unchanged
    let confluenceCalled = false;
    const failedJiraResult = await handleGetDailyBriefing({
      requestJira: async (endpointRoute) => {
        if ((endpointRoute?.value || '').includes('/myself')) {
          return { ok: true, status: 200, json: async () => ({ displayName: 'Maya', timeZone: 'UTC' }) };
        }
        return { ok: false, status: 500 };
      },
      confluenceContextAri: CONFLUENCE_ARI,
      withContext: () => ({
        requestConfluence: async () => {
          confluenceCalled = true;
          return { ok: true, status: 200, json: async () => ({ results: [] }) };
        }
      })
    });

    assert.equal(confluenceCalled, false);
    assert.deepEqual(failedJiraResult, {
      success: false,
      error: {
        message: 'Unable to retrieve assigned Jira tasks. Please check permissions.',
        code: 'SEARCH_JQL_FETCH_FAILED'
      }
    });
  });
});
