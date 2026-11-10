import api, {
  getAppContext,
  route,
  NeedsAuthenticationError,
  ProductEndpointNotAllowedError,
  RequestProductNotAllowedError,
  InvalidWorkspaceRequestedError
} from '@forge/api';

/**
 * FocusBrief AI — Confluence Knowledge Integration
 *
 * Retrieves relevant read-only Confluence documentation for the current user's
 * active Jira tasks using `api.asUser().withContext(contextAri).requestConfluence()`.
 *
 * Safeguards:
 * - Strictly requires a valid Confluence installation context ARI; never makes
 *   unqualified cross-product calls when Confluence is disconnected.
 * - Executes at most 1 Confluence CQL search request per daily briefing.
 * - Does not assume Jira project keys match Confluence space keys.
 * - Strips HTML highlight tags from excerpts and validates safe URLs.
 * - Degrades gracefully on permission, rate-limit, or availability errors so the
 *   Jira daily briefing is never disrupted.
 */

const MAX_CONFLUENCE_SEARCH_LIMIT = 10;
const MAX_RETURNED_DOCUMENTS = 5;
const MAX_CQL_TERMS = 6;
const MAX_SOURCE_ISSUES = 6;
const MAX_EXCERPT_LENGTH = 260;
const MS_PER_DAY = 86400000;

/**
 * Common English and Jira workflow stop words excluded from keyword extraction.
 */
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'this', 'that', 'these', 'those',
  'your', 'our', 'are', 'was', 'were', 'will', 'can', 'has', 'have', 'had', 'not',
  'but', 'all', 'any', 'out', 'use', 'using', 'used', 'via', 'per', 'new', 'old',
  'fix', 'add', 'update', 'updated', 'create', 'created', 'remove', 'removed',
  'check', 'test', 'testing', 'implement', 'implemented', 'prepare', 'review',
  'task', 'tasks', 'issue', 'issues', 'story', 'bug', 'bugs', 'work', 'item',
  'items', 'page', 'pages', 'jira', 'user', 'users', 'data', 'need', 'needs',
  'should', 'make', 'been', 'being', 'about', 'after', 'before', 'when', 'where',
  'default', 'untitled'
]);

/**
 * Reserved CQL operators/keywords that should not be emitted as standalone terms.
 */
const CQL_RESERVED_WORDS = new Set([
  'and', 'or', 'not', 'in', 'is', 'null', 'empty', 'order', 'by', 'asc', 'desc'
]);

/**
 * Common HTML entity replacements for plain-text rendering in Forge UI Kit.
 */
const HTML_ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' '
};

/**
 * Safely calls Forge's getAppContext() without crashing when executed outside
 * the Forge Lambda runtime (such as offline unit tests).
 *
 * @returns {Object|null} AppContext object or null outside Forge runtime.
 */
function getAppContextSafely() {
  try {
    return getAppContext();
  } catch {
    return null;
  }
}

/**
 * Attempts to read a Confluence ARI string from a context entry (string, ContextAri, or object).
 *
 * @param {unknown} ctx - Context entry from Forge installation contexts or overrides.
 * @returns {string|null} Valid Confluence ARI string or null.
 */
function parseConfluenceAriCandidate(ctx) {
  if (!ctx) {
    return null;
  }

  let candidate = null;

  if (typeof ctx === 'string') {
    candidate = ctx;
  } else if (typeof ctx === 'object') {
    if (typeof ctx.ari === 'string') {
      candidate = ctx.ari;
    } else if (typeof ctx.id === 'string') {
      candidate = ctx.id;
    } else if (
      (ctx.resourceOwner === 'confluence' || ctx.product === 'confluence') &&
      typeof ctx.cloudId === 'string' &&
      ctx.cloudId.trim() !== '' &&
      typeof ctx.workspaceId === 'string' &&
      ctx.workspaceId.trim() !== ''
    ) {
      candidate = `ari:cloud:confluence:${ctx.cloudId.trim()}:workspace/${ctx.workspaceId.trim()}`;
    } else if (typeof ctx.toString === 'function') {
      const str = ctx.toString();
      if (str && str !== '[object Object]') {
        candidate = str;
      }
    }
  }

  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (/^ari:cloud:confluence:/i.test(trimmed)) {
      return trimmed;
    }
  }

  return null;
}

