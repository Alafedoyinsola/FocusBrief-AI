import React from 'react';
import {
  Badge,
  Box,
  Button,
  Code,
  EmptyState,
  Heading,
  Icon,
  Inline,
  Lozenge,
  SectionMessage,
  Stack,
  Text,
  xcss
} from '@forge/react';
import {
  deriveRecentSignals,
  formatTimestampInTimeZone,
  getStatusAppearance
} from '../briefingViewHelpers.js';

/**
 * RecentSignalsSection presents recent Jira activity strictly derived from
 * available issue `updated` timestamps and briefing summary counts without
 * fabricating historical snapshot diffs or issue changelogs.
 */
export function RecentSignalsSection({ briefing, palette, onSelectIssue, onOpenIssue }) {
  const timeZone = briefing?.timeZone || briefing?.user?.timeZone || 'UTC';
  const signals = deriveRecentSignals(briefing);

  const cardStyle = xcss({
    borderColor: palette.borderColor,
    borderStyle: 'solid',
    borderWidth: 'border.width',
    borderRadius: 'radius.medium',
    boxShadow: 'elevation.shadow.raised'
  });

  // Flex-grow + minimum width arranges summary KPI cards responsively via Inline
  const metricCardStyle = xcss({
    borderColor: palette.borderColor,
    borderStyle: 'solid',
    borderWidth: 'border.width',
    borderRadius: 'radius.medium',
    boxShadow: 'elevation.shadow.raised',
    flexGrow: 1,
    minWidth: '200px'
  });

  const hostSurfaceStyle = xcss({
    borderColor: 'color.border',
    borderStyle: 'solid',
    borderWidth: 'border.width',
    borderRadius: 'radius.medium'
  });

  const recencyMetrics = [
    {
      id: '24h',
      label: 'Updated in Last 24h',
      value: signals.updatedLast24HoursCount,
      appearance: signals.updatedLast24HoursCount > 0 ? 'primary' : 'default'
    },
    {
      id: '7d',
      label: 'Updated in Last 7 Days',
      value: signals.updatedLast7DaysCount,
      appearance: signals.updatedLast7DaysCount > 0 ? 'added' : 'default'
    },
    {
      id: 'done-excluded',
      label: 'Done Issues Excluded',
      value: signals.completedExcludedCount,
      appearance: signals.completedExcludedCount > 0 ? 'default' : 'default'
    }
  ];

  const getRecencyBadge = (bucket) => {
    if (bucket === 'last_24h') {
      return { label: 'Last 24h', appearance: 'success' };
    }
    if (bucket === 'last_7d') {
      return { label: 'Last 7d', appearance: 'information' };
    }
    return { label: 'Earlier', appearance: 'neutral' };
  };

  return (
    <Stack space="space.200">
      <Box backgroundColor={palette.hostSurfaceBg} padding="space.150" xcss={hostSurfaceStyle}>
        <SectionMessage appearance="information" title="About What Changed Signals">
          <Text>
            Recent activity is computed from live Jira issue updated timestamps and the current query snapshot ({formatTimestampInTimeZone(signals.retrievedAt, timeZone)}). FocusBrief AI does not store prior daily snapshots or Jira changelogs, so cross-day diffs are intentionally omitted rather than estimated.
          </Text>
        </SectionMessage>
      </Box>

      <Inline space="space.150" rowSpace="space.150" shouldWrap grow="fill">
        {recencyMetrics.map((metric) => (
          <Box key={metric.id} backgroundColor={palette.cardBg} padding="space.200" xcss={metricCardStyle}>
            <Stack space="space.100">
              <Inline spread="space-between" alignBlock="center">
                <Text size="small" weight="semibold" color={palette.textColor}>
                  {metric.label}
                </Text>
                <Badge appearance={metric.appearance} max={999}>
                  {metric.value}
                </Badge>
              </Inline>
              <Heading as="h3" size="large" color={palette.headingColor}>
                {metric.value}
              </Heading>
            </Stack>
          </Box>
        ))}
      </Inline>

      <Box backgroundColor={palette.cardBg} padding="space.200" xcss={cardStyle}>
        <Stack space="space.150">
          <Inline spread="space-between" alignBlock="center" shouldWrap>
            <Inline space="space.100" alignBlock="center">
              <Icon glyph="pulse" label="Recently updated Jira tasks" size="small" color={palette.iconColor} />
              <Heading as="h2" size="medium" color={palette.headingColor}>
                Most Recently Updated Active Tasks
              </Heading>
            </Inline>
            <Text size="small" color={palette.subduedTextColor}>
              Sorted by Jira updated timestamp
            </Text>
          </Inline>

          {signals.recentlyUpdatedIssues.length === 0 ? (
            <Box backgroundColor={palette.hostSurfaceBg} padding="space.150" xcss={hostSurfaceStyle}>
              <EmptyState
                header="No update timestamps available"
                description="Active tasks with Jira updated timestamps will appear here."
              />
            </Box>
          ) : (
            <Stack space="space.100">
              {signals.recentlyUpdatedIssues.map((item) => {
                const recencyBadge = getRecencyBadge(item.recencyBucket);
                const statusAppearance = getStatusAppearance(
                  item.statusCategoryKey,
                  item.statusCategory
                );

                return (
                  <Box
                    key={`recent-${item.key}`}
                    backgroundColor={palette.subtleCardBg}
                    padding="space.150"
                    xcss={cardStyle}
                  >
                    <Inline spread="space-between" alignBlock="center" shouldWrap rowSpace="space.100">
                      <Stack space="space.050">
                        <Inline space="space.075" alignBlock="center" shouldWrap>
                          <Lozenge appearance={recencyBadge.appearance}>{recencyBadge.label}</Lozenge>
                          <Code>{item.key}</Code>
                          <Text size="medium" weight="medium" color={palette.textColor}>
                            {item.summary}
                          </Text>
                        </Inline>
                        <Inline space="space.100" alignBlock="center" shouldWrap>
                          <Lozenge appearance={statusAppearance}>{item.statusName}</Lozenge>
                          <Text size="small" color={palette.subduedTextColor}>
                            Updated: {formatTimestampInTimeZone(item.updated, timeZone)}
                          </Text>
                        </Inline>
                      </Stack>

                      <Inline space="space.075">
                        <Button
                          appearance={palette.buttonAppearance}
                          spacing="compact"
                          onClick={() => onSelectIssue(item.key)}
                        >
                          Inspect
                        </Button>
                        <Button
                          appearance={palette.buttonAppearance}
                          spacing="compact"
                          iconAfter="shortcut"
                          onClick={() => onOpenIssue(item.key)}
                        >
                          Jira
                        </Button>
                      </Inline>
                    </Inline>
                  </Box>
                );
              })}
            </Stack>
          )}
        </Stack>
      </Box>
    </Stack>
  );
}
