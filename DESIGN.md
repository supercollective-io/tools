---
name: Supercollective Tools
description: Functional, bold interfaces for collective participation and operation.
colors:
  ink: "#191919"
  paper: "#f3f3ef"
  white: "#ffffff"
  muted: "#555650"
  line: "#bfc1b8"
  field-border: "#85877e"
  state-lime: "#e3fa49"
  olive: "#354f12"
  focus-blue: "#2455cc"
  error-red: "#9f2822"
typography:
  display:
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif'
    fontWeight: 750
    fontSize: "5rem"
    lineHeight: 0.96
    letterSpacing: "-0.035em"
  body:
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif'
    fontWeight: 400
    fontSize: "18px"
    lineHeight: 1.5
  label:
    fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif'
    fontWeight: 600
    fontSize: "14px"
rounded:
  none: "0px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    rounded: "{rounded.none}"
    padding: "12px 16px"
    height: "48px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "12px 16px"
  input-default:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "12px"
---

# Design System: Supercollective Tools

## Overview

**Creative North Star: Functional confidence.**

The interfaces use a strict, high-contrast graphic language: near-black ink, a warm neutral ground, bold type, strong rules, and square controls. The result is direct and assertive while keeping the participant’s current task easy to find. Helvetica Neue with Helvetica and Arial fallbacks is an intentional local stack.

Hub, Polymind, and Puck are separate applications with related visual foundations and some surface-specific choices. Their controls communicate real actions and states. Do not add slogans, performance rhetoric, or other non-functional interface copy.

**Key Characteristics:**

- Functional, almost Swiss structure with a bold typographic hierarchy.
- Flat surfaces, square corners, and clear borders.
- State accents vary by application and surface; preserve those distinctions.

## Colors

Near-black and neutral light surfaces carry the interfaces. Lime marks selected or current states on Hub and Polymind session/projection surfaces; olive is limited to Puck arena/link accents and legacy Polymind status/follow text. Blue is the shared visible keyboard focus colour, except for the Polymind projection fullscreen control, which uses lime.

### Primary

- **Ink** (#191919): Main text, strong rules, and filled controls.

### Secondary

- **State lime** (#e3fa49): Selection and active-state emphasis in Hub, Polymind session, and projection surfaces.
- **Olive** (#354f12): Puck links and arena indicators, plus legacy Polymind continuous status/follow text. It is not a primary button or focus colour.

### Neutral

- **Paper** (#f3f3ef): Main light page background.
- **White** (#ffffff): Form fields and participant cards.
- **Muted** (#555650): Secondary text.
- **Line** (#bfc1b8): Dividers and low-emphasis borders.
- **Field border** (#85877e): Form control borders.
- **Focus blue** (#2455cc): Visible keyboard focus across the applications; the projection fullscreen control is the lime exception.
- **Error red** (#9f2822): Form error text; individual surfaces also use nearby semantic red values.

## Typography

**Display Font:** Helvetica Neue (with Helvetica, Arial, sans-serif fallbacks)  
**Body Font:** Helvetica Neue (with Helvetica, Arial, sans-serif fallbacks)  
**Label/Mono Font:** No separate label or mono family is defined.

**Character:** A single sans-serif family keeps labels and content practical. Tight, heavy headings provide the bolder voice; body text remains open and readable.

### Hierarchy

- **Display** (750, 5rem, 0.96): Hub’s main heading at wide viewports; it reduces on narrow screens.
- **Headline** (600–700, 1.8–2.5rem, about 1.08–1.2): Participant prompts and application-level headings, adjusted by surface.
- **Title** (600, 1–1.5rem): Section and compact masthead headings.
- **Body** (400, 18px/1.5 where declared): General reading and form content. Other surfaces use smaller sizes for dense operator controls.
- **Label** (600–700, 13–14px on compact surfaces): Field names, status, and control labels.

## Layout

Use a clear content column for participant tasks and wider grids for operator work. Observed page widths range from 44–46rem for compact Polymind participant forms, 1120px for Puck, 1200px for Hub, and up to 1800px for Polymind’s live session. Polymind’s live session uses a two-column desktop workspace and stacks on narrow screens; participant cards use a two-column grid where space permits. Hub’s two-column invitation layout and operator activity grid collapse to a single column below 760px. Keep gutters consistent within each surface: common values are 12–24px, with 20px phone page gutters and 3vw wide-session gutters.

## Elevation & Depth

The observed system is flat and does not use box shadows. Depth comes from contrast, borders, spacing, strong rules, and state fills. Do not introduce shadow tokens unless the implementation establishes them.

## Shapes

Controls, fields, badges, and cards are generally square (`border-radius: 0`). Borders define containment instead of rounded, elevated cards. One Polymind live-session error notice uses a 4px radius; retain that local exception rather than broadening it into a system-wide radius.

## Components

### Buttons

Buttons are compact, square, and action-led. Primary controls use a near-black fill with light text; secondary controls use a transparent or paper fill with a visible border. Preserve each application’s hover treatment and the shared blue focus colour.

- **Shape:** Square corners (0px); 44–52px minimum height depending on surface.
- **Primary:** Ink fill and white text. Typical padding is 7–12px vertically and 12–20px horizontally; Hub uses 15px 20px.
- **Secondary:** Transparent or paper fill with ink text and a border.
- **Hover / Focus:** Use the surface’s existing hover fill. Keep a visible blue focus outline (#2455cc); the Polymind projection fullscreen control is the lime exception.
- **Disabled:** Reduce opacity and use the surface’s existing non-interactive cursor.

### Cards / Containers

- **Corner Style:** Square (0px), except the noted live-session error notice.
- **Background:** White for fields and participant cards; paper for page surfaces.
- **Shadow Strategy:** None; borders and contrast establish edges.
- **Border:** Use the neutral line token or the darker field border according to emphasis. Polymind’s continuous participant cards are a local exception: no full border, with a 2px ink top rule.
- **Internal Padding:** Commonly 14–20px for cards and 9–16px for fields.

### Inputs / Fields

White backgrounds, square corners, and a 1px neutral or field-border stroke are the recurring form treatment. Text areas can resize vertically. Disabled fields use a pale neutral fill. Focus remains visible with an outline rather than a shadow.

### Navigation

Navigation is restrained: inherited ink text, medium or semibold weight, and simple underlines for links where used. The Polymind session masthead uses a strong 3px ink bottom rule and compact controls; Puck links use olive.

### State markers

Badges and active selections use a flat colour fill and bold text. Hub and Polymind session use lime. Puck uses lime fill with an olive outline for selected arena targets; olive also marks its arena/magnet graphics. Continuous Polymind uses olive for status/follow text.

## Do's and Don'ts

### Do:

- **Do** use the local Helvetica stack and the observed ink, paper, and white foundations.
- **Do** keep controls square, flat, bordered, and easy to identify as actions.
- **Do** retain the lime, olive, and focus-blue assignments described above for their respective surfaces.
- **Do** let participant tasks lead and allow operator views to use wider grids.
- **Do** preserve visible keyboard focus and responsive single-column reflow.

### Don't:

- **Don't** add slogans, performance rhetoric, or non-functional text to the interface.
- **Don't** replace the square control language with rounded pills, soft cards, or decorative shadows.
- **Don't** use olive as a primary button or focus colour; it marks local links, arena graphics, and legacy status text.
- **Don't** add external fonts or decorative imagery as part of this visual system.