/**
 * Resolves a valid Confluence installation context ARI from explicit overrides,
 * resolver context, or Forge's runtime AppContext.
 *
 * @param {Object} [options={}] - Context options.
 * @returns {string|null} Confluence ARI string or null if Confluence context is unavailable.
 */
export function resolveConfluenceContextAri(options = {}) {
  const sources = [];

  if (options.confluenceContextAri) {
    sources.push(options.confluenceContextAri);
  }
  if (Array.isArray(options.resolverContext?.installation?.contexts)) {
    sources.push(...options.resolverContext.installation.contexts);
  }
  if (options.resolverContext?.installContext) {
    sources.push(options.resolverContext.installContext);
  }

  const appContextProvider =
    typeof options.getAppContext === 'function' ? options.getAppContext : getAppContextSafely;
  const appContext = appContextProvider();

  if (Array.isArray(appContext?.installation?.contexts)) {
    sources.push(...appContext.installation.contexts);
  }

  for (const entry of sources) {
    const validAri = parseConfluenceAriCandidate(entry);
    if (validAri) {
      return validAri;
    }
  }

  return null;
}

/**
 * Sanitizes a raw string before embedding it into a CQL text search clause.
 * Strips quotes, backslashes, and CQL operator characters to prevent query syntax errors.
 *
 * @param {string} rawTerm - Raw Jira key, project name, or summary keyword.
 * @returns {string} Cleaned term safe for quoted CQL text ~ "...".
 */
export function sanitizeCqlTerm(rawTerm) {
  if (typeof rawTerm !== 'string') {
    return '';
  }

  const cleaned = rawTerm
    .replace(/["'\\()[\]{}*?~:;^!&|<>=/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned || CQL_RESERVED_WORDS.has(cleaned.toLowerCase())) {
    return '';
  }

  return cleaned;
}

/**
 * Escapes special regular expression characters in a literal string.
 *
 * @param {string} value - Raw string.
 * @returns {string} Regex-escaped string.
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extracts Jira issue keys, project names, and meaningful summary keywords
 * from the prioritized briefing payload without assuming Jira project keys
 * correspond to Confluence space keys.
 *
 * @param {Object} briefing - Analyzed briefing returned by buildDailyBriefing().
 * @returns {{ issueKeys: string[], projectNames: string[], keywords: string[], queryTerms: string[] }}
 */
export function extractSearchSignals(briefing) {
  const allIssues = Array.isArray(briefing?.issues) ? briefing.issues : [];
  if (allIssues.length === 0) {
    return {
      issueKeys: [],
      projectNames: [],
      keywords: [],
      queryTerms: []
    };
  }

  // Prioritize issues surfaced in recommendedActions first, then remaining top-ranked issues
  const issueMap = new Map(allIssues.map((issue) => [issue.key, issue]));
  const prioritizedIssues = [];
  const seenKeys = new Set();

  const recommended = Array.isArray(briefing?.recommendedActions) ? briefing.recommendedActions : [];
  for (const action of recommended) {
    const matched = issueMap.get(action?.issueKey);
    if (matched && !seenKeys.has(matched.key)) {
      seenKeys.add(matched.key);
      prioritizedIssues.push(matched);
    }
  }

  for (const issue of allIssues) {
    if (prioritizedIssues.length >= MAX_SOURCE_ISSUES) {
      break;
    }
    if (issue?.key && !seenKeys.has(issue.key)) {
      seenKeys.add(issue.key);
      prioritizedIssues.push(issue);
    }
  }

  const issueKeys = [];
  const issueKeySet = new Set();
  const projectNames = [];
  const projectNameSet = new Set();
  const keywordCounts = new Map();

  for (const issue of prioritizedIssues) {
    const cleanKey = sanitizeCqlTerm(issue.key);
    if (cleanKey && !issueKeySet.has(cleanKey.toUpperCase())) {
      issueKeySet.add(cleanKey.toUpperCase());
      issueKeys.push(cleanKey);
    }

    const cleanProjectName = sanitizeCqlTerm(issue?.project?.name || '');
    if (cleanProjectName.length >= 2 && !projectNameSet.has(cleanProjectName.toLowerCase())) {
      projectNameSet.add(cleanProjectName.toLowerCase());
      projectNames.push(cleanProjectName);
    }

    // Tokenize summary into clean lowercase keywords excluding stop words and numbers
    const summaryTokens = sanitizeCqlTerm(issue?.summary || '')
      .toLowerCase()
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !/^\d+$/.test(token) && !STOP_WORDS.has(token));

    const uniqueSummaryTokens = new Set(summaryTokens);
    for (const token of uniqueSummaryTokens) {
      if (!issueKeySet.has(token.toUpperCase()) && !projectNameSet.has(token)) {
        keywordCounts.set(token, (keywordCounts.get(token) || 0) + 1);
      }
    }
  }

  const keywords = Array.from(keywordCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'en'))
    .map(([word]) => word);

  // Compose up to MAX_CQL_TERMS high-signal terms across keys, project names, and keywords
  const queryTerms = [];
  const addedLower = new Set();
  const addTerm = (term) => {
    const lower = term.toLowerCase();
    if (term && !addedLower.has(lower) && queryTerms.length < MAX_CQL_TERMS) {
      addedLower.add(lower);
      queryTerms.push(term);
    }
  };

  for (const key of issueKeys.slice(0, 3)) {
    addTerm(key);
  }
  for (const projName of projectNames.slice(0, 2)) {
    addTerm(projName);
  }
  for (const kw of keywords) {
    if (queryTerms.length >= MAX_CQL_TERMS) {
      break;
    }
    addTerm(kw);
  }

  return {
    issueKeys,
    projectNames,
    keywords: keywords.slice(0, 8),
    queryTerms
  };
}

