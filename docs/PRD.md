# CareLog: Product Requirements Document

Live app: https://carelog-sigma.vercel.app

## 1. Purpose

CareLog is a shared care log for families who take turns looking after someone (a parent, a newborn, a pet). Everyone sees one record of what was done, written under their own name. Care is handed over explicitly, and unfinished jobs stay on the list until someone closes them.

CareLog records what people enter. It never recommends doses, judges safety, or diagnoses.

## 2. Users and roles

| Role | Can do |
|---|---|
| Owner | Everything, including invite and remove people |
| Family caregiver | Record, correct, hand off, open items, money, documents, emergency links |
| Paid carer | Record, hand off, open items. Cannot see private notes or money |
| Clinician | Read-only, access expires automatically |
| Neighbour | Log a visit, view the emergency card |
| Recipient | Read-only |

## 3. Sign-in

- Sign-up needs a name, a valid email and a password of at least 8 characters.
- Duplicate email: show "An account with that email already exists."
- Wrong password: show "That email and password do not match."
- Signed-out users see only the landing and sign-in screen.
- A signed-in user stays signed in after a page refresh.

## 4. Core flows and acceptance criteria

### 4.1 Create a care circle (home page)
- The user names the circle, names the person cared for, chooses a type and a time zone, and may tick "Start with an example daily schedule".
- On success the user lands on the **Today** tab for that circle.
- With the example schedule ticked, Today lists three items (for the default type: Morning medication 08:00, Lunch 12:30, Evening medication 20:00).

### 4.2 Record a dose (Today tab)
- Each scheduled item has **Mark given**, **Refused** and **Skipped**.
- After **Mark given**, the item shows "given by <name> at <time>" and the buttons disappear. A "Recorded." message appears.
- **Rule: an item can be completed only once per day.** If someone else already recorded it, no second record is created and the user is told who recorded it and when.
- A real second administration can be recorded as an *additional entry* with an explanation. It shows in a warning style and the first record is unchanged. Submitting it with no explanation is rejected.
- **Rule: wording.** An item whose time has passed with nothing recorded shows "No administration recorded" and "Scheduled time passed; no administration recorded. Check before assuming." The word "missed" must never appear.
- An item whose time has not passed shows "Upcoming".

### 4.3 Quick log (Today tab)
- Typing "gave Dad his morning medication at 8am" shows a preview "Will record: Morning medication".
- Pressing **Log** records that item. Logging the same item again shows "Already recorded by <name>".
- "Dad fell in the bathroom" is saved as an incident note.

### 4.4 Notes
- **Add a note** saves a note with a type (observation, incident, reading and so on). A private note is visible only to owners and family caregivers.

### 4.5 Timeline and corrections
- Timeline lists entries newest first with author, type and time.
- **Correct** requires new text and a reason. After saving, the entry shows the new text, the original text struck through, and a history line "<name> corrected this on <date>: <reason>". The original is never removed.

### 4.6 Handoff
- **Prepare a handoff** pulls together what was recorded since the last handoff, anything with no record, and all open items.
- A different person (not the author) sees **I have reviewed this handoff**. After clicking, "Acknowledged by <name>" appears.
- The author cannot acknowledge their own handoff.
- If an entry is corrected after the handoff was prepared, the handoff shows "Updated since you reviewed" or "Corrected since prepared".
- Acknowledging a handoff does not close any open item.

### 4.7 Open items
- **Add an item** with a title. It appears under Open items and on every handoff.
- **I will do this** assigns the item to the current user.
- **Close with outcome** requires an outcome. After closing it moves to Closed with the outcome text. Closing with an empty outcome is rejected.

### 4.8 People
- The owner can create an invite link for a role. The link works once.
- Opening the link while signed in as another user joins that circle with that role.
- The owner can remove a person. The removed person immediately loses access: their next request shows "That care circle is not available to you."
- The owner cannot be removed.

### 4.9 Other tabs
| Tab | Behaviour |
|---|---|
| Emergency | Create a link that lasts 1 to 72 hours. Opening `/e/<token>` without signing in shows a read-only packet (medications, allergies, last 48 hours, contacts). Revoked or expired links show an error. Private notes never appear. |
| Money | Add an expense. The summary splits costs equally between family caregivers in whole cents. |
| Care load | Log a shift or a break. Shows hours per person and a warning when one person has more than 60 percent. Private check-ins are visible only to their author. |
| Appointments | Add an appointment. One with nobody taking it appears as an open item. |
| Supplies | Track a count. Low stock opens a refill item once. Restocking closes it. |
| Documents | Add a document. "Include in the emergency packet" shows it on the public emergency page. |
| Digest | Shows a weekly summary and a repeated-words section with a non-diagnosis note. |

## 5. Testability notes

- Every interactive element has a stable `data-testid`, for example `mode-signup`, `auth-email`, `auth-password`, `auth-submit`, `new-circle`, `given-<itemId>`, `status-<itemId>`, `quicklog-input`, `quicklog-submit`, `prepare-handoff`, `ack-handoff`, `add-item`, `resolve-<itemId>`, `correct-<recordId>`, `invite`, `remove-<userId>`, `modal-submit`.
- Dialogs use the native `<dialog>` element. Fields inside have `data-testid="field-<name>"`.
- Which items show "No administration recorded" depends on the current time in the circle's time zone. To test that rule deterministically, add a scheduled item at 00:01 and check it shows "No administration recorded".
- To test the "already recorded" rule with two people, sign up a second account with a unique email (for example `name+<timestamp>@example.test`), have the owner create an invite, and accept it as the second user.
- Use a unique email for every sign-up.

## 6. Non-goals

Medical advice, dose recommendations, interaction checking, prescription scanning, offline editing, native mobile apps.
