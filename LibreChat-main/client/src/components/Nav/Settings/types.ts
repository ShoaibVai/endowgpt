import { createElement } from 'react';
import { Info } from 'lucide-react';
import { SettingsTabValues } from 'librechat-data-provider';
import { GearIcon, UserIcon, SpeechIcon } from '@librechat/client';
import type { ComponentType, ReactNode } from 'react';
import type { TranslationKeys } from '~/hooks';

export type SettingsTab =
  | SettingsTabValues.GENERAL
  | SettingsTabValues.CHAT
  | SettingsTabValues.SPEECH
  | SettingsTabValues.LANGFUSE
  | SettingsTabValues.DATA
  | SettingsTabValues.ACCOUNT
  | SettingsTabValues.ABOUT;

export type SectionId =
  | 'appearance'
  | 'layout'
  | 'notifications'
  | 'accessibility'
  | 'admin'
  | 'sending'
  | 'commands'
  | 'messages'
  | 'conversations'
  | 'prompts'
  | 'stt'
  | 'tts'
  | 'memory'
  | 'codeExecution'
  | 'data'
  | 'apiKeys'
  | 'langfuse'
  | 'danger'
  | 'profile'
  | 'security'
  | 'connections'
  | 'billing'
  | 'about';

export interface SettingsContextValue {
  balanceEnabled: boolean;
  hasAnyPersonalizationFeature: boolean;
  hasMemoryOptOut: boolean;
  hasStatefulCodeSessions: boolean;
  hasRemoteAgents: boolean;
  hasUserProvidedEndpoints: boolean;
  hasMultiConvo: boolean;
  hasPrompts: boolean;
  isLocalProvider: boolean;
  emailEnabled: boolean;
  allowEmailChange: boolean;
  passkeyLoginEnabled: boolean;
  hasPullRequestConnect: boolean;
  isTwoFactorPolicyProvider: boolean;
  twoFactorEnabled: boolean;
  allowAccountDeletion: boolean;
  aboutEnabled: boolean;
  mascotAllowed: boolean;
  engineTTS: string;
  langfuseConnectionAccess: boolean;
  langfusePromptSyncAccess?: boolean;
  adminPanelURL: string;
  replyTabBadgeAllowed: boolean;
  replyNotificationsAllowed: boolean;
  replyNotificationSoundAllowed: boolean;
  analyticsConfigured: boolean;
}

export interface SettingEntry {
  id: string;
  tab: SettingsTab;
  section: SectionId;
  labelKey: TranslationKeys;
  keywords?: string[];
  Component: ComponentType;
  show?: (ctx: SettingsContextValue) => boolean;
}

export interface SectionMeta {
  id: SectionId;
  labelKey: TranslationKeys;
  icon?: ReactNode;
  danger?: boolean;
}

export interface TabMeta {
  id: SettingsTab;
  labelKey: TranslationKeys;
  icon: ReactNode;
  sections: SectionMeta[];
  show?: (ctx: SettingsContextValue) => boolean;
}

export const TABS: TabMeta[] = [
  {
    id: SettingsTabValues.GENERAL,
    labelKey: 'com_nav_setting_general',
    icon: createElement(GearIcon),
    sections: [
      { id: 'appearance', labelKey: 'com_ui_settings_section_appearance' },
      { id: 'layout', labelKey: 'com_ui_settings_section_layout' },
      { id: 'notifications', labelKey: 'com_ui_settings_section_notifications' },
      { id: 'accessibility', labelKey: 'com_ui_settings_section_accessibility' },
      { id: 'admin', labelKey: 'com_ui_settings_section_admin' },
    ],
  },
  {
    id: SettingsTabValues.SPEECH,
    labelKey: 'com_nav_setting_speech',
    icon: createElement(SpeechIcon, { className: 'icon-sm' }),
    sections: [
      { id: 'stt', labelKey: 'com_ui_settings_section_stt' },
      { id: 'tts', labelKey: 'com_ui_settings_section_tts' },
    ],
  },
  {
    id: SettingsTabValues.ACCOUNT,
    labelKey: 'com_nav_setting_account',
    icon: createElement(UserIcon),
    sections: [
      { id: 'profile', labelKey: 'com_ui_settings_section_profile' },
      { id: 'security', labelKey: 'com_ui_settings_section_security' },
      { id: 'connections', labelKey: 'com_ui_settings_section_connections' },
      { id: 'billing', labelKey: 'com_ui_settings_section_billing' },
      { id: 'danger', labelKey: 'com_ui_settings_section_danger_zone', danger: true },
    ],
  },
  {
    id: SettingsTabValues.ABOUT,
    labelKey: 'com_nav_setting_about',
    icon: createElement(Info, { className: 'icon-sm', 'aria-hidden': true }),
    sections: [{ id: 'about', labelKey: 'com_nav_setting_about' }],
    show: (ctx) => ctx.aboutEnabled,
  },
];
