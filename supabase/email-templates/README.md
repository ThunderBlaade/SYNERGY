# Email templates

Paste each file into Supabase: Authentication > Emails > Templates.

| File | Template | Subject |
|---|---|---|
| reset-password.html | Reset password | Reset your SYNERGY password |
| invite-user.html | Invite user | You're invited to SYNERGY |

Keep `{{ .ConfirmationURL }}` and `{{ .Email }}` exactly as written. They are filled in by Supabase.
Colours match the app: alabaster #F6F5F1, white card, black #0C0C0D text and button, a thin iridescent line, small spaced-out labels. Light only, so it looks the same in every email app.
