# Email templates

Paste each file into Supabase: Authentication > Emails > Templates.

| File | Template | Subject |
|---|---|---|
| reset-password.html | Reset password | Reset your SYNERGY password |
| invite-user.html | Invite user | You're invited to SYNERGY |

Keep `{{ .ConfirmationURL }}` and `{{ .Email }}` exactly as written. They are filled in by Supabase.
Colours match the app: background #070817, card #101231, accent #6B6FE3, text #EEF0FF.