/**
 * Builds a bounded Confluence Query Language (CQL) expression searching pages
 * by text/title match rather than assuming Jira project keys equal Confluence space keys.
 *
 * @param {{ queryTerms: string[] }} signals - Extracted signals from extractSearchSignals().
 * @returns {string|null} CQL query string or null if no valid query terms exist.
 */
export function buildConfluenceCql(signals) {
  const terms = Array.isArray(signals?.queryTerms) ? signals.queryTerms : [];
  const clauses = terms
    .map((term) => sanitizeCqlTerm(term))
    .filter((term) => term.length > 0)
    .map((term) => `text ~ "${term}"`);

  if (clauses.length === 0) {
    return null;
  }

  return `type = "page" AND (${clauses.join(' OR ')}) ORDER BY lastmodified DESC`;
}

/**
 * Strips Confluence search highlight markers and HTML tags into safe plain text.
 * Truncates long snippets cleanly for Forge UI Kit rendering.
 *
 * @param {string|null|undefined} rawText - Raw HTML/snippet string from Confluence search.
 * @param {number} [maxLength=MAX_EXCERPT_LENGTH] - Maximum character length (0 to skip truncation).
 * @returns {string} Clean plain text.
 */
export function sanitizeSearchText(rawText, maxLength = MAX_EXCERPT_LENGTH) {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    return '';
  }

  let plain = rawText
    .replace(/@@@hl@@@|@@@endhl@@@/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/gi, (match) => HTML_ENTITIES[match.toLowerCase()] || ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (maxLength > 0 && plain.length > maxLength) {
    plain = `${plain.slice(0, maxLength - 3).trimEnd()}...`;
  }

  return plain;
}

/**
 * Extracts a Confluence space key from a container displayUrl (e.g., "/spaces/ENG" -> "ENG").
 *
 * @param {string|undefined} displayUrl - resultGlobalContainer.displayUrl value.
 * @returns {string|null} Space key or null.
 */
