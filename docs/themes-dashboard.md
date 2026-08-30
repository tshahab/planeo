# Themes and personal dashboards

Planeo stores light, dark, or system theme and dashboard layout per user and workspace. A small pre-render script applies the theme cookie before content paints; system mode also follows operating-system changes. Semantic surface, canvas, border, text, focus, and accent tokens provide high-contrast light and dark rendering, while reduced-motion preferences are respected.

Dashboard layout version 1 includes assigned work, overdue issues, notifications, sprint progress, releases, integration delivery reports, and saved filters. Users can show or hide widgets, choose half or full width, move them with keyboard-accessible buttons, apply accessible-project filters, or reset defaults. The API discards unknown widgets and inaccessible project filters, so removed permissions and future layout versions degrade safely.
