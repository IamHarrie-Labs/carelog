# CareLog frontend direction

## Accepted references

Use the third generated Open items screen as the identity reference: an outlined linked-leaf emblem, a sans-serif CareLog wordmark, forest green navigation and practical task rows. Use Wispr Flow as the landing-page composition reference: pale cream, expressive serif headline, italic emphasis, generous whitespace and a restrained sage green action.

The generated emblem is a visual reference, not a finished vector master. Before implementation, create one approved SVG master and reuse it for the header, footer, app and favicon. Never ask an image generator to independently redraw the logo for each screen.

## Remove

- Announcement ribbon without actual news.
- Handwritten labels, torn paper scraps, vines, sparkles and tilted interface panels.
- Serif wordmark that contradicts the selected sans-serif identity.
- Decorative cards that compete with the primary action.
- Claims that imply a missing entry proves care was missed.
- Invented current caregiver or future shift assignments inferred from historical shift logs.
- Unsupported promises about medical safety, certifications, adoption or testimonials.

## Add

- A clear category sentence explaining shared family care immediately.
- A large, level product demonstration with a named recipient, attributed records and unresolved tasks.
- A persistent, unambiguous route to sign-in and a separate create-account action.
- Clear distinction between a handoff being reviewed and its tasks being completed.
- A short illustrated three-step explanation: invite the circle, record care, review the handoff.
- Contexts grounded in supported use: a parent at home, recovery and shared childcare.
- A source-linked correction example showing the original entry remains available.
- Real help/contact destination and accurate privacy/terms pages before a public launch; do not fabricate legal assurances.

## Visual specification

- Canvas: #FFFFEF; text: #192A26; forest: #193C34; sage green action: #D6E5C8; subtle rule: #DCDDD1.
- Forest remains the product identity. Lavender is a limited marketing action treatment.
- Typography: one editorial serif family with its own italic for marketing headlines; one readable sans family for wordmark, body, navigation and all app data. Choose licensed/self-hostable fonts at implementation.
- At 1440px: 1200px content width, 120px outer gutters, 80px navigation, 88px hero top space, 88px/1.08 display headline, 20px/1.5 introduction, 48px primary action, 64px gap to preview.
- 8px base spacing: 8, 16, 24, 32, 48, 64, 96. No decorative oversized gaps between related controls.
- Default body 16px minimum; small metadata 14px; restrained 8–12px corner radii; borders before shadows.
- Navigation: product mark left, How it works and What stays visible center, Sign in and Create a care circle right. Sign-in wording must stay distinct from toggles and form submission.
- Footer repeats the same emblem and sans wordmark; contains actual help and legal destinations, with no invented links.

## Product panel

Use a fixed, level preview. Header: Margaret's care, Sample handoff. Show a recorded lunch with author and time, an administration with no record, and a transport task with owner. Mark it Example, so the visitor cannot mistake sample content for their own data. Avoid medical dosage examples. Show the Open items layout from the selected third concept in later product detail sections.

## Responsive and interaction requirements

- Mobile: 20px gutters, 44–48px display headline, 48px controls; stack preview sections with readable text, never shrink the desktop screenshot to fit.
- Keep hero category, headline, explanation and primary action in order at every width.
- Visible keyboard focus, descriptive labels, logical heading order, sufficient contrast and reduced-motion support.
- Buttons show hover, focus, pressed, disabled and busy states; forms show field-level validation and preserve entered values after failures.
- Account routes and existing data-testid hooks must remain compatible with the browser suite. Any changed entry route must be reflected in the PRD and TestSprite journeys.
- Authenticated app requires coherent loading, empty, error, stale-data and success states. Do not claim a record saved before server confirmation.

## Verification before shipping

Inspect at 360, 390, 768, 1024 and 1440px; check keyboard navigation, 200% zoom, clipped italic descenders, no horizontal overflow, and all destinations. Run the existing API tests and TestSprite journeys after functional integration. Verify preview deployment before production. A concept image cannot establish accessibility, working interactions or production readiness.

## Approved implementation update

The user approved the reference-led editorial hero and sage controls, then explicitly removed the photographic surround. The implemented landing has a plain cream canvas. The shared product shell carries the third concept’s forest sidebar through every care section. Local font files, one SVG emblem, responsive account screens, and the conversation-to-record example are implemented. Public authentication now starts at #/login or #/signup.