function extractSpaceKeyFromUrl(displayUrl) {
  if (typeof displayUrl !== 'string') {
    return null;
  }
  const match = /\/spaces\/([^/?#]+)/i.exec(displayUrl);
  return match ? match[1] : null;
}

/**
 * Constructs a safe absolute HTTPS URL (or safe relative Confluence path) without
 * duplicating `/wiki` prefixes or allowing unsafe schemes like `javascript:`.
 *
 * @param {string|null|undefined} rawPath - Web path returned by Confluence search result.
 * @param {string|null|undefined} baseUrl - Root `_links.base` returned by Confluence search API.
 * @returns {string|null} Safe absolute or relative URL, or null if unsafe/missing.
 */
export function buildSafeConfluenceUrl(rawPath, baseUrl) {
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    return null;
  }

  const trimmedPath = rawPath.trim();

  // Block unsafe URI schemes
  if (/^(javascript|data|vbscript):/i.test(trimmedPath)) {
    return null;
  }

  if (/^https:\/\//i.test(trimmedPath)) {
    return trimmedPath;
  }

  if (/^http:\/\//i.test(trimmedPath)) {
    return null;
  }

  const normalizedPath = trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`;

  if (typeof baseUrl === 'string' && /^https:\/\//i.test(baseUrl.trim())) {
    const cleanBase = baseUrl.trim().replace(/\/+$/, '');
    // Avoid duplicating "/wiki" when base ends with "/wiki" and path starts with "/wiki/"
    if (cleanBase.endsWith('/wiki') && normalizedPath.startsWith('/wiki/')) {
      return `${cleanBase}${normalizedPath.slice(5)}`;
    }
    return `${cleanBase}${normalizedPath}`;
  }

  return normalizedPath;
}

/**
 * Normalizes a raw item from Confluence `/wiki/rest/api/search` `results[]`.
 *
 * @param {Object} rawResult - Single search result entry from Confluence.
 * @param {string|null} baseUrl - Root `_links.base` from Confluence search response.
 * @returns {Object|null} Normalized Confluence document object or null if invalid.
 */
export function normalizeConfluenceResult(rawResult, baseUrl = null) {
  if (!rawResult || typeof rawResult !== 'object') {
    return null;
  }

  const content = rawResult.content && typeof rawResult.content === 'object' ? rawResult.content : {};
  const id = content.id ? String(content.id) : null;
  const rawTitle = content.title || rawResult.title || 'Untitled Page';
  const title = sanitizeSearchText(rawTitle, 0) || 'Untitled Page';
  const rawWebPath = rawResult._links?.webui || rawResult.url || content._links?.webui || null;
  const webUrlPath =
    typeof rawWebPath === 'string' && rawWebPath.trim() && !/^(javascript|data|vbscript):/i.test(rawWebPath.trim())
      ? rawWebPath.trim()
      : null;

  const url = buildSafeConfluenceUrl(webUrlPath, baseUrl);
  const excerpt = sanitizeSearchText(rawResult.excerpt, MAX_EXCERPT_LENGTH);

  const spaceKey =
    content.space?.key || extractSpaceKeyFromUrl(rawResult.resultGlobalContainer?.displayUrl) || null;
  const spaceName = content.space?.name || rawResult.resultGlobalContainer?.title || null;
  const lastModified = rawResult.lastModified || content.version?.when || null;

  return {
    id,
    title,
    url,
    webUrlPath,
    excerpt,
    space: {
      key: spaceKey,
      name: spaceName
    },
    lastModified
  };
}

/**
 * Scores, deduplicates, sorts, and caps normalized Confluence documents
 * by deterministic relevance to the active Jira tasks.
 *
 * @param {Object[]} normalizedDocs - Array of normalized documents.
 * @param {{ issueKeys: string[], projectNames: string[], keywords: string[] }} signals - Jira context signals.
 * @param {Date} [referenceDate=new Date()] - Reference time for recency scoring.
 * @returns {Object[]} Up to MAX_RETURNED_DOCUMENTS ranked and deduplicated documents.
 */
export function rankAndDeduplicateDocs(normalizedDocs, signals, referenceDate = new Date()) {
  const validRefDate =
    referenceDate instanceof Date && !Number.isNaN(referenceDate.getTime()) ? referenceDate : new Date();
  const dedupMap = new Map();

  for (const doc of normalizedDocs) {
    if (!doc) {
      continue;
    }
    const dedupKey = doc.id || doc.webUrlPath || doc.url || doc.title.toLowerCase();
    if (!dedupMap.has(dedupKey)) {
      dedupMap.set(dedupKey, doc);
    }
  }

  const issueKeys = Array.isArray(signals?.issueKeys) ? signals.issueKeys : [];
  const projectNames = Array.isArray(signals?.projectNames) ? signals.projectNames : [];
  const keywords = Array.isArray(signals?.keywords) ? signals.keywords : [];

  const scoredDocs = [];

  for (const doc of dedupMap.values()) {
    const titleLower = doc.title.toLowerCase();
    const excerptLower = doc.excerpt.toLowerCase();
    let relevanceScore = 0;
    const matchedIssueKeys = [];
    const reasons = [];

    // 1. Direct Jira issue key matches (highest confidence)
    for (const key of issueKeys) {
      const keyPattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(key.toLowerCase())}([^a-z0-9]|$)`, 'i');
      const inTitle = keyPattern.test(titleLower);
      const inExcerpt = keyPattern.test(excerptLower);
      if (inTitle || inExcerpt) {
        matchedIssueKeys.push(key);
        relevanceScore += inTitle ? 60 : 50;
        reasons.push(`References active task ${key}`);
      }
    }

    // 2. Active Jira project name matches (checked in document text/title, not space key)
    for (const projName of projectNames) {
      const projPattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(projName.toLowerCase())}([^a-z0-9]|$)`, 'i');
      if (projPattern.test(titleLower)) {
        relevanceScore += 25;
        reasons.push(`Matches project '${projName}' in title`);
      } else if (projPattern.test(excerptLower)) {
        relevanceScore += 12;
        reasons.push(`Matches project '${projName}'`);
      }
    }

    // 3. Keyword matches from task summaries (capped to prevent keyword stuffing)
    let keywordPoints = 0;
    const matchedKeywords = [];
    for (const kw of keywords) {
      const kwPattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(kw.toLowerCase())}([^a-z0-9]|$)`, 'i');
      if (kwPattern.test(titleLower)) {
        keywordPoints = Math.min(30, keywordPoints + 15);
        matchedKeywords.push(kw);
      } else if (kwPattern.test(excerptLower)) {
        keywordPoints = Math.min(30, keywordPoints + 8);
        matchedKeywords.push(kw);
      }
    }
    if (matchedKeywords.length > 0) {
      relevanceScore += keywordPoints;
      reasons.push(`Matches topic(s): ${matchedKeywords.slice(0, 3).join(', ')}`);
    }

    // Fallback reason if Confluence matched full-text body outside the returned snippet
    if (reasons.length === 0) {
      relevanceScore += 5;
      reasons.push('Matched Confluence content search for active task context');
    }

    // 4. Recency boost
    let modifiedMs = 0;
    if (typeof doc.lastModified === 'string' && doc.lastModified.trim()) {
      const parsedMs = Date.parse(doc.lastModified);
      if (!Number.isNaN(parsedMs)) {
        modifiedMs = parsedMs;
        const ageDays = (validRefDate.getTime() - parsedMs) / MS_PER_DAY;
        if (ageDays >= -1 && ageDays <= 14) {
          relevanceScore += 10;
          reasons.push('Updated within last 14 days');
        } else if (ageDays > 14 && ageDays <= 60) {
          relevanceScore += 5;
          reasons.push('Updated within last 60 days');
        }
      }
    }

    scoredDocs.push({
      ...doc,
      relevanceScore: Math.min(100, relevanceScore),
      matchedIssueKeys,
      reasons,
      _modifiedMs: modifiedMs
    });
  }

  scoredDocs.sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    if (b.matchedIssueKeys.length !== a.matchedIssueKeys.length) {
      return b.matchedIssueKeys.length - a.matchedIssueKeys.length;
    }
    if (b._modifiedMs !== a._modifiedMs) {
      return b._modifiedMs - a._modifiedMs;
    }
    const titleCompare = a.title.localeCompare(b.title, 'en', { sensitivity: 'base' });
    if (titleCompare !== 0) {
      return titleCompare;
    }
    return String(a.id || '').localeCompare(String(b.id || ''), 'en', { numeric: true });
  });

  return scoredDocs.slice(0, MAX_RETURNED_DOCUMENTS).map(({ _modifiedMs, ...cleanDoc }) => cleanDoc);
}

