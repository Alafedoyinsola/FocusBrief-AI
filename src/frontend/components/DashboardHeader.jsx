import React from 'react';
import {
  Box,
  Heading,
  Icon,
  Image,
  Inline,
  LoadingButton,
  Lozenge,
  SectionMessage,
  Stack,
  Text,
  xcss
} from '@forge/react';
import {
  formatBriefingDate,
  formatJiraThemeLabel,
  formatTimestampInTimeZone,
  getThemeSurfacePalette,
  isSafeHttpsUrl
} from '../briefingViewHelpers.js';

/**
 * DashboardHeader renders the FocusBrief AI branding, personalized user greeting,
 * local briefing date/timezone, last-synced snapshot timestamp, synchronized Jira
 * host theme indicator, and manual Refresh button.
 */
export function DashboardHeader({
  user,
  briefingDate,
  timeZone,
  metadata,
  palette,
  isRefreshing,
  refreshError,
  onRefresh
}) {
  const activePalette = palette || getThemeSurfacePalette();
  const displayName = user?.displayName || 'Team Member';
  const effectiveTimeZone = timeZone || user?.timeZone || 'UTC';
  const formattedDate = formatBriefingDate(briefingDate);
  const retrievedLabel = formatTimestampInTimeZone(metadata?.retrievedAt, effectiveTimeZone);
  const hasSafeAvatar = isSafeHttpsUrl(user?.avatarUrl);
  const jiraThemeLabel = activePalette.themeLabel || formatJiraThemeLabel();

  const headerCardStyle = xcss({
    borderColor: activePalette.borderColor,
    borderStyle: 'solid',
    borderWidth: 'border.width',
    borderRadius: 'radius.large',
    boxShadow: 'elevation.shadow.raised'
  });

  const controlStripStyle = xcss({
    borderColor: activePalette.borderColor,
    borderStyle: 'solid',
    borderWidth: 'border.width',
    borderRadius: 'radius.medium'
  });

  return (
    <Box backgroundColor={activePalette.cardBg} padding="space.250" xcss={headerCardStyle}>
      <Stack space="space.200">
        <Inline spread="space-between" alignBlock="center" shouldWrap rowSpace="space.150">
          <Inline space="space.150" alignBlock="center" shouldWrap>
            {hasSafeAvatar ? (
              <Image src={user.avatarUrl} alt={`${displayName} avatar`} size="medium" />
            ) : (
              <Box backgroundColor={activePalette.hostSurfaceBg} padding="space.100" xcss={controlStripStyle}>
                <Icon glyph="ai-agent" label="FocusBrief AI" size="medium" color={activePalette.iconColor} />
              </Box>
            )}
            <Stack space="space.050">
              <Inline space="space.100" alignBlock="center" shouldWrap>
                <Heading as="h1" size="large" color={activePalette.headingColor}>
                  FocusBrief AI
                </Heading>
                <Lozenge appearance="information">Daily Briefing</Lozenge>
              </Inline>
              <Text size="medium" color={activePalette.textColor}>
                Good day, {displayName} · {formattedDate} ({effectiveTimeZone})
              </Text>
              <Text size="small" color={activePalette.subduedTextColor}>
                Last Jira sync: {retrievedLabel}
              </Text>
            </Stack>
          </Inline>

          <Box backgroundColor={activePalette.hostSurfaceBg} padding="space.150" xcss={controlStripStyle}>
            <Inline space="space.150" alignBlock="center" shouldWrap>
              <Inline space="space.075" alignBlock="center">
                <Icon glyph="theme" label="" size="small" color={activePalette.iconColor} />
                <Lozenge appearance="neutral" testId="jira-theme-indicator">
                  {jiraThemeLabel}
                </Lozenge>
              </Inline>

              <LoadingButton
                appearance="primary"
                isLoading={isRefreshing}
                isDisabled={isRefreshing}
                onClick={onRefresh}
                testId="refresh-briefing-button"
              >
                Refresh Briefing
              </LoadingButton>
            </Inline>
          </Box>
        </Inline>

        {refreshError && (
          <Box backgroundColor={activePalette.hostSurfaceBg} padding="space.0">
            <SectionMessage appearance="warning" title="Refresh warning">
              <Text>{refreshError} Showing your previously loaded briefing below.</Text>
            </SectionMessage>
          </Box>
        )}
      </Stack>
    </Box>
  );
}
