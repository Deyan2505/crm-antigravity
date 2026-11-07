# Client Hub 360 — field map: Google Sheets → Neon → API → UI (Stage 2A)

Neon PostgreSQL is the only operational source. The Google Sheet "ARIE — Клиенти и запитвания" is a reference (field list, service catalog,
dictionaries, historical Tally copy). It was **read** (column headers + the Услуги / Настройки / Ръководство tabs only, no client rows, nothing
written). There is no two-way sync, no Make.com, and no automatic merge of profiles (never by e-mail, phone or name).

Legend: **exists** = works with today's schema · **003** = needs `migrations/003_client_hub.sql` · **2B** = not in Stage 2A.

## Sheet tabs (12, real names)

Запитвания · Клиенти · Услуги · Настройки · Ръководство · Tally — Входящи · and the six form tabs, named after the Tally forms:
`<blank, then> Запитване за проект` (Portfolio BG) · `ARIE Portfolio — Project Inquiry` (EN) · `ARIE Portfolio — פנייה בנושא פרויקט` (HE) ·
`ARIE Learning — Запитване за образователна платформа` (BG) · `ARIE Learning — Educational Platform Inquiry` (EN) · `ARIE Learning — פנייה בנושא פלטפורמה לימודית` (HE).

## «Запитвания» (28 columns) → CRM

| Sheet column | Neon | API (`GET /api/clients/:id/hub`) | UI | Status |
|---|---|---|---|---|
| ID на запитване | `leads.id` | `inquiries[].id` | Inquiries tab | exists |
| Получено на | `leads.created_at` | `inquiries[].created_at` | Inquiries tab | exists |
| Източник | `clients.source`, `leads.source` (`Tally`) | `client.source`, `inquiries[].source` | profile, chips | exists (sheet values Калкулатор/Директна форма/Друго are not stored → 2B) |
| Статус | `clients.status` (New/Contacted/Meeting/Proposal/Won/Lost) | `client.status` | status badge | exists (sheet dictionary differs, see below → 2B) |
| Приоритет | — | — | — | 2B |
| Име / Фирма / Имейл / Телефон | `clients.name/company/email/phone` | `client.*` | profile + edit | exists |
| Предпочитан контакт | `clients.preferred_contact` (Phone/Email/WhatsApp/NoPreference/Unspecified; original wording stays in the answers) | `client.preferred_contact` | profile | exists |
| Държава | `clients.country` | `client.country` | profile + edit | **003** |
| Език | `clients.lang` (language of the form) | `client.lang` | chip, profile | exists |
| Вид проект | `clients.project_type` (Learning: the topic) | `client.project_type` | project card | exists |
| Избрани възможности | `clients.service_type`; `leads.data.details.features` | `client.service_type`, `inquiries[].data.details.features` | project card | exists |
| Основен език на сайта / Други езици | `leads.data.details.siteLang` + original answers | `inquiries[].data` | project card, original answers | exists (read from the stored answers) |
| Ориентир от € / до € / Валута | `clients.price_range` (TEXT as the calculator sent it, currency not recorded) | `client.price_range` | project card "Budget" shown as-is | exists; numeric min/max + currency → 2B |
| Желан срок | `leads.data.details.timing` | `inquiries[].data.details.timing` | project card | exists |
| Кратко описание | `clients.notes` | `client.notes` | project card | exists |
| Съгласие за данни | inside the original answers only | `inquiries[].data` | original answers | exists as text; explicit consent flag → 2B |
| Tally submission ID | `clients.tally_submission_id` (unique), `leads.data.submission_id` | both | inquiry footer | exists |
| Клиент ID | `leads.client_id` (explicit link) **or** exact submission id fallback | `inquiries[].link` = `explicit` / `submission` | inquiry chip | explicit link **003**; submission-id fallback exists |
| Последен контакт | derived: newest non-note `client_activities.occurred_at` (not stored twice) | `last_contact_at` | stat card | **003** |
| Следващо действие | `clients.next_action` + `clients.next_action_due` (DATE) | `client.next_action`, `client.next_action_due` | next-action banner | **003** |
| Бележки | profile text `clients.notes`; history `client_activities` (kind `note`) | `client.notes`, `activities[]` | History tab | history **003** |
| URL източник | not stored | — | — | 2B |

## «Клиенти» (14 columns)

| Sheet column | Neon | Status |
|---|---|---|
| Клиент ID, Създаден на | `clients.id`, `clients.created_at` | exists |
| Име / контакт, Фирма, Имейл, Телефон | `clients.name/company/email/phone` | exists |
| Държава | `clients.country` | **003** |
| Предпочитан език | `clients.lang` (form language) | exists (a separate "preferred language" is not modelled) |
| Предпочитан контакт | `clients.preferred_contact` | exists |
| Статус клиент (Потенциален/Активен/Неактивен) | no equivalent: `clients.status` is the sales pipeline, not the client lifecycle | 2B |
| Свързани запитвания | computed list on the hub (`inquiries[]`) | exists (many per client with `leads.client_id`, **003**) |
| Последен контакт / Следваща задача / Бележки | see above | **003** / **003** / exists |

## Other tabs

| Tab | Content | Use in 2A |
|---|---|---|
| Услуги | catalog: Код, Услуга (BG/EN), Категория, Активна за форма, Поддържана в калкулатор, Бележки (10 rows: 4 project types, 6 features) | reference only; services stay text in `clients.service_type` / `project_type`; a `services` table → 2B |
| Настройки | dictionaries: Статус (Ново, За връзка, В разговор, Изпратена оферта, Спечелено, Отказано, Архивирано), Източник, Приоритет, Език, Предпочитан контакт, Статус клиент | reference only. CRM statuses today: New, Contacted, Meeting, Proposal, Won, Lost. Proposed mapping Ново→New, За връзка→Contacted, В разговор→Meeting, Изпратена оферта→Proposal, Спечелено→Won, Отказано→Lost, Архивирано→(archive, 2B) — to be confirmed by the owner |
| Ръководство | usage notes (partly outdated: says no Tally form is connected) | none |
| Tally — Входящи + six form tabs | historical copy of Tally answers: Submission ID, Respondent ID, Submitted at, services, price_range, lang + one column per question | not imported; the originals live in `leads.data` (`details.answers`, label + value, exactly as received) and are only read |

## What the migration adds (all additive, idempotent, no backfill, no existing row changes)

`clients.country`, `clients.next_action`, `clients.next_action_due` · `leads.client_id` (nullable FK, `ON DELETE SET NULL`) + index · table `client_activities`
(`kind` note/call/email/whatsapp/meeting, `body`, `occurred_at`, author, timestamps; FK `ON DELETE RESTRICT`).
Until it is applied, the hub still works read-only (profile, project, inquiries by exact submission id); the history and next action show a notice
and the writes answer `409 MIGRATION_REQUIRED`. Tally webhooks do not depend on it (they never write the new columns).
