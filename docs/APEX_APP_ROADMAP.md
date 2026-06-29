# Apex App Roadmap

Saved planning notes for Apex Detailers app development.

## Current cleanup priorities

- Remove old `launch pricing` wording from customer-facing generated messages.
- Use Apex package pricing / current pricing wording instead.
- Do not advertise or quote headlight restoration until the gear and process are ready.
- Keep the big Apex HQ V3 UI refresh separate until it has been tested properly.

## Preferred quote message wording

Replace:

```text
This includes Apex launch pricing. Access to an outside tap is required.
```

With:

```text
Final pricing may vary if the vehicle is heavily soiled or larger than expected. Access to an outside tap is required.
```

## Next deploy from home

Use this from Command Prompt or terminal once the repo is open locally:

```bash
cd apex-detailers-app
git pull
npm install
npm run build
firebase deploy --only hosting
```

## Google Calendar booking integration plan

Goal: when a booking is entered into Apex App, the app can save the job, create a Google Calendar event, add the customer as an attendee, send the calendar invite, and store the Google Calendar event ID for future updates.

### Stage 1 — Booking data structure

Booking/job records should include:

- customer name
- phone
- email
- vehicle
- service/package
- booking date
- booking start time
- estimated finish time or duration
- address/location
- notes
- booking status
- payment status
- voucher/referral code if used
- Google Calendar event ID later
- calendar sync status later

Recommended statuses:

- Lead
- Quote Requested
- Quote Sent
- Approved
- Booked
- Confirmed
- In Progress
- Completed
- Paid
- Needs Follow-Up
- Cancelled
- Archived

### Stage 2 — Manual calendar invite button

Start with a manual button, not full automation.

Button: `Create Google Calendar Invite`

Reason: Brad can double-check the booking before anything is sent to the customer.

Calendar status values:

- Not synced
- Calendar invite sent
- Calendar sync failed
- Needs update
- Cancelled

### Stage 3 — Store Google Calendar event IDs

Each booking should store:

- googleCalendarEventId
- calendarSyncStatus
- calendarInviteSentAt
- lastCalendarSyncAt
- calendarSyncError

This prevents duplicate calendar events when bookings are edited.

### Stage 4 — Update and cancel sync

Later buttons:

- Update Calendar Invite
- Cancel Calendar Invite
- Resend Invite

If the booking time changes in Apex App, update the same Google Calendar event.

If the booking is cancelled, cancel or delete the Google Calendar event.

### Stage 5 — Availability checking

Before confirming a booking, Apex App should check Google Calendar and warn if the selected time clashes with another event.

Later, the app can show available slots.

## Best technical approach

- Frontend: Apex App booking form
- Database: Firestore booking/job records
- Backend: Firebase Cloud Functions
- Auth: Firebase Auth / Google Sign-In
- Calendar: Google Calendar API

Calendar API work should be handled through Firebase Cloud Functions instead of exposing sensitive logic directly in the frontend.

## Calendar event format

Title:

```text
Apex Detailers - Deep Interior Detail - Customer Name
```

Location:

```text
Customer address
```

Description:

```text
Booking with Apex Detailers

Customer: Sarah Example
Phone: 021 xxx xxx
Email: example@email.com
Vehicle: Toyota Corolla
Service: Deep Interior Detail
Estimated duration: 2-3 hours
Notes: Please remove personal belongings before the appointment. Access to an outside tap is required.

Contact:
bookings@apexdetailers.co.nz
```

Do not automatically add Google Meet links.

## Booking features to add around calendar sync

- Booking confirmation message generator
- Day-before reminder message generator
- Job status pipeline
- Voucher/referral tracker
- Follow-up reminders
- Review request message button
- Customer history with jobs, photos, vouchers, referral credits and total spend
- Daily command centre showing today’s jobs, pending quotes, unpaid jobs and follow-ups due

## Voucher/referral tracker plan

Track:

- voucher code
- customer name
- phone
- vehicle
- original job date
- original service
- voucher value
- expiry date
- used/not used
- used date
- referral customer
- referral credit status
- notes

Suggested codes:

```text
APEX25-001
APEX25-002
REF25-001
REF25-002
```

Suggested rules:

- $25 return voucher
- valid for 3 months
- valid on bookings over $99
- one voucher per booking
- not redeemable for cash
- cannot be combined with other offers
- customer must mention voucher when booking
- referral credit is only issued after the referred customer completes and pays for their booking

## Cost and risk checks before adding bigger features

Check before coding:

- Firebase Storage costs from photos
- Firestore reads/writes from dashboards and live listeners
- Cloud Functions costs
- Google Calendar API permission scope
- customer data privacy
- duplicate calendar invites
- accidental invite sending before a booking is confirmed
- public upload risks
- future AI/photo quoting costs

## Recommended build order

1. Clean booking data structure
2. Add customer email and proper booking fields
3. Add booking status pipeline
4. Add manual Create Calendar Invite button
5. Store Google Calendar event ID
6. Add update/cancel calendar sync
7. Add day-before reminder message generator
8. Add voucher/referral tracker
9. Add availability clash warning
10. Add full daily command centre
