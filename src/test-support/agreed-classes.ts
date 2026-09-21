/**
 * The colour class agreed for every icon on the two reference pages, as
 * criterion 3 of `docs/acceptance-criteria.md` records it.
 *
 * One copy on purpose: the analysis tests assert the whole table at once, and
 * anything else that needs to know what was agreed reads this rather than a
 * second copy that could drift from it.
 *
 * Dev-only, like everything else in this directory. The app never sees it.
 */
import type { ColorClass } from '../core/analysis.ts';

export const AGREED_CLASSES: Readonly<Record<string, ColorClass>> = {
  Endel: 'dark', Spotify: 'dark', VoiceRecorder: 'dark',
  '1Password': 'gray',
  Youdao: 'chromatic', Claude: 'chromatic', Spark: 'chromatic', WhatsApp: 'chromatic',
  WeChat: 'chromatic', Todoist: 'chromatic', Meitu: 'chromatic',
  // White tiles whose mark is big enough to speak for them; see ADR-0011.
  Telegram: 'chromatic', DeepSeek: 'chromatic', Simplenote: 'chromatic', QQMusic: 'chromatic',
  Owlfiles: 'white', DeepL: 'white', Gemini: 'white', ChatGPT: 'white',
  Gmail: 'white', UpNote: 'white', TickTick: 'white', MinimaList: 'white', '轻颜': 'white',
};
