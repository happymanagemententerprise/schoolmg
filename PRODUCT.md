# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- School administrators manage people, classes, subjects, school setup, timetables, progression, and reporting.
- Teachers manage assigned classes and subjects, attendance, scores, assignments, lessons, quizzes, and discussions.
- Students and parents use role-scoped portals for school results, attendance, assignments, and timetables; parents can view information for linked children.
- SaaS platform owners onboard schools and manage school subscriptions separately from school administrators.
- Security guards and hostel supervisors use their scoped campus registers.

## Product Purpose

Happy Campus is a school management web app connecting school administration, mentors, parents, and students through role-appropriate access to school records and learning workflows. Success means school staff can complete daily work accurately and families can find current school information without navigating tools meant for other roles.

## Positioning

No differentiated market-positioning claim has been confirmed. Do not invent one.

## Operating Context

Administrators and staff use the app during the school day on laptops and phones. The dashboard should put daily tasks and alerts first. Users sign in with Supabase Auth; local demo mode stores changes in the browser and does not save them to the school database.

## Capabilities and Constraints

- The current app is a Vite single-page web app with a shared data layer backed by Supabase.
- School workflows include people, classes, subjects, attendance, grading and reports, progression, timetables, assignments, lessons, quizzes, discussions, events, analytics, and campus safety.
- Student, parent, teacher, administrator, security, hostel, and SaaS-owner navigation is role scoped in the app. Database RLS is also part of the security boundary.
- SaaS-owner onboarding creates a school and its first administrator account, then associates a subscription tier. The onboarding RPC must exist in the target Supabase project for plan loading to work.
- Push alerts, campus safety services, and scheduled notifications depend on server-side Supabase Edge Function configuration. Do not imply that local demo mode saves or sends real alerts.
- Database migrations establish school-scoped records, but the app does not yet provide active-school switching. Do not claim that multi-school administration is complete.
- Campus safety is for administrators and security guards. Hostel supervisors retain their separately labeled hostel register access.
- Parent dashboard guardian badges and engagement panel are not part of the desired parent dashboard.

## Brand Commitments

Happy Campus is the web app name. Keep the existing Happy Management identity and logo as its parent brand; retain the supplied dashboard screenshot as the user's layout reference. The app should feel like a practical data workspace with clear navigation, scan-friendly summaries, useful charts and lists, and responsive behavior. The reference is inspiration, not permission to copy another company's logo, wording, or specific metrics.

## Evidence on Hand

- Existing app source and workflows: `src/`, `index.html`, `data.js`, and `README.md`.
- Existing Happy Management logo asset supplied by the user in the conversation. Do not redraw or replace it without a reason.
- The user supplied reference screenshots for a modern, scan-friendly dashboard and asked to use them as layout inspiration, not as product evidence.
- No customer testimonials, verified outcome metrics, or market comparisons have been supplied. Do not fabricate them.

## Product Principles

1. Show each role only the work and records appropriate to that role.
2. Prioritize the next useful school-day action and relevant alerts.
3. Preserve data integrity and make demo-versus-live behavior clear.
4. Keep essential school workflows usable on both laptops and phones.
5. Treat tenant boundaries and database policies as product behavior, not merely interface details.
