import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeColorMode,
  formatJiraThemeLabel,
  getThemeSurfacePalette,
  formatBriefingDate,
  formatTimestampInTimeZone,
  getDeadlineAppearance,
  getStatusAppearance,
  getScorePresentation,
  filterIssues,
  deriveRecentSignals,
  getTruncationDisclosure,
  clampTablePage,
  buildUrgentAlertItems,
  getKnowledgeStatusConfig,
  isSafeHttpsUrl,
  getSafeConfluenceTarget,
  openJiraIssueWithRouter,
  openConfluenceDocWithRouter,
  findIssueByKey
} from '../src/frontend/briefingViewHelpers.js';

function createSampleIssues() {
  return [
    {
      id: '101',
      key: 'FB-1',
      summary: 'Fix production payment webhook timeout',
      status: { name: 'In Progress', category: 'In Progress', statusCategoryKey: 'indeterminate' },
      priority: { name: 'Highest', iconUrl: null },
      project: { id: 'p1', key: 'FB', name: 'FocusBrief' },
      updated: '2026-11-10T09:00:00.000Z',
      score: 92,
      reasons: ['Priority is Highest', 'Overdue by 2 days', 'Blocks 1 active task (FB-2)'],
      deadline: { status: 'overdue', dueDate: '2026-11-08', daysUntilDue: -2, daysOverdue: 2, label: 'Overdue by 2 days' },
      blocker: {
        isBlocked: false,
        statusBlocked: false,
        blockedBy: [],
        blockedByKeys: [],
        blocksOthers: [{ key: 'FB-2', summary: 'Deploy billing UI', status: 'To Do', relation: 'blocks' }],
        blocksOthersKeys: ['FB-2'],
        reasons: []
      }
    },
    {
      id: '102',
      key: 'FB-2',
      summary: 'Deploy billing UI behind feature flag',
      status: { name: 'Blocked', category: 'To Do', statusCategoryKey: 'new' },
      priority: { name: 'High', iconUrl: null },
      project: { id: 'p1', key: 'FB', name: 'FocusBrief' },
      updated: '2026-11-05T14:00:00.000Z',
      score: 48,
      reasons: ['Priority is High', 'Due today', 'Blocked by FB-1'],
      deadline: { status: 'due_today', dueDate: '2026-11-10', daysUntilDue: 0, daysOverdue: 0, label: 'Due today' },
      blocker: {
        isBlocked: true,
        statusBlocked: true,
        blockedBy: [{ key: 'FB-1', summary: 'Fix production payment webhook timeout', status: 'In Progress', relation: 'is blocked by' }],
        blockedByKeys: ['FB-1'],
        blocksOthers: [],
        blocksOthersKeys: [],
        reasons: ['Blocked by FB-1', "Status is 'Blocked'"]
      }
    },
    {
      id: '103',
      key: 'OPS-9',
      summary: 'Audit Confluence onboarding runbook',
      status: { name: 'To Do', category: 'To Do', statusCategoryKey: 'new' },
      priority: { name: 'Low', iconUrl: null },
      project: { id: 'p2', key: 'OPS', name: 'Operations' },
      updated: '2026-10-15T11:30:00.000Z',
      score: 16,
      reasons: ['Priority is Low', 'Due in 3 days'],
      deadline: { status: 'approaching', dueDate: '2026-11-13', daysUntilDue: 3, daysOverdue: 0, label: 'Due in 3 days' },
      blocker: {
        isBlocked: false,
        statusBlocked: false,
        blockedBy: [],
        blockedByKeys: [],
        blocksOthers: [],
        blocksOthersKeys: [],
        reasons: []
      }
    }
  ];
}

