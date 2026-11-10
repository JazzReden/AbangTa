# Landing-page motion

`src/components/react-bits/Magnet.tsx` is the official TypeScript/CSS Magnet
component from https://github.com/DavidHDev/react-bits, retrieved November 8, 2026.
Its full MIT + Commons Clause license is retained next to the component.
No npm dependency or third-party runtime request is needed.

`LandingMagnet` limits displacement to 3px, with a 12px activation range.
It disables the effect for keyboard focus, coarse pointers, devices without
hover, and reduced-motion preferences. The original component is retained
without functional changes.

`LandingMotion` is AbangTa's own progressive section entrance enhancement.
Content is rendered visibly on the server; nothing depends on an animation
finishing to become readable. Sections move 12px once, for 440ms, and observers
and animations are cleaned up. Touch and reduced-motion users see static content.

The 60/30/10 color rule guides visual emphasis rather than exact pixel counts:
warm background is dominant (~60%), tan/white supporting surfaces provide grouping
(~30%), and orange is reserved for brand details and calls to action (~10%).
Existing palette tokens, 16–18px reading sizes, keyboard outlines and 48px
social targets remain in place. The rule does not change account, tenant,
landlord, database or billing behavior.
