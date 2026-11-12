import React, { useEffect, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Code,
  DynamicTable,
  EmptyState,
  Heading,
  Icon,
  Inline,
  List,
  ListItem,
  Lozenge,
  Stack,
  Text,
  Textfield,
  xcss
} from '@forge/react';
import {
  clampTablePage,
  filterIssues,
  getDeadlineAppearance,
  getScorePresentation,
  getStatusAppearance
} from '../briefingViewHelpers.js';

const ROWS_PER_PAGE = 10;

const FILTER_OPTIONS = [
  { key: 'all', label: 'All Active' },
  { key: 'actionable', label: 'Actionable Only' },
  { key: 'urgent', label: 'Overdue / Soon' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'blocking_others', label: 'Blocking Others' }
];

/**
 * PrioritiesSection showcases FocusBrief AI's top 3 Actionable-First recommendations
 * followed by a searchable, filterable DynamicTable of all prioritized Jira issues.
 */
export function PrioritiesSection({ briefing, palette, onSelectIssue, onOpenIssue }) {
  const [filterKey, setFilterKey] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const issues = Array.isArray(briefing?.issues) ? briefing.issues : [];
  const recommendedActions = Array.isArray(briefing?.recommendedActions)
    ? briefing.recommendedActions
    : [];

  const filteredIssues = filterIssues(issues, filterKey, searchQuery);
  const effectivePage = clampTablePage(currentPage, filteredIssues.length, ROWS_PER_PAGE);

  // Keep state synchronized when refreshed briefing data reduces available pages
  useEffect(() => {
    if (currentPage !== effectivePage) {
      setCurrentPage(effectivePage);
    }
  }, [currentPage, effectivePage]);

  const cardStyle = xcss({
    borderColor: palette.borderColor,
    borderStyle: 'solid',
    borderWidth: 'border.width',
    borderRadius: 'radius.medium',
    boxShadow: 'elevation.shadow.raised'
  });

  // Flex-grow + minimum width arranges up to 3 action cards responsively via Inline
  const actionCardStyle = xcss({
    borderColor: palette.borderColor,
    borderStyle: 'solid',
    borderWidth: 'border.width',
    borderRadius: 'radius.medium',
    boxShadow: 'elevation.shadow.raised',
    flexGrow: 1,
    minWidth: '260px'
  });

  const hostSurfaceStyle = xcss({
    borderColor: 'color.border',
    borderStyle: 'solid',
    borderWidth: 'border.width',
    borderRadius: 'radius.medium'
  });

  const handleFilterChange = (nextFilter) => {
    setFilterKey(nextFilter);
    setCurrentPage(1);
  };

  const handleSearchChange = (event) => {
    const nextValue = typeof event?.target?.value === 'string' ? event.target.value : '';
    setSearchQuery(nextValue);
    setCurrentPage(1);
  };

  const tableHead = {
    cells: [
      { key: 'score', content: 'Score', width: 10 },
      { key: 'task', content: 'Task & Score Rationale', width: 38 },
      { key: 'status', content: 'Status / Priority', width: 17 },
      { key: 'deadline', content: 'Deadline', width: 14 },
      { key: 'blocker', content: 'Blocker', width: 11 },
      { key: 'actions', content: 'Actions', width: 10 }
    ]
  };

  const tableRows = filteredIssues.map((issue) => {
    const scoreMeta = getScorePresentation(issue.score);
    const deadlineAppearance = getDeadlineAppearance(issue.deadline?.status);
    const statusAppearance = getStatusAppearance(
      issue.status?.statusCategoryKey,
      issue.status?.category
    );
    const blocksCount = Array.isArray(issue.blocker?.blocksOthersKeys)
      ? issue.blocker.blocksOthersKeys.length
      : 0;
    const isBlocked = Boolean(issue.blocker?.isBlocked);
    const reasonPreview = Array.isArray(issue.reasons) ? issue.reasons.slice(0, 2).join(' · ') : '';

    let blockerBadge = <Lozenge appearance="success">Ready</Lozenge>;
    if (isBlocked) {
      const blockerSuffix =
        Array.isArray(issue.blocker?.blockedByKeys) && issue.blocker.blockedByKeys.length > 0
          ? ` (${issue.blocker.blockedByKeys.join(', ')})`
          : '';
      blockerBadge = <Lozenge appearance="danger">Blocked{blockerSuffix}</Lozenge>;
    } else if (blocksCount > 0) {
      blockerBadge = <Lozenge appearance="discovery">Blocks {blocksCount}</Lozenge>;
    }

    return {
      key: issue.key || issue.id,
      cells: [
        {
          key: 'score',
          content: (
            <Stack space="space.050" alignInline="start">
              <Badge appearance={scoreMeta.badgeAppearance} max={100}>
                {issue.score}
              </Badge>
              <Text size="small" color="color.text.subtle">
                / 100
              </Text>
            </Stack>
          )
        },
        {
          key: 'task',
          content: (
            <Stack space="space.050">
              <Inline space="space.075" alignBlock="center" shouldWrap>
                <Code>{issue.key}</Code>
                <Text size="medium" weight="semibold">
                  {issue.summary}
                </Text>
              </Inline>
              {reasonPreview && (
                <Text size="small" color="color.text.subtle" maxLines={2}>
                  {reasonPreview}
                </Text>
              )}
            </Stack>
          )
        },
        {
          key: 'status',
          content: (
            <Stack space="space.050" alignInline="start">
              <Lozenge appearance={statusAppearance}>{issue.status?.name || 'Unknown'}</Lozenge>
              <Text size="small" color="color.text.subtle">
                {issue.priority?.name || 'Medium'}
              </Text>
            </Stack>
          )
        },
        {
          key: 'deadline',
          content: (
            <Stack space="space.050" alignInline="start">
              <Lozenge appearance={deadlineAppearance}>
                {issue.deadline?.label || 'No due date set'}
              </Lozenge>
              {issue.deadline?.dueDate && (
                <Text size="small" color="color.text.subtle">
                  {issue.deadline.dueDate}
                </Text>
              )}
            </Stack>
          )
        },
        {
          key: 'blocker',
          content: blockerBadge
        },
        {
          key: 'actions',
          content: (
            <Inline space="space.050" shouldWrap>
              <Button
                appearance="default"
                spacing="compact"
                onClick={() => onSelectIssue(issue.key)}
              >
                Details
              </Button>
              <Button
                appearance="subtle"
                spacing="compact"
                iconBefore="shortcut"
                onClick={() => onOpenIssue(issue.key)}
              >
                Jira
              </Button>
            </Inline>
          )
        }
      ]
    };
  });

  const emptyTableView = (
    <EmptyState
      header={issues.length === 0 ? 'No active Jira tasks assigned' : 'No matching tasks'}
      description={
        issues.length === 0
          ? 'You have no unresolved tasks assigned right now.'
          : 'Try clearing your search text or selecting All Active tasks.'
      }
      primaryAction={
        issues.length > 0 ? (
          <Button
            appearance="default"
            onClick={() => {
              setFilterKey('all');
              setSearchQuery('');
              setCurrentPage(1);
            }}
          >
            Reset Filters
          </Button>
        ) : undefined
      }
    />
  );

  return (
    <Stack space="space.250">
      <Box backgroundColor={palette.cardBg} padding="space.200" xcss={cardStyle}>
        <Stack space="space.150">
          <Inline spread="space-between" alignBlock="center" shouldWrap>
            <Inline space="space.100" alignBlock="center">
              <Icon glyph="chart-trend-up" label="Recommended next actions" size="small" color={palette.iconColor} />
              <Heading as="h2" size="medium" color={palette.headingColor}>
                Recommended Next Actions
              </Heading>
            </Inline>
            <Text size="small" color={palette.subduedTextColor}>
              Actionable tasks prioritized first (up to 3)
            </Text>
          </Inline>

          {recommendedActions.length === 0 ? (
            <Box backgroundColor={palette.hostSurfaceBg} padding="space.150" xcss={hostSurfaceStyle}>
              <EmptyState
                header="No recommended actions"
                description="All assigned tasks appear resolved or none were returned."
              />
            </Box>
          ) : (
            <Inline space="space.150" rowSpace="space.150" shouldWrap grow="fill">
              {recommendedActions.map((action) => {
                const isUnblock = action.actionType === 'unblock';
                const scoreMeta = getScorePresentation(action.score);
                const statusAppearance = getStatusAppearance(
                  action.status?.statusCategoryKey,
                  action.status?.category
                );
                const actionReasons = Array.isArray(action.reasons) ? action.reasons.slice(0, 4) : [];

                return (
                  <Box
                    key={`${action.rank}-${action.issueKey}`}
                    backgroundColor={palette.subtleCardBg}
                    padding="space.200"
                    xcss={actionCardStyle}
                  >
                    <Stack space="space.150">
                      <Inline spread="space-between" alignBlock="center" shouldWrap>
                        <Inline space="space.075" alignBlock="center" shouldWrap>
                          <Badge appearance={action.rank === 1 ? 'primary' : 'default'}>
                            #{action.rank}
                          </Badge>
                          <Lozenge appearance={isUnblock ? 'warning' : 'success'}>
                            {isUnblock ? 'Unblock' : 'Focus'}
                          </Lozenge>
                          <Code>{action.issueKey}</Code>
                          <Lozenge appearance={statusAppearance}>
                            {action.status?.name || 'Unknown'}
                          </Lozenge>
                        </Inline>
                        <Badge appearance={scoreMeta.badgeAppearance} max={100}>
                          {action.score}
                        </Badge>
                      </Inline>

                      <Heading as="h3" size="small" color={palette.headingColor}>
                        {action.title}
                      </Heading>

                      {actionReasons.length > 0 && (
                        <List type="unordered">
                          {actionReasons.map((reason, idx) => (
                            <ListItem key={`${action.issueKey}-reason-${idx}`}>
                              <Text size="small" color={palette.textColor}>
                                {reason}
                              </Text>
                            </ListItem>
                          ))}
                        </List>
                      )}

                      <Inline space="space.100" shouldWrap>
                        <Button
                          appearance="primary"
                          spacing="compact"
                          onClick={() => onSelectIssue(action.issueKey)}
                        >
                          Inspect Details
                        </Button>
                        <Button
                          appearance={palette.buttonAppearance}
                          spacing="compact"
                          iconAfter="shortcut"
                          onClick={() => onOpenIssue(action.issueKey)}
                        >
                          Open in Jira
                        </Button>
                      </Inline>
                    </Stack>
                  </Box>
                );
              })}
            </Inline>
          )}
        </Stack>
      </Box>

      <Box backgroundColor={palette.hostSurfaceBg} padding="space.200" xcss={hostSurfaceStyle}>
        <Stack space="space.200">
          <Inline spread="space-between" alignBlock="center" shouldWrap rowSpace="space.100">
            <Stack space="space.050">
              <Heading as="h2" size="medium">
                Prioritized Active Task Queue ({filteredIssues.length} of {issues.length})
              </Heading>
              <Text size="small" color="color.text.subtle">
                Ranked deterministically by Jira priority, deadline urgency, unblocking impact, and blockers.
              </Text>
            </Stack>
            <Box xcss={xcss({ minWidth: 'size.1000' })}>
              <Textfield
                name="priority-search"
                placeholder="Search key, summary, project, or reason..."
                value={searchQuery}
                onChange={handleSearchChange}
                testId="priority-search-input"
              />
            </Box>
          </Inline>

          <Inline space="space.075" shouldWrap>
            {FILTER_OPTIONS.map((option) => {
              const count = filterIssues(issues, option.key, '').length;
              return (
                <Button
                  key={option.key}
                  appearance="default"
                  spacing="compact"
                  isSelected={filterKey === option.key}
                  onClick={() => handleFilterChange(option.key)}
                  testId={`priority-filter-${option.key}`}
                >
                  {option.label} ({count})
                </Button>
              );
            })}
          </Inline>

          <DynamicTable
            caption="Ranked active Jira tasks"
            head={tableHead}
            rows={tableRows}
            rowsPerPage={ROWS_PER_PAGE}
            page={effectivePage}
            onSetPage={(nextPage) => setCurrentPage(clampTablePage(nextPage, filteredIssues.length, ROWS_PER_PAGE))}
            emptyView={emptyTableView}
            isFixedSize
            testId="priorities-dynamic-table"
          />
        </Stack>
      </Box>
    </Stack>
  );
}