/**
 * Helper to construct a consistent knowledge payload for degraded/empty states.
 */
function buildKnowledgeResult(status, message, documents = [], queryTermsUsed = [], totalFound = 0) {
  return {
    status,
    message,
    documents,
    metadata: {
      queryTermsUsed,
      totalFound,
      returnedCount: documents.length
    }
  };
}

/**
 * Fetches relevant read-only Confluence documentation for an analyzed Jira briefing.
 *
 * Enforces cross-product safety:
 * - Resolves a valid Confluence installation context ARI and uses `api.asUser().withContext(ari)`.
 * - Never makes an unqualified fallback call if no Confluence context exists.
 * - Executes at most 1 request (`GET /wiki/rest/api/search`) and returns at most 5 documents.
 *
 * @param {Object} [options={}] - Inputs and optional test dependency overrides.
 * @returns {Promise<Object>} Standardized `knowledge` section for the briefing payload.
 */
export async function fetchRelevantConfluenceDocs(options = {}) {
  const contextAri = resolveConfluenceContextAri(options);
  if (!contextAri) {
    return buildKnowledgeResult(
      'unavailable',
      'Confluence documentation is unavailable because no Confluence installation context is connected.'
    );
  }

  const signals = extractSearchSignals(options.briefing);
  const cql = buildConfluenceCql(signals);
  if (!cql) {
    return buildKnowledgeResult(
      'skipped',
      'No active Jira task keywords were available for Confluence search.'
    );
  }

  try {
    const confluenceClient =
      typeof options.withContext === 'function'
        ? options.withContext(contextAri)
        : api.asUser().withContext(contextAri);

    const searchParams = new URLSearchParams({
      cql,
      limit: String(MAX_CONFLUENCE_SEARCH_LIMIT),
      excerpt: 'indexed'
    });

    const response = await confluenceClient.requestConfluence(
      route`/wiki/rest/api/search?${searchParams}`,
      {
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    if (!response || !response.ok) {
      const statusCode = response ? response.status : 0;
      console.warn(`Confluence search API non-OK response - Status: ${statusCode}`);

      if (statusCode === 401 || statusCode === 403) {
        return buildKnowledgeResult(
          'unauthorized',
          'You do not have permission to search Confluence documentation.',
          [],
          signals.queryTerms
        );
      }
      if (statusCode === 404) {
        return buildKnowledgeResult(
          'unavailable',
          'Confluence search is unavailable on this site.',
          [],
          signals.queryTerms
        );
      }
      if (statusCode === 429) {
        return buildKnowledgeResult(
          'rate_limited',
          'Confluence search is temporarily rate-limited. Please try again shortly.',
          [],
          signals.queryTerms
        );
      }
      return buildKnowledgeResult(
        'error',
        'Unable to retrieve Confluence documentation right now.',
        [],
        signals.queryTerms
      );
    }

    const searchData = await response.json();
    const rawResults = Array.isArray(searchData?.results) ? searchData.results : null;

    if (!rawResults) {
      console.warn('Confluence search returned malformed payload without results array.');
      return buildKnowledgeResult(
        'error',
        'Confluence returned an unexpected search response.',
        [],
        signals.queryTerms
      );
    }

    if (rawResults.length === 0) {
      return buildKnowledgeResult(
        'empty',
        'No matching Confluence documentation was found for your active tasks.',
        [],
        signals.queryTerms,
        0
      );
    }

    const baseUrl = searchData?._links?.base || null;
    const normalizedDocs = rawResults
      .map((item) => normalizeConfluenceResult(item, baseUrl))
      .filter(Boolean);

    const rankedDocs = rankAndDeduplicateDocs(normalizedDocs, signals, options.referenceDate);

    if (rankedDocs.length === 0) {
      return buildKnowledgeResult(
        'empty',
        'No matching Confluence documentation was found for your active tasks.',
        [],
        signals.queryTerms,
        0
      );
    }

    const totalFound =
      typeof searchData?.totalSize === 'number' ? searchData.totalSize : normalizedDocs.length;

    return buildKnowledgeResult('ok', null, rankedDocs, signals.queryTerms, totalFound);
  } catch (err) {
    console.error('Confluence knowledge retrieval failed:', err);

    if (err instanceof NeedsAuthenticationError || err?.name === 'NeedsAuthenticationError') {
      return buildKnowledgeResult(
        'unauthorized',
        'Confluence authorization is required for your account.',
        [],
        signals.queryTerms
      );
    }

    if (
      err instanceof RequestProductNotAllowedError ||
      err instanceof ProductEndpointNotAllowedError ||
      err instanceof InvalidWorkspaceRequestedError ||
      err?.name === 'RequestProductNotAllowedError' ||
      err?.name === 'ProductEndpointNotAllowedError' ||
      err?.name === 'InvalidWorkspaceRequestedError'
    ) {
      return buildKnowledgeResult(
        'unavailable',
        'Confluence documentation is unavailable in the current installation context.',
        [],
        signals.queryTerms
      );
    }

    if (err?.status === 429) {
      return buildKnowledgeResult(
        'rate_limited',
        'Confluence search is temporarily rate-limited. Please try again shortly.',
        [],
        signals.queryTerms
      );
    }

    return buildKnowledgeResult(
      'error',
      'Unable to retrieve Confluence documentation right now.',
      [],
      signals.queryTerms
    );
  }
}
