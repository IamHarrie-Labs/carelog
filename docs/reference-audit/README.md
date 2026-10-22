# Wispr Flow reference audit

Captured on 22 October 2026 from https://wisprflow.ai/ and https://wisprflow.ai/notetaker. Screenshots are reference material, not CareLog product assets.

## Measured design system

| Property | Observed reference | CareLog implementation |
|---|---|---|
| Display font | EB Garamond, upright and italic | Self-hosted EB Garamond |
| UI font | Figtree | Self-hosted Figtree on marketing page |
| Canvas | #FFFFEB | #FFFFEB |
| Text | #1A1A1A | #1A1A1A |
| Teal | #034F46 | #034F46 |
| Olive surface | #E4E4D0 | #E4E4D0 |
| Major curves | 80px desktop | 80px desktop; 40px mobile |
| FAQ/switch panel | 32px | 32px |
| Primary controls | 2px charcoal border; 8px corners | Same border and radius; approved sage fill retained |

## Motion observations

- Hero: speaker-tagged transcript changes emphasis and gives way to small attributed action slips. CareLog implements a finite sequence with replay.
- Deep teal: short attributed snippets move around a large centered headline. CareLog ties snippet position to scroll.
- Walkthrough: a pinned visual is paired with a vertical feature index and changing explanatory copy. Mobile uses a sequential reading layout.
- Cards in the reference proof section stack during scrolling. CareLog uses care situations in the corresponding layout, without inventing customer testimonials.
- FAQ: a selected question controls a separate answer area. CareLog preserves the structure and provides keyboard navigation.
- Five motion-* frames sample scroll states. These are screenshots, not a complete video or a frame-perfect timing trace. Visible inline style samples are recorded in observed-motion.json.

## Deliberate CareLog differences

- Existing CareLog logo and wordmark are unchanged.
- The user-approved green action fill remains; the source uses lavender.
- Copy describes CareLog features and boundaries. No Wispr logo, endorsements, certifications, recordings or software installer is reused.
- Download CareLog offers installation as a web app and gives browser-specific instructions where a native install prompt is unavailable.
- Closing photography is an original generated CareLog asset; it is confined to the closing section, not a page-wide backdrop.

## Captures

36 PNG captures are saved in this directory.

### 01-dictation-hero

![01-dictation-hero](01-dictation-hero.png)

### 02-dictation-speed

![02-dictation-speed](02-dictation-speed.png)

### 03-dictation-how

![03-dictation-how](03-dictation-how.png)

### 04-dictation-features

![04-dictation-features](04-dictation-features.png)

### 05-dictation-privacy

![05-dictation-privacy](05-dictation-privacy.png)

### 06-dictation-stories

![06-dictation-stories](06-dictation-stories.png)

### 07-dictation-faq

![07-dictation-faq](07-dictation-faq.png)

### 08-dictation-download

![08-dictation-download](08-dictation-download.png)

### 11-notetaker-hero

![11-notetaker-hero](11-notetaker-hero.png)

### 12-notetaker-section

![12-notetaker-section](12-notetaker-section.png)

### 13-notetaker-section

![13-notetaker-section](13-notetaker-section.png)

### 14-notetaker-section

![14-notetaker-section](14-notetaker-section.png)

### 15-notetaker-section

![15-notetaker-section](15-notetaker-section.png)

### 16-notetaker-section

![16-notetaker-section](16-notetaker-section.png)

### 17-notetaker-section

![17-notetaker-section](17-notetaker-section.png)

### 18-notetaker-section

![18-notetaker-section](18-notetaker-section.png)

### 19-notetaker-section

![19-notetaker-section](19-notetaker-section.png)

### 20-notetaker-footer

![20-notetaker-footer](20-notetaker-footer.png)

### mobile-01-hero

![mobile-01-hero](mobile-01-hero.png)

### mobile-02-features

![mobile-02-features](mobile-02-features.png)

### mobile-03-faq

![mobile-03-faq](mobile-03-faq.png)

### mobile-footer

![mobile-footer](mobile-footer.png)

### mobile-section-01

![mobile-section-01](mobile-section-01.png)

### mobile-section-02

![mobile-section-02](mobile-section-02.png)

### mobile-section-03

![mobile-section-03](mobile-section-03.png)

### mobile-section-04

![mobile-section-04](mobile-section-04.png)

### mobile-section-05

![mobile-section-05](mobile-section-05.png)

### mobile-section-06

![mobile-section-06](mobile-section-06.png)

### mobile-section-07

![mobile-section-07](mobile-section-07.png)

### mobile-section-08

![mobile-section-08](mobile-section-08.png)

### mobile-section-09

![mobile-section-09](mobile-section-09.png)

### motion-0

![motion-0](motion-0.png)

### motion-1

![motion-1](motion-1.png)

### motion-2

![motion-2](motion-2.png)

### motion-3

![motion-3](motion-3.png)

### motion-4

![motion-4](motion-4.png)
