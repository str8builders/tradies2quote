/**
 * The new look's design rules (src/components/ui/design-rules.test.ts and the
 * per-folder copies) as reusable checks, for new-look screens that live
 * outside those folders or share a file with the old look:
 *
 *   - sourceRuleBreaks(code): a whole new-look source file.
 *   - markupRuleBreaks(html): what a new-look variant actually renders, class
 *     list by class list (for a component that keeps its old-look markup
 *     beside the new one).
 *
 * Both return the rules broken, in plain words; [] means it follows them all.
 */

const COLOUR_CLASS =
  /\b(?:bg|text|border|ring|outline|divide|fill|stroke|from|via|to|placeholder|caret|accent|decoration|shadow)-(?:ink|brand|hivis|white|black|red|green|blue|yellow|orange|amber|emerald|gray|zinc|neutral|slate|stone|cyan)(?:-\d+)?\b/;
const OLD_LOOK_CLASS = /\bt2q-(?:card|btn|section|record|page|shadow|loading|job|generation)[\w-]*/;
const TINY_TEXT = /\btext-(?:xs|sm|base|lg|xl|[2-9]xl)\b|\btext-\[\d+(?:\.\d+)?px\]/;
const CODE_STYLE = /\buppercase\b|tracking-\[0\.\d+em\]|\bfont-mono\b/;
const WIDE_TRANSITION = /\btransition(?:-all|-colors|-shadow)?(?=["'`\s]|$)/;
/** `[class*='animate-ui-']` is a selector (the shell pausing kit motion), not an animation. */
const ANIMATION = /(?<!\[class\*=')\banimate-(?!none\b)[\w-]+/;
const ANIMATION_OFF = /motion-reduce:animate-none/;
const MOVE_TRANSITION = /\btransition-(?:transform|opacity)\b/;
const TRANSITION_OFF = /motion-reduce:transition-none/;
const EMOJI = /\p{Extended_Pictographic}/u;

const count = (re: RegExp, text: string) => [...text.matchAll(new RegExp(re.source, `${re.flags}g`))].length;

/** Code without comments: comments may talk about banned things, code may not. */
export function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function colourBreaks(text: string): string[] {
  const out: string[] = [];
  if (/#[0-9a-fA-F]{3,8}\b/.test(text) || /\brgba?\(/.test(text)) out.push("raw colour");
  if (COLOUR_CLASS.test(text)) out.push("colour class outside the ui- tokens");
  if (/\btext-ui-brand(?![-\w])/.test(text)) out.push("orange text must be text-ui-brand-text");
  if (OLD_LOOK_CLASS.test(text)) out.push("old-look t2q- component class");
  return out;
}

/** Every design rule a new-look source file breaks. */
export function sourceRuleBreaks(source: string): string[] {
  const code = stripComments(source);
  const out = colourBreaks(code);
  if (TINY_TEXT.test(code)) out.push("text under 13 px or outside the ui- sizes");
  if (/\{\s*["'`]\/\/ /.test(code) || />\s*\/\/ /.test(code)) out.push('"// label" eyebrow');
  if (CODE_STYLE.test(code)) out.push("code-style label (uppercase, mono, wide tracking)");
  if (WIDE_TRANSITION.test(code)) out.push("transition on more than transform/opacity");
  if (count(ANIMATION_OFF, code) < count(ANIMATION, code)) out.push("animation without motion-reduce:animate-none");
  if (count(TRANSITION_OFF, code) < count(MOVE_TRANSITION, code)) {
    out.push("transition without motion-reduce:transition-none");
  }
  if (EMOJI.test(code)) out.push("emoji");
  return out;
}

/** Every design rule rendered markup breaks: each element's class list, then the words. */
export function markupRuleBreaks(html: string): string[] {
  const out = new Set<string>();
  for (const [, classes] of html.matchAll(/\bclass="([^"]*)"/g)) {
    for (const rule of colourBreaks(classes)) out.add(rule);
    if (TINY_TEXT.test(classes)) out.add("text under 13 px or outside the ui- sizes");
    if (CODE_STYLE.test(classes)) out.add("code-style label (uppercase, mono, wide tracking)");
    if (WIDE_TRANSITION.test(classes)) out.add("transition on more than transform/opacity");
    if (ANIMATION.test(classes) && !ANIMATION_OFF.test(classes)) out.add("animation without motion-reduce:animate-none");
    if (MOVE_TRANSITION.test(classes) && !TRANSITION_OFF.test(classes)) {
      out.add("transition without motion-reduce:transition-none");
    }
  }
  const words = html.replace(/<[^>]*>/g, " ");
  if (/(^|\s)\/\/ /.test(words)) out.add('"// label" eyebrow');
  if (EMOJI.test(words)) out.add("emoji");
  return [...out];
}
