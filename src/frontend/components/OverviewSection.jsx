import React from 'react';
import {
  Badge,
  Box,
  Button,
  Code,
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
  buildUrgentAlertItems,
  getTruncationDisclosure
} from '../briefingViewHelpers.js';

/**
 * OverviewSection displays the deterministic briefing headline, KPI counts
 * (Total Active, Overdue, Due Today, Blocked, Blocking Others), disclosure
 * when Jira's 50-issue limit applies, and interactive urgent alerts.
 */
export function OverviewSection({ briefing, palette, onSelectIssue }) {
  const summary = briefing?.summary || {};
  const alerts = briefing?.alerts || {};
  const truncation = getTruncationDisclosure(briefing);

  const overdueCount = typeof summary.overdueCount === 'number' ? summary.overdueCount : 0;
  const dueTodayCount = typeof summary.dueTodayCount === 'number' ? summary.dueTodayCount : 0;
  const approachingCount = typeof summary.approachingCount === 'number' ? summary.approachingCount : 0;
  const blockedCount = typeof summary.blockedCount === 'number' ? summary.blockedCount : 0;
  const blockingOthersCount =
    typeof summary.blockingOthersCount === 'number' ? summary.blockingOthersCount : 0;
  const totalActive = typeof summary.totalActive === 'number' ? summary.totalActive : 0;
  const completedExcludedCount =
    typeof summary.completedExcludedCount === 'number' ? summary.completedExcludedCount : 0;

  let headlineAppearance = 'information';
  if (overdueCount > 0) {
    headlineAppearance = 'error';
  } else if (blockedCount > 0 || dueTodayCount > 0) {
    headlineAppearance = 'warning';
  }

  const cardStyle = xcss({
    borderColor: palette.borderColor,
    borderStyle: 'solid',
    borderWidth: 'border.width',
    borderRadius: 'radius.medium',
    boxShadow: 'elevation.shadow.raised'
  });

  // Flex-grow + minimum width lets wrapped Inline KPI cards adapt cleanly without Grid
  const metricCardStyle = xcss({
    borderColor: palette.borderColor,
    borderStyle: 'solid',
    borderWidth: 'border.width',
    borderRadius: 'radius.medium',
    boxShadow: 'elevation.shadow.raised',
    flexGrow: 1,
    minWidth: '175px'
  });

  const hostSectionStyle = xcss({
    borderColor: 'color.border',
    borderStyle: 'solid',
    borderWidth: 'border.width',
    borderRadius: 'radius.medium'
  });

  const metrics = [
    {
      id: 'active',
      label: 'Active Tasks',
      value: totalActive,
      badgeAppearance: 'primary',
      icon: 'tasks',
      hint: completedExcludedCount > 0 ? `${completedExcludedCount} Done excluded` : 'Open & prioritized'
    },
    {
      id: 'overdue',
      label: 'Overdue',
      value: overdueCount,
      badgeAppearance: overdueCount > 0 ? 'danger' : 'default',
      icon: 'error',
      hint: overdueCount > 0 ? 'Past due date' : 'None overdue'
    },
    {
      id: 'due-today',
      label: 'Due Today',
      value: dueTodayCount,
      badgeAppearance: dueTodayCount > 0 ? 'warning' : 'default',
      icon: 'calendar',
      hint: approachingCount > 0 ? `${approachingCount} due in 1-3d` : 'Same-day deadline'
    },
    {
      id: 'blocked',
      label: 'Blocked',
      value: blockedCount,
      badgeAppearance: blockedCount > 0 ? 'important' : 'default',
      icon: 'lock-locked',
      hint: blockedCount > 0 ? 'Waiting on dependencies' : 'No blocked tasks'
    },
    {
      id: 'blocking-others',
      label: 'Blocking Others',
      value: blockingOthersCount,
      badgeAppearance: blockingOthersCount > 0 ? 'discovery' : 'default',
      icon: 'flag-filled',
      hint: blockingOthersCount > 0 ? 'High-leverage to unblock' : 'No downstream blocks'
    }
  ];

  // Combine overdue, due-today, blocked, and approaching alerts so all urgent items stay inspectable.
  const urgentAlertItems = buildUrgentAlertItems(alerts, 8);

  return (
    <Stack space="space.200">
      <Box backgroundColor={palette.hostSurfaceBg} padding="space.150" xcss={hostSectionStyle}>
        <Stack space="space.150">
          <SectionMessage appearance={headlineAppearance} title="Executive Summary">
            <Text>{summary.headline || 'Your daily Jira briefing is ready.'}</Text>
          </SectionMessage>

          {truncation.message && (
            <SectionMessage appearance="information" title="Jira 50-Issue Retrieval Scope">
              <Text>{truncation.message}</Text>
            </SectionMessage>
          )}
        </Stack>
      </Box>

      <Inline space="space.150" rowSpace="space.150" shouldWrap grow="fill">
        {metrics.map((metric) => (
          <Box key={metric.id} backgroundColor={palette.cardBg} padding="space.200" xcss={metricCardStyle}>
            <Stack space="space.100">
              <Inline spread="space-between" alignBlock="center">
                <Inline space="space.075" alignBlock="center">
                  <Icon glyph={metric.icon} label={metric.label} size="small" color={palette.iconColor} />
                  <Text size="small" weight="semibold" color={palette.textColor}>
                    {metric.label}
                  </Text>
                </Inline>
                <Badge appearance={metric.badgeAppearance} max={999}>
                  {metric.value}
                </Badge>
              </Inline>
              <Heading as="h2" size="xlarge" color={palette.headingColor}>
                {metric.value}
              </Heading>
              <Text size="small" color={palette.subduedTextColor}>
                {metric.hint}
              </Text>
            </Stack>
          </Box>
        ))}
      </Inline>

      {urgentAlertItems.length > 0 && (
        <Box backgroundColor={palette.cardBg} padding="space.200" xcss={cardStyle}>
          <Stack space="space.150">
            <Inline spread="space-between" alignBlock="center" shouldWrap>
              <Inline space="space.100" alignBlock="center">
                <Icon glyph="warning" label="Urgent attention" size="small" color={palette.iconColor} />
                <Heading as="h3" size="small" color={palette.headingColor}>
                  Immediate Attention Alerts
                </Heading>
              </Inline>
              <Text size="small" color={palette.subduedTextColor}>
                Select an issue to inspect scoring details & dependencies
              </Text>
            </Inline>

            <Stack space="space.100">
              {urgentAlertItems.map((alertItem, idx) => (
                <Box
                  key={`${alertItem.categoryLabel}-${alertItem.key}-${idx}`}
                  backgroundColor={palette.subtleCardBg}
                  padding="space.150"
                  xcss={cardStyle}
                >
                  <Inline spread="space-between" alignBlock="center" shouldWrap rowSpace="space.100">
                    <Inline space="space.100" alignBlock="center" shouldWrap>
                      <Lozenge appearance={alertItem.appearance}>{alertItem.categoryLabel}</Lozenge>
                      <Code>{alertItem.key}</Code>
                      <Text size="small" weight="medium" color={palette.textColor}>
                        {alertItem.message || alertItem.summary}
                      </Text>
                    </Inline>
                    <Button
                      appearance={palette.buttonAppearance}
                      spacing="compact"
                      onClick={() => onSelectIssue(alertItem.key)}
                    >
                      Inspect
                    </Button>
                  </Inline>
                </Box>
              ))}
            </Stack>
          </Stack>
        </Box>
      )}
    </Stack>
  );
}