test('getThemeSurfacePalette uses valid ADS semantic tokens for both Jira light and dark host modes', () => {
  const expectedSemanticTokens = {
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

  const lightPalette = getThemeSurfacePalette('light');
  assert.equal(lightPalette.hostColorMode, 'light');
  assert.equal(lightPalette.themeLabel, 'Jira Theme: Light');
  for (const [key, token] of Object.entries(expectedSemanticTokens)) {
    assert.equal(lightPalette[key], token);
    assert.equal(typeof lightPalette[key], 'string');
  }
  assert.equal('isCustomOverride' in lightPalette, false);
  assert.equal('effectiveColorMode' in lightPalette, false);

  const darkPalette = getThemeSurfacePalette('dark');
  assert.equal(darkPalette.hostColorMode, 'dark');
  assert.equal(darkPalette.themeLabel, 'Jira Theme: Dark');
  for (const [key, token] of Object.entries(expectedSemanticTokens)) {
    assert.equal(darkPalette[key], token);
    assert.equal(typeof darkPalette[key], 'string');
  }
  assert.equal('isCustomOverride' in darkPalette, false);
  assert.equal('effectiveColorMode' in darkPalette, false);

  // Any extra legacy override argument is ignored; surfaces stay synced with Jira host
  const ignoredOverrideLight = getThemeSurfacePalette('light', 'dark');
  assert.equal(ignoredOverrideLight.hostColorMode, 'light');
  assert.equal(ignoredOverrideLight.themeLabel, 'Jira Theme: Light');
  assert.equal(ignoredOverrideLight.cardBg, 'elevation.surface.raised');
  assert.equal(ignoredOverrideLight.borderColor, 'color.border');

  const ignoredOverrideDark = getThemeSurfacePalette('dark', 'light');
  assert.equal(ignoredOverrideDark.hostColorMode, 'dark');
  assert.equal(ignoredOverrideDark.themeLabel, 'Jira Theme: Dark');
  assert.equal(ignoredOverrideDark.cardBg, 'elevation.surface.raised');
  assert.equal(ignoredOverrideDark.borderColor, 'color.border');
});

test('normalizeColorMode, formatJiraThemeLabel, and getThemeSurfacePalette handle host mode changes and fallbacks', () => {
  // Explicit host modes and case/whitespace variants
  assert.equal(normalizeColorMode('light'), 'light');
  assert.equal(normalizeColorMode('LIGHT'), 'light');
  assert.equal(normalizeColorMode(' light '), 'light');
  assert.equal(normalizeColorMode('dark'), 'dark');
  assert.equal(normalizeColorMode('DARK'), 'dark');
  assert.equal(normalizeColorMode(' dark '), 'dark');
  assert.equal(normalizeColorMode({ colorMode: 'dark' }), 'dark');
  assert.equal(normalizeColorMode({ colorMode: 'light' }), 'light');

  assert.equal(formatJiraThemeLabel('light'), 'Jira Theme: Light');
  assert.equal(formatJiraThemeLabel('LIGHT'), 'Jira Theme: Light');
  assert.equal(formatJiraThemeLabel('  light  '), 'Jira Theme: Light');
  assert.equal(formatJiraThemeLabel({ colorMode: ' Light ' }), 'Jira Theme: Light');

  assert.equal(formatJiraThemeLabel('dark'), 'Jira Theme: Dark');
  assert.equal(formatJiraThemeLabel('DARK'), 'Jira Theme: Dark');
  assert.equal(formatJiraThemeLabel('  dark  '), 'Jira Theme: Dark');
  assert.equal(formatJiraThemeLabel({ colorMode: ' Dark ' }), 'Jira Theme: Dark');

  // Unresolved, missing, or unrecognized host themes show Syncing while keeping valid ADS tokens
  assert.equal(formatJiraThemeLabel(), 'Jira Theme: Syncing...');
  const noArgPalette = getThemeSurfacePalette();
  assert.equal(noArgPalette.hostColorMode, 'light');
  assert.equal(noArgPalette.themeLabel, 'Jira Theme: Syncing...');
  assert.equal(noArgPalette.pageBg, 'elevation.surface.sunken');
  assert.equal(noArgPalette.cardBg, 'elevation.surface.raised');
  assert.equal(noArgPalette.borderColor, 'color.border');

  for (const fallbackInput of [
    null,
    undefined,
    '',
    '   ',
    'auto',
    'high-contrast',
    'unknown',
    {},
    { colorMode: null },
    { colorMode: undefined },
    { colorMode: 'auto' },
    42
  ]) {
    assert.equal(normalizeColorMode(fallbackInput), 'light');
    assert.equal(formatJiraThemeLabel(fallbackInput), 'Jira Theme: Syncing...');
    const fallbackPalette = getThemeSurfacePalette(fallbackInput);
    assert.equal(fallbackPalette.hostColorMode, 'light');
    assert.equal(fallbackPalette.themeLabel, 'Jira Theme: Syncing...');
    assert.equal(fallbackPalette.pageBg, 'elevation.surface.sunken');
    assert.equal(fallbackPalette.cardBg, 'elevation.surface.raised');
    assert.equal(fallbackPalette.subtleCardBg, 'elevation.surface');
    assert.equal(fallbackPalette.hostSurfaceBg, 'elevation.surface');
    assert.equal(fallbackPalette.borderColor, 'color.border');
    assert.equal(fallbackPalette.headingColor, 'color.text');
    assert.equal(fallbackPalette.textColor, 'color.text');
    assert.equal(fallbackPalette.subduedTextColor, 'color.text.subtle');
    assert.equal(fallbackPalette.iconColor, 'color.icon');
    assert.equal(fallbackPalette.buttonAppearance, 'default');
  }

  // Simulated Jira host theme load and transitions update indicator label accurately
  const sequence = [null, 'dark', 'light', 'dark'].map((mode) => ({
    palette: getThemeSurfacePalette(mode),
    label: formatJiraThemeLabel(mode)
  }));
  assert.equal(sequence[0].label, 'Jira Theme: Syncing...');
  assert.equal(sequence[0].palette.themeLabel, 'Jira Theme: Syncing...');
  assert.equal(sequence[0].palette.hostColorMode, 'light');
  assert.equal(sequence[0].palette.cardBg, 'elevation.surface.raised');
  assert.equal(sequence[1].label, 'Jira Theme: Dark');
  assert.equal(sequence[1].palette.themeLabel, 'Jira Theme: Dark');
  assert.equal(sequence[1].palette.hostColorMode, 'dark');
  assert.equal(sequence[2].label, 'Jira Theme: Light');
  assert.equal(sequence[2].palette.themeLabel, 'Jira Theme: Light');
  assert.equal(sequence[2].palette.hostColorMode, 'light');
  assert.equal(sequence[3].label, 'Jira Theme: Dark');
  assert.equal(sequence[3].palette.themeLabel, 'Jira Theme: Dark');
  assert.equal(sequence[3].palette.hostColorMode, 'dark');
});

test('theme synchronization uses valid ADS tokens and removes independent override state across modified files', () => {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(testDir, '..');

  const activeTokensSrc = fs.readFileSync(
    path.join(projectRoot, 'node_modules/@atlaskit/tokens/dist/types/artifacts/types.d.ts'),
    'utf8'
  );
  const forgeTokensSrc = fs.readFileSync(
    path.join(
      projectRoot,
      'node_modules/@atlaskit/forge-react-types/dist/types/components/__generated__/tokens.codegen.d.ts'
    ),
    'utf8'
  );

  for (const mode of ['light', 'dark', null, undefined, 'auto']) {
    const palette = getThemeSurfacePalette(mode);
    const tokenFields = [
      'pageBg',
      'cardBg',
      'subtleCardBg',
      'hostSurfaceBg',
      'borderColor',
      'headingColor',
      'textColor',
      'subduedTextColor',
      'iconColor'
    ];
    for (const field of tokenFields) {
      const value = palette[field];
      assert.equal(typeof value, 'string', `${field} must be a string token`);
      assert.equal(/#[0-9a-f]{3,8}/i.test(value), false, `${field} must not be a hex color`);
      assert.equal(
        activeTokensSrc.includes(`'${value}'`),
        true,
        `${field} token '${value}' must exist in @atlaskit/tokens ActiveTokens`
      );
    }
    assert.equal(
      forgeTokensSrc.includes(`'${palette.borderColor}'`),
      true,
      `borderColor token '${palette.borderColor}' must exist in Forge xcss tokensMap`
    );
  }

  const indexSrc = fs.readFileSync(path.join(projectRoot, 'src/frontend/index.jsx'), 'utf8');
  assert.match(indexSrc, /\buseTheme\b/);
  assert.match(indexSrc, /getThemeSurfacePalette\(hostTheme\?\.colorMode\)/);
  assert.equal(/view\.theme\.enable/.test(indexSrc), false);
  assert.equal(/themeOverride|handleToggleTheme|handleResetTheme|onToggleTheme|onResetTheme/.test(indexSrc), false);
  for (const section of [
    'DashboardHeader',
    'OverviewSection',
    'PrioritiesSection',
    'BlockerRadarSection',
    'RecentSignalsSection',
    'ConfluenceKnowledgeSection'
  ]) {
    assert.match(indexSrc, new RegExp(`<${section}[\\s\\S]*?palette=\\{palette\\}`));
  }

  const headerSrc = fs.readFileSync(
    path.join(projectRoot, 'src/frontend/components/DashboardHeader.jsx'),
    'utf8'
  );
  assert.equal(/\bToggle\b/.test(headerSrc), false);
  assert.equal(/onToggleTheme|onResetTheme|isCustomOverride|effectiveColorMode|theme-toggle|theme-reset-button/.test(headerSrc), false);
  assert.equal(/hostColorMode/.test(headerSrc), false);
  assert.match(headerSrc, /activePalette\.themeLabel/);
  assert.match(headerSrc, /jira-theme-indicator/);

  const helpersSrc = fs.readFileSync(
    path.join(projectRoot, 'src/frontend/briefingViewHelpers.js'),
    'utf8'
  );
  assert.equal(/#[0-9a-f]{3,8}/i.test(helpersSrc), false);
  assert.equal(/userOverride|isCustomOverride|effectiveColorMode/.test(helpersSrc), false);
});

test('formatBriefingDate and formatTimestampInTimeZone handle valid and invalid dates safely', () => {
  assert.equal(formatBriefingDate('2026-11-10'), 'Tue, Nov 10, 2026');
  assert.equal(formatBriefingDate('2026-02-30'), '2026-02-30');
  assert.equal(formatBriefingDate(null), 'Today');

  const formattedUtc = formatTimestampInTimeZone('2026-11-10T10:30:00.000Z', 'UTC');
  assert.ok(formattedUtc.includes('Nov 10'));
  assert.equal(formatTimestampInTimeZone('not-a-date', 'America/New_York'), 'Unavailable');
  // Invalid timezone safely falls back to UTC rather than throwing
  const fallbackTz = formatTimestampInTimeZone('2026-11-10T10:30:00.000Z', 'Invalid/Timezone');
  assert.ok(fallbackTz.includes('Nov 10'));
});

test('status, deadline, and score presentation helpers return valid Forge UI Kit appearances', () => {
  assert.equal(getDeadlineAppearance('overdue'), 'danger');
  assert.equal(getDeadlineAppearance('due_today'), 'warning');
  assert.equal(getDeadlineAppearance('approaching'), 'information');
  assert.equal(getDeadlineAppearance('none'), 'neutral');

  assert.equal(getStatusAppearance('done', 'To Do'), 'success');
  assert.equal(getStatusAppearance('indeterminate', 'In Progress'), 'information');
  assert.equal(getStatusAppearance(null, 'In Progress'), 'information');
  assert.equal(getStatusAppearance('new', 'To Do'), 'neutral');

  assert.equal(getScorePresentation(85).badgeAppearance, 'danger');
  assert.equal(getScorePresentation(50).badgeAppearance, 'important');
  assert.equal(getScorePresentation(20).badgeAppearance, 'default');
  assert.equal(getScorePresentation(85).progressAppearance, 'default');
});

test('filterIssues supports category filters, search text, and preserves sort order', () => {
  const issues = createSampleIssues();

  assert.deepEqual(
    filterIssues(issues, 'actionable', '').map((i) => i.key),
    ['FB-1', 'OPS-9']
  );
  assert.deepEqual(
    filterIssues(issues, 'blocked', '').map((i) => i.key),
    ['FB-2']
  );
  assert.deepEqual(
    filterIssues(issues, 'blocking_others', '').map((i) => i.key),
    ['FB-1']
  );
  assert.deepEqual(
    filterIssues(issues, 'urgent', '').map((i) => i.key),
    ['FB-1', 'FB-2', 'OPS-9']
  );
  assert.deepEqual(
    filterIssues(issues, 'all', 'runbook').map((i) => i.key),
    ['OPS-9']
  );
  assert.deepEqual(
    filterIssues(issues, 'all', 'operations').map((i) => i.key),
    ['OPS-9']
  );
});

test('deriveRecentSignals computes non-fabricated recency stats strictly from Jira timestamps', () => {
  const issues = createSampleIssues();
  const briefing = {
    success: true,
    summary: { completedExcludedCount: 2 },
    issues,
    metadata: {
      retrievedAt: '2026-11-10T12:00:00.000Z',
      analyzedAt: '2026-11-10T12:00:00.000Z'
    }
  };

  const signals = deriveRecentSignals(briefing);
  assert.equal(signals.hasHistoricalComparison, false);
  assert.equal(signals.completedExcludedCount, 2);
  assert.equal(signals.updatedLast24HoursCount, 1);
  assert.equal(signals.updatedLast7DaysCount, 2);
  assert.deepEqual(
    signals.recentlyUpdatedIssues.map((item) => item.key),
    ['FB-1', 'FB-2', 'OPS-9']
  );
  assert.equal(signals.recentlyUpdatedIssues[0].recencyBucket, 'last_24h');
  assert.equal(signals.recentlyUpdatedIssues[1].recencyBucket, 'last_7d');
  assert.equal(signals.recentlyUpdatedIssues[2].recencyBucket, 'earlier');
});

test('getTruncationDisclosure discloses when 50-issue Jira retrieval cap truncates results', () => {
  const fiftyIssues = Array.from({ length: 50 }, (_, idx) => ({ key: `FB-${idx + 1}` }));
  const truncated = getTruncationDisclosure({
    success: true,
    issues: fiftyIssues,
    summary: { completedExcludedCount: 0 },
    metadata: { totalIssues: 73 }
  });

  assert.equal(truncated.isTruncated, true);
  assert.equal(truncated.displayedCount, 50);
  assert.equal(truncated.totalIssues, 73);
  assert.ok(truncated.message.includes('50'));
  assert.ok(truncated.message.includes('73'));

  const atLimitFallback = getTruncationDisclosure({
    success: true,
    issues: fiftyIssues,
    summary: { completedExcludedCount: 0 },
    metadata: { totalIssues: 50 }
  });
  assert.equal(atLimitFallback.isTruncated, true);
  assert.ok(atLimitFallback.message.includes('50'));

  const notTruncated = getTruncationDisclosure({
    success: true,
    issues: [{ key: 'FB-1' }],
    summary: { completedExcludedCount: 0 },
    metadata: { totalIssues: 1 }
  });
  assert.equal(notTruncated.isTruncated, false);
  assert.equal(notTruncated.message, null);
});

test('getKnowledgeStatusConfig handles all 7 Confluence states cleanly', () => {
  const okWithDocs = getKnowledgeStatusConfig({
    status: 'ok',
    message: null,
    documents: [{ id: '1', title: 'Webhook Runbook' }],
    metadata: { queryTermsUsed: ['webhook'], totalFound: 3, returnedCount: 1 }
  });
  assert.equal(okWithDocs.status, 'ok');
  assert.equal(okWithDocs.hasDocuments, true);

  for (const status of ['empty', 'skipped', 'unauthorized', 'unavailable', 'rate_limited', 'error']) {
    const result = getKnowledgeStatusConfig({
      status,
      message: `Custom message for ${status}`,
      documents: [],
      metadata: { queryTermsUsed: ['auth'], totalFound: 0, returnedCount: 0 }
    });
    assert.equal(result.status, status);
    assert.equal(result.hasDocuments, false);
    assert.equal(result.message, `Custom message for ${status}`);
  }
});

test('URL safety validators and router helpers block unsafe URLs and navigate safely', async () => {
  assert.equal(isSafeHttpsUrl('https://example.atlassian.net/avatar.png'), true);
  assert.equal(isSafeHttpsUrl('http://insecure.example.com/a.png'), false);
  assert.equal(isSafeHttpsUrl('javascript:alert(1)'), false);

  assert.equal(getSafeConfluenceTarget({ url: 'https://site.atlassian.net/wiki/spaces/ENG/pages/1' }), 'https://site.atlassian.net/wiki/spaces/ENG/pages/1');
  assert.equal(getSafeConfluenceTarget({ webUrlPath: '/wiki/spaces/ENG/pages/2' }), '/wiki/spaces/ENG/pages/2');
  assert.equal(getSafeConfluenceTarget({ url: '//evil.example.com/phish' }), null);
  assert.equal(getSafeConfluenceTarget({ url: 'javascript:alert(1)' }), null);

  const openedLocations = [];
  const mockRouter = {
    open: async (loc) => {
      openedLocations.push(loc);
    }
  };

  assert.equal(await openJiraIssueWithRouter('FB-42', mockRouter), true);
  assert.deepEqual(openedLocations[0], { target: 'issue', issueKey: 'FB-42' });
  assert.equal(await openJiraIssueWithRouter('', mockRouter), false);

  assert.equal(
    await openConfluenceDocWithRouter({ url: 'https://site.atlassian.net/wiki/spaces/ENG/pages/1' }, mockRouter),
    true
  );
  assert.equal(openedLocations[1], 'https://site.atlassian.net/wiki/spaces/ENG/pages/1');
  assert.equal(await openConfluenceDocWithRouter({ url: 'javascript:alert(1)' }, mockRouter), false);

  assert.equal(findIssueByKey(createSampleIssues(), 'fb-2')?.key, 'FB-2');
  assert.equal(findIssueByKey(createSampleIssues(), 'MISSING-1'), null);
});

test('clampTablePage keeps pagination within valid bounds when filtered issues shrink', () => {
  // User is on page 3 with 25 issues (rowsPerPage = 10 -> 3 pages)
  assert.equal(clampTablePage(3, 25, 10), 3);

  // After refresh, count shrinks to 15 issues (2 pages) -> clamped to page 2
  assert.equal(clampTablePage(3, 15, 10), 2);

  // Count shrinks to 7 issues (1 page) -> clamped to page 1
  assert.equal(clampTablePage(3, 7, 10), 1);

  // Empty list or invalid lower bounds always clamp to page 1
  assert.equal(clampTablePage(4, 0, 10), 1);
  assert.equal(clampTablePage(0, 20, 10), 1);
  assert.equal(clampTablePage(-2, 20, 10), 1);
});

test('buildUrgentAlertItems includes approaching alerts with distinct label and appearance', () => {
  const alerts = {
    overdue: [{ key: 'FB-1', summary: 'Overdue task', message: 'FB-1 is overdue.' }],
    dueToday: [{ key: 'FB-2', summary: 'Due today task', message: 'FB-2 is due today.' }],
    blocked: [{ key: 'FB-3', summary: 'Blocked task', message: 'FB-3 is blocked.' }],
    approaching: [{ key: 'FB-4', summary: 'Approaching task', message: 'FB-4 is due in 2 days.' }]
  };

  const items = buildUrgentAlertItems(alerts, 8);
  assert.equal(items.length, 4);

  const labelsByKey = Object.fromEntries(
    items.map((item) => [item.key, { categoryLabel: item.categoryLabel, appearance: item.appearance }])
  );

  assert.deepEqual(labelsByKey['FB-1'], { categoryLabel: 'Overdue', appearance: 'danger' });
  assert.deepEqual(labelsByKey['FB-2'], { categoryLabel: 'Due Today', appearance: 'warning' });
  assert.deepEqual(labelsByKey['FB-3'], { categoryLabel: 'Blocked', appearance: 'removed' });
  assert.deepEqual(labelsByKey['FB-4'], { categoryLabel: 'Approaching', appearance: 'information' });

  // Respects maxItems limit cleanly
  assert.equal(buildUrgentAlertItems(alerts, 2).length, 2);
});

test('Stage 6B UI Kit smoke check verifies @forge/react runtime exports, Button icons, Tags, and layout compliance', () => {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(testDir, '..');

  const forgeExportsSrc = [
    'node_modules/@forge/react/out/index.js',
    'node_modules/@forge/react/out/components/index.js',
    'node_modules/@forge/react/out/components/ui-kit-components.js'
  ]
    .map((relPath) => fs.readFileSync(path.join(projectRoot, relPath), 'utf8'))
    .join('\n');

  const exportedSymbols = new Set();
  for (const m of forgeExportsSrc.matchAll(/exports\.([A-Za-z0-9_]+)\s*=/g)) {
    if (m[1] !== '__esModule') {
      exportedSymbols.add(m[1]);
    }
  }
  for (const m of forgeExportsSrc.matchAll(/Object\.defineProperty\(exports,\s*"([A-Za-z0-9_]+)"/g)) {
    exportedSymbols.add(m[1]);
  }

  const buttonPropsSrc = fs.readFileSync(
    path.join(
      projectRoot,
      'node_modules/@atlaskit/forge-react-types/dist/types/components/__generated__/ButtonProps.codegen.d.ts'
    ),
    'utf8'
  );
  const buttonIconMatch = buttonPropsSrc.match(/export type Icon = ([^;]+);/);
  assert.ok(buttonIconMatch, 'ButtonProps Icon union should be present');
  const validButtonIcons = new Set(
    [...buttonIconMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1])
  );

  const frontendFiles = [
    'src/frontend/index.jsx',
    'src/frontend/components/DashboardHeader.jsx',
    'src/frontend/components/OverviewSection.jsx',
    'src/frontend/components/PrioritiesSection.jsx',
    'src/frontend/components/BlockerRadarSection.jsx',
    'src/frontend/components/RecentSignalsSection.jsx',
    'src/frontend/components/ConfluenceKnowledgeSection.jsx',
    'src/frontend/components/IssueDetailModal.jsx'
  ];

  for (const relFile of frontendFiles) {
    const content = fs.readFileSync(path.join(projectRoot, relFile), 'utf8');

    // No raw HTML elements or deprecated @forge/ui / third-party UI imports
    assert.equal(
      /<(div|span|p|a|strong|em|br|hr|ul|ol|li|h[1-6]|table|tr|td|th|input|img)\b/.test(content),
      false,
      `${relFile} must not use standard HTML elements`
    );
    assert.equal(
      /@forge\/ui|@atlaskit\//.test(content),
      false,
      `${relFile} must not import from @forge/ui or @atlaskit/*`
    );

    // Every named import from @forge/react must exist in installed runtime exports (no Grid/Flex)
    const importMatch = content.match(/import\s+(?:[\w$]+,\s*)?\{([^}]+)\}\s+from\s+'@forge\/react'/);
    if (importMatch) {
      const names = importMatch[1]
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      assert.equal(names.includes('Grid'), false, `${relFile} must not import Grid`);
      for (const sym of names) {
        assert.equal(
          exportedSymbols.has(sym),
          true,
          `${relFile} imports '${sym}' which is not exported by installed @forge/react`
        );
      }
    }

    // All Button iconBefore / iconAfter values must be valid in ButtonProps
    for (const btnMatch of content.matchAll(/<Button\b([\s\S]*?)>/g)) {
      const attrs = btnMatch[1];
      for (const iconAttr of attrs.matchAll(/\b(?:iconBefore|iconAfter)="([^"]+)"/g)) {
        const iconName = iconAttr[1];
        assert.equal(
          validButtonIcons.has(iconName),
          true,
          `${relFile} passes unsupported Button icon '${iconName}'`
        );
      }
    }
  }

  // Verify targeted Stage 6B safeguards in component sources
  const knowledgeSrc = fs.readFileSync(
    path.join(projectRoot, 'src/frontend/components/ConfluenceKnowledgeSection.jsx'),
    'utf8'
  );
  assert.match(knowledgeSrc, /<Tag[\s\S]*isRemovable=\{false\}/);

  const overviewSrc = fs.readFileSync(
    path.join(projectRoot, 'src/frontend/components/OverviewSection.jsx'),
    'utf8'
  );
  assert.match(overviewSrc, /buildUrgentAlertItems/);

  const prioritiesSrc = fs.readFileSync(
    path.join(projectRoot, 'src/frontend/components/PrioritiesSection.jsx'),
    'utf8'
  );
  assert.match(prioritiesSrc, /clampTablePage/);
});
