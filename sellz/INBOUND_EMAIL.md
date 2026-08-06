# Setting up Depop sale detection

Depop publishes no listing API and its pages sit behind bot protection, so the
only reliable signal that something sold is the email Depop sends the seller.
This is how that email reaches the app.

The whole feature is optional. Skip it and the manual "mark sold" button in the
Depop tab does the same job by hand.

## How it works

```
Depop  ──email──▶  seller's inbox  ──forward rule──▶  sale-<token>@in.yourdomain
                                                              │
                                                     inbound email provider
                                                              │
                                                      POST /api/inbound/email
```

The seller sets one filter. Everything after that is automatic.

## What you need

1. A subdomain you can add DNS records to — `in.yourdomain.com`. Use a
   subdomain, not your root domain: MX records on the root would redirect all
   your normal mail to the provider.
2. An inbound email provider.
3. Two environment variables in Railway.

## Step 1 — pick a provider

**Resend** is the obvious default here, because this app already sends mail
through it. One account, one dashboard, one DNS section, no new vendor.

Two things about Resend's inbound to be aware of, both already handled in
`app/api/inbound/email/route.ts`:

- Its webhook payload nests everything under `data` and names the event in
  `type`, rather than posting flat fields.
- **The webhook carries metadata only** — sender, recipient, subject — not the
  body. The body is fetched afterwards over the REST API using `email_id`,
  which is what `fetchResendBody` does with your existing `RESEND_API_KEY`.

Anything that posts parsed mail also works — Mailgun Routes, Postmark, SendGrid
Inbound Parse, CloudMailin. Those post the full body, so no second fetch
happens. The route reads all of their field names.

## Step 2 — point the subdomain at the provider

In the provider's dashboard, add `in.yourdomain.com` as a receiving domain.
It gives you MX records. Add them at your DNS host:

```
in.yourdomain.com.   MX   10   <provider's inbound host>
```

Verification usually takes minutes. Do not add these to your root domain.

## Step 3 — set the environment variables

Generate a secret:

```sh
openssl rand -base64 32
```

In Railway → Variables:

```
INBOUND_EMAIL_DOMAIN=in.yourdomain.com
INBOUND_EMAIL_SECRET=<the string you just generated>
```

Both must be set. With `INBOUND_EMAIL_DOMAIN` unset the app won't hand out
forwarding addresses; with `INBOUND_EMAIL_SECRET` unset the webhook returns 503
and refuses everything.

## Step 4 — configure the webhook

Point the provider at:

```
https://yourdomain.com/api/inbound/email?key=<INBOUND_EMAIL_SECRET>
```

**The secret goes in the URL.** Most inbound providers do not let you set a
custom request header — SendGrid offers ECDSA signatures or OAuth, Resend signs
with Svix — but all of them let you choose the URL. The route accepts the
secret either way; the query string is what you will actually use.

On Resend, subscribe the webhook to `email.received`. Other event types are
ignored, but there is no reason to send them.

A secret in a URL can end up in access logs, which is the accepted trade for
working with every provider. Rotate it by changing the variable and the webhook
URL together. If you later want the stronger option, verifying the provider's
signature is a better gate than the query secret and can be added without
changing anything else.

## Step 5 — the seller's forwarding rule

Each seller does this once. In Gmail:

1. **Settings → Forwarding and POP/IMAP → Add a forwarding address**, and enter
   the address the app gives them. Gmail sends a confirmation email to it.
2. That confirmation arrives at the webhook, not their inbox — so grab the code
   from the app's logs, or use a provider dashboard that shows received mail.
   This is the fiddly part of the whole setup.
3. **Settings → Filters → Create a new filter**, from `depop.com`, action
   *Forward to* that address.

iCloud and Outlook have equivalent rules.

Filter on the sender rather than forwarding everything. The app ignores
non-sale mail, but there is no reason to send someone's whole inbox through it.

## Step 6 — check it

```sh
# Should be 401 — proves the gate is live
curl -s -X POST https://yourdomain.com/api/inbound/email

# Should be 200 with {"ignored":"unknown recipient"}
curl -s -X POST "https://yourdomain.com/api/inbound/email?key=$INBOUND_EMAIL_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"to":"sale-nosuchtoken@in.yourdomain.com","subject":"test","text":"test"}'
```

Then the real test, which nothing else substitutes for: **forward one genuine
Depop sale email** and check `GET /api/inbound` for the result. Forward a
non-sale too — a like, a follow, a marketing blast — and confirm it is ignored
rather than recorded as a sale.

## What to expect the first time

This code has never seen a real Depop email. Failure modes, worst first:

- **Wrong listing marked sold.** The serious one. Raise `AUTO_MATCH` in
  `lib/inboundEmail.ts`. Two listings that score close never auto-apply, but
  the threshold for "close" may need tuning to your inventory.
- **Everything sits in pending.** Either the thresholds are tight, or the
  forwarded mail lost its Depop origin so nothing is marked verified. The
  stored row shows which.
- **Nothing arrives.** Check the provider's delivery log. A 401 means the
  secret in the URL is wrong; a timeout means the app was cold.
- **Only subjects, no bodies.** Resend-specific: the body fetch failed. The
  route logs `[inbound] Resend body fetch failed`. Sales still get recorded but
  always as pending, because a subject alone is not enough to trust a match.

## A caveat worth reading

The Resend body-fetch endpoint in `fetchResendBody` was written from Resend's
published webhook documentation, not against a live account. If bodies never
arrive and the log shows a 404, that URL is what to check first — everything
else about the flow is independent of it.

There is also no UI yet for the forwarding address or the pending queue. Both
are API-only for now:

```sh
POST  /api/inbound              # mint the address
GET   /api/inbound              # address + anything awaiting confirmation
PATCH /api/inbound              # {saleId, listingId} to confirm, {saleId, dismiss:true} to drop
```
