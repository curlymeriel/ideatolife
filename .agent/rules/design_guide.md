---
description: Design System & UI Style Guide for consistent application development
---

# Design Guide (V2)

Use this guide for ALL UI implementation tasks to ensure consistency with the established "FinMani" aesthetic.

## 1. Color Palette (CSS Variables)

Always use these CSS variables instead of hardcoded hex values or generic Tailwind colors.

### Core Colors

- **Primary (Orange)**: `var(--color-primary)` (#FFAD75) - Used for accents, highlights, active states, and key call-to-actions.
  - Hover: `var(--color-primary-hover)`
  - Dim/Background: `var(--color-primary-dim)`
- **Background (Deep Dark)**: `var(--color-bg)` (#0B0B0F) - Main page background.
- **Surface (Dark Gray)**: `var(--color-surface)` (#15151A) - Card backgrounds, panels, modals.
  - Hover: `var(--color-surface-hover)`
- **Text**:
  - Main: `var(--color-text)` (#ECECEC) or `text-white` - Body text, headings.
  - Muted: `var(--color-text-muted)` (#888890) or `text-gray-400` - Secondary labels, hints.
- **Border**:
  - Default: `var(--color-border)` (#2A2A30)
  - Highlight: `var(--color-border-highlight)`

## 2. Component Styles

### Cards & Panels

- **Background**: `bg-[var(--color-surface)]`
- **Border**: `border border-[var(--color-border)]`
- **Radius**: `rounded-xl` or `rounded-lg`
- **Hover**: Optional `hover:border-[var(--color-primary)]/50` or `hover:bg-[var(--color-surface-hover)]` for interactive cards.

### Inputs & Textareas

- **Background**: `bg-[var(--color-bg)]` or `bg-black/20`
- **Border**: `border border-[var(--color-border)]`
- **Text**: `text-white` or `text-gray-300` (NEVER use primary color for long-form text content)
- **Placeholder**: `placeholder-gray-600`
- **Focus**: `focus:border-[var(--color-primary)]` `outline-none`

### Buttons

- **Primary**: `bg-[var(--color-primary)] text-black font-bold hover:bg-[var(--color-primary-hover)]`
- **Secondary/Ghost**: `bg-transparent border border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]`
- **Icon Button**: `text-gray-400 hover:text-white` or `hover:text-[var(--color-primary)]`

### Typography

- **Headings**: `font-bold text-white`
- **Section Labels**: `text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-bold` or `font-semibold`
- **Body Text**: `text-sm text-gray-300 leading-relaxed`

## 3. Layout & Spacing

- **Gap**: `gap-4` is standard for standard grids/flex layouts. `gap-2` for tighter clusters (tags, metadata).
- **Padding**: `p-4` or `p-6` for container padding. `p-2` or `p-3` for compact internal spacing.

## 4. Visual Effects

- **Glassmorphism**: Use sparingly. `bg-black/30 backdrop-blur-md border-white/10`.
- **Transitions**: `transition-all duration-200` or `duration-300` for hover states.

## 5. Icons

- Use **Lucide React** icons.
- Default size: `size={16}` or `size={18}`.
- Colors: `text-[var(--color-text-muted)]` for inactive, `text-[var(--color-primary)]` for active/accent.

## 6. Do's and Don'ts

- **DO**: Use `var(--color-primary)` for emphasis, icons, and active borders.
- **DO**: Keep long text readable (white/light gray on dark background).
- **DON'T**: Use `var(--color-primary)` for body text (it causes eye strain and looks like debug text).
- **DON'T**: Use raw Tailwind colors like `bg-gray-800` or `text-orange-500`. ALWAYS use the variable abstractions.
