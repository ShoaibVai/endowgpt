import { randomUUID } from 'crypto';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
  deleteConversations,
  deleteMessagesByConversation,
  seedConversations,
  seedMessages,
} from '../db';
import { openAgentBuilder, selectMockModel } from '../agents.helpers';
import { NEW_CHAT_PATH, messagesView } from '../helpers';
import { getE2EUser } from '../../../setup/user';

/**
 * Two literals outlived the theme sweep: the Agent Builder's provider chip was
 * always white on black, and the document sheet's phone backdrop was always
 * black. Each now paints a role, so a theme decides them. These scenarios read
 * the computed paint of each element, first against the role as the bundled
 * palette resolves it and then under a definition whose triples no bundled
 * palette holds, which only the role can deliver.
 */

const THEME_PARAM = 'e2eThemeMode';
/** Present only on the navigations that should render the reference definition. */
const DEFINITION_PARAM = 'e2eThemeDefinition';
const PHONE_VIEWPORT = { width: 390, height: 844 };
const ROOT_PARENT = '00000000-0000-0000-0000-000000000000';
const DOCUMENT_TITLE = 'Overlay roles';
const DOCUMENT_TEXT = [
  `:::artifact{identifier="e2e-overlay-roles" type="application/vnd.endowgpt.document" title="${DOCUMENT_TITLE}"}`,
  '# Overlay roles',
  ':::',
].join('\n');

/** No bundled palette holds these triples, so only the definition can produce them. */
const REFERENCE_COLORS = {
  'rgb-surface-primary': '12 34 56',
  'rgb-text-primary': '201 202 203',
  'rgb-surface-overlay': '40 50 60',
};
const REFERENCE_THEME = {
  version: 1,
  name: 'e2e-theme-sweep-roles',
  modes: { light: { colors: REFERENCE_COLORS }, dark: { colors: REFERENCE_COLORS } },
} as const;

type Paint = { background: string; color: string; roles: Record<string, string> };

/**
 * One bridge per page, as in `dialog-scrim-role`: Playwright leaves the order of
 * several init scripts undefined, so the URL decides both the mode and whether
 * the reference definition is in storage for that navigation.
 */
async function installThemeBridge(page: Page) {
  await page.addInitScript((stored) => {
    const params = new URL(location.href).searchParams;
    const mode = params.get('e2eThemeMode');
    if (mode) {
      localStorage.setItem('color-theme', mode);
    }
    localStorage.removeItem('theme-colors');
    localStorage.removeItem('theme-name');
    if (params.has('e2eThemeDefinition')) {
      localStorage.setItem('theme-definition', JSON.stringify(stored));
      localStorage.setItem('theme-source', 'definition');
    } else {
      localStorage.removeItem('theme-definition');
      localStorage.removeItem('theme-source');
    }
  }, REFERENCE_THEME);
}

const themeQuery = (mode: string, themed: boolean) =>
  `?${THEME_PARAM}=${mode}${themed ? `&${DEFINITION_PARAM}=1` : ''}`;

/** The project's own scheme, so each project checks the palette it renders. */
const projectMode = (): 'light' | 'dark' =>
  test.info().project.use.colorScheme === 'dark' ? 'dark' : 'light';

/**
 * The element's paint and each role triple as the element sees it, all rounded
 * through a canvas: Tailwind 4 serializes alpha utilities as `oklab()`, and the
 * canvas gives back the sRGB channels either spelling describes.
 */
async function readPaint(target: Locator, roles: string[]): Promise<Paint> {
  return target.evaluate((element, names) => {
    const brush = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    if (!brush) {
      throw new Error('the color-normalizing canvas has no 2d context');
    }
    const normalize = (css: string) => {
      brush.clearRect(0, 0, 1, 1);
      brush.fillStyle = css;
      brush.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = brush.getImageData(0, 0, 1, 1).data;
      const alpha = Math.round((a / 255) * 100) / 100;
      return alpha === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };
    const style = getComputedStyle(element);
    const resolved: Record<string, string> = {};
    for (const name of names) {
      resolved[name] = normalize(`rgb(${style.getPropertyValue(`--${name}`).trim()})`);
    }
    return {
      background: normalize(style.backgroundColor),
      color: normalize(style.color),
      roles: resolved,
    };
  }, roles);
}

async function showProviderChip(page: Page, mode: string, themed: boolean): Promise<Locator> {
  await page.goto(`${NEW_CHAT_PATH}${themeQuery(mode, themed)}`, { timeout: 15000 });
  await openAgentBuilder(page, { navigate: false });
  await selectMockModel(page, true);
  const chip = page.locator('#provider').locator('div.rounded-full').first();
  await expect(chip).toBeVisible();
  return chip;
}

async function openDocument(page: Page, conversationId: string, mode: string, themed: boolean) {
  await page.setViewportSize(PHONE_VIEWPORT);
  await page.goto(`/c/${conversationId}${themeQuery(mode, themed)}`, { timeout: 15000 });
  await messagesView(page).locator('[data-artifact-trigger]').first().click();
  const panel = page.locator('#artifact-viewer');
  await expect(panel).toBeVisible({ timeout: 15000 });
  /** Phone only: the backdrop is the panel's preceding sibling. */
  const backdrop = page.locator('#artifact-viewer').locator('xpath=preceding-sibling::div[1]');
  return { backdrop };
}

test.describe('theme sweep roles', () => {
  test('the agent provider chip paints surface and text primary @scenario:agent-provider-chip-role', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const mode = projectMode();
    await installThemeBridge(page);

    const bundled = await readPaint(await showProviderChip(page, mode, false), [
      'surface-primary',
      'text-primary',
    ]);
    expect(bundled.background).toBe(bundled.roles['surface-primary']);
    expect(bundled.color).toBe(bundled.roles['text-primary']);

    const chip = await showProviderChip(page, mode, true);
    await expect(page.locator('html')).toHaveAttribute('data-theme', REFERENCE_THEME.name);
    const themed = await readPaint(chip, []);
    expect(themed.background).toBe('rgb(12, 34, 56)');
    expect(themed.color).toBe('rgb(201, 202, 203)');
  });

  test('the document sheet phone backdrop paints the overlay role @scenario:document-overlay-backdrop', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const mode = projectMode();
    const conversationId = randomUUID();
    const email = getE2EUser().email;
    await seedConversations(email, [
      { conversationId, title: DOCUMENT_TITLE, updatedAt: new Date() },
    ]);
    await seedMessages(email, conversationId, [
      {
        messageId: randomUUID(),
        parentMessageId: ROOT_PARENT,
        text: DOCUMENT_TEXT,
        isCreatedByUser: false,
        sender: 'Assistant',
        model: 'mock-model-a',
      },
    ]);

    try {
      await installThemeBridge(page);
      const roles = ['surface-overlay'];
      let { backdrop } = await openDocument(page, conversationId, mode, false);
      const bundledBackdrop = await readPaint(backdrop, roles);
      expect(bundledBackdrop.background).toBe(bundledBackdrop.roles['surface-overlay']);

      ({ backdrop } = await openDocument(page, conversationId, mode, true));
      await expect(page.locator('html')).toHaveAttribute('data-theme', REFERENCE_THEME.name);
      /** Its class carries no alpha; the fade is the inline `opacity`. */
      expect((await readPaint(backdrop, [])).background).toBe('rgb(40, 50, 60)');
    } finally {
      await deleteMessagesByConversation([conversationId]);
      await deleteConversations([conversationId]);
    }
  });
});
