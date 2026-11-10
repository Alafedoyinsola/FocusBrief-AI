import React from 'react';
import {
  Box,
  Button,
  Heading,
  Icon,
  Image,
  Inline,
  LoadingButton,
  Lozenge,
  SectionMessage,
  Stack,
  Text,
  Toggle,
  xcss
} from '@forge/react';
import {
  formatBriefingDate,
  formatTimestampInTimeZone,
  isSafeHttpsUrl
} from '../briefingViewHelpers.js';

/**
 * DashboardHeader renders the FocusBrief AI branding, personalized user greeting,
 * local briefing date/timezone, last-synced snapshot timestamp, accessible session
 * Light/Dark surface toggle, and manual Refresh button.
 */
export function DashboardHeader({
  user,
  briefingDate,
  timeZone,
  metadata,
  palette,
  onToggleTheme,
  onResetTheme,
  isRefreshing,
  refreshError,
  onRefresh
}) {
  const displayName = user?.displayName || 'Team Member';
  const effectiveTimeZone = timeZone || user?.timeZone || 'UTC';
  const formattedDate = formatBriefingDate(briefingDate);
  const retrievedLabel = formatTimestampInTimeZone(metadata?.retrievedAt, effectiveTimeZone);
  const hasSafeAvatar = isSafeHttpsUrl(user?.avatarUrl);

  const headerCardStyle = xcss({
    borderColor: palette.borderColor,
    borderStyle: 'solid',
    borderWidth: 'border.width',
    borderRadius: 'radius.large',
    boxShadow: 'elevation.shadow.raised'
  });

  // Built-in Toggle and Button labels rely on Jira host `--ds-*` tokens, so keeping
  // the control strip on `elevation.surface` ensures readable contrast at all times.
  const controlStripStyle = xcss({
    borderColor: 'color.border',
    borderStyle: 'solid',
    borderWidth: 'border.width',
    borderRadius: 'radius.medium'
  });

  const hostModeLabel = palette.hostColorMode === 'dark' ? 'Dark' : 'Light';
  const effectiveModeLabel = palette.effectiveColorMode === 'dark' ? 'Dark' : 'Light';

  return (
    <Box backgroundColor={palette.cardBg} padding="space.250" xcss={headerCardStyle}>
      <Stack space="space.200">
        <Inline spread="space-between" alignBlock="center" shouldWrap rowSpace="space.150">
          <Inline space="space.150" alignBlock="center" shouldWrap>
            {hasSafeAvatar ? (
              <Image src={user.avatarUrl} alt={`${displayName} avatar`} size="medium" />
            ) : (
              <Box backgroundColor="elevation.surface" padding="space.100" xcss={controlStripStyle}>
                <Icon glyph="ai-agent" label="FocusBrief AI" size="medium" />
              </Box>
            )}
            <Stack space="space.050">
              <Inline space="space.100" alignBlock="center" shouldWrap>
                <Heading as="h1" size="large" color={palette.headingColor}>
                  FocusBrief AI
                </Heading>
                <Lozenge appearance="information">Daily Briefing</Lozenge>
                {palette.isCustomOverride && (
                  <Lozenge appearance="discovery">Custom {effectiveModeLabel} Surface</Lozenge>
                )}
              </Inline>
              <Text size="medium" color={palette.textColor}>
                Good day, {displayName} · {formattedDate} ({effectiveTimeZone})
              </Text>
              <Text size="small" color={palette.subduedTextColor}>
                Last Jira sync: {retrievedLabel}
              </Text>
            </Stack>
          </Inline>

          <Box backgroundColor={palette.hostSurfaceBg} padding="space.150" xcss={controlStripStyle}>
            <Inline space="space.150" alignBlock="center" shouldWrap>
              <Inline space="space.075" alignBlock="center">
                <Icon glyph="theme" label="Dashboard surface theme" size="small" />
                <Toggle
                  id="focusbrief-surface-theme-toggle"
                  name="surfaceTheme"
                  label={
                    palette.isCustomOverride
                      ? `Dashboard: ${effectiveModeLabel} (Custom)`
                      : `Theme: ${hostModeLabel} (Jira sync)`
                  }
                  isChecked={palette.effectiveColorMode === 'dark'}
                  onChange={(event) => onToggleTheme(Boolean(event?.target?.checked))}
                  testId="theme-toggle"
                />
              </Inline>

              {palette.isCustomOverride && (
                <Button
                  appearance="subtle"
                  spacing="compact"
                  onClick={onResetTheme}
                  testId="theme-reset-button"
                >
                  Sync with Jira ({hostModeLabel})
                </Button>
              )}

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

        {palette.isCustomOverride && (
          <Box backgroundColor={palette.hostSurfaceBg} padding="space.150" xcss={controlStripStyle}>
            <Text size="small" color="color.text.subtle">
              Custom {effectiveModeLabel.toLowerCase()} appearance is applied to FocusBrief dashboard cards for this session and does not change Jira&apos;s global {hostModeLabel.toLowerCase()} theme. Built-in tables, tabs, and dialogs remain in Jira&apos;s host theme to preserve contrast.
            </Text>
          </Box>
        )}

        {refreshError && (
          <Box backgroundColor={palette.hostSurfaceBg} padding="space.0">
            <SectionMessage appearance="warning" title="Refresh warning">
              <Text>{refreshError} Showing your previously loaded briefing below.</Text>
            </SectionMessage>
          </Box>
        )}
      </Stack>
    </Box>
  );
}
