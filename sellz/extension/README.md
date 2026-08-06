# LevoZ Filler

A Chrome extension that fills a marketplace listing form with a draft written
in LevoZ. **You review it and press post yourself.**

## What it does and does not do

Depop, Vinted and Grailed publish no listing API for individual sellers, so
nothing can post on your behalf. What an extension *can* do is fill the form
you are already looking at, in your own browser, in your own logged-in session.

Three rules hold, and they are the difference between assistance that
marketplaces tolerate and automation that gets accounts suspended:

1. **It fills a form. It never submits one.** No code path in this extension
   clicks a post, publish or save button.
2. **It acts once per click in the LevoZ app.** No timers, no queue that
   drains itself, no retries, nothing running while you are not looking.
3. **It runs in your browser and your session.** It never sees a marketplace
   password and never sends a request from our servers on your behalf.

What gets sellers banned is the other category — share bots, auto-follow,
hourly bumps, relist loops, and cloud bots logging in from datacenter IPs.
This extension does none of it, and adding any of it would change what it is.

Cross-listing itself is not against any of these platforms' terms. Simulating
your ongoing activity is.

## Installing it while developing

1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select this `extension/` folder
3. Copy the extension id Chrome shows you
4. Set `NEXT_PUBLIC_EXTENSION_ID` to that id and restart the app

The "Fill this in on …" button only appears when the app can ping an installed
extension, so it stays hidden for everyone else.

`externally_connectable` in the manifest lists which origins may talk to the
extension. It allows `localhost` and `*.levoz.app` — add your production domain
there before publishing, or the button will never work in production.

## The selectors need fixing

**The field selectors in `fill/*.js` are unverified.** They could not be
captured from the live pages: every compose form is behind a login, and the
sites sit behind bot protection. They are written from the shape these apps are
known to use, and should be treated as first guesses.

To correct one: open the marketplace's compose page, right-click the field,
Inspect, and prefer a `data-testid` or `name` attribute over a generated class
name — the class names change on every deploy.

A wrong selector is safe. `waitFor` resolves null, the field is reported as
missing, and the banner tells you to fill that one in yourself. The worst case
is a form that fills partially and says so.

Dropdowns — category, brand, size, condition — are deliberately not automated.
They are custom components rather than `<select>` elements, driving them
reliably is a losing game, and a wrong category is worse than an empty one.
They take seconds by hand and are named in the banner.

## Publishing

Chrome Web Store review takes days and asks for a privacy policy plus a
justification for each permission. The honest answers are short: `storage`
holds one draft for up to ten minutes, `tabs` opens the compose page, and the
host permissions are the three marketplaces whose forms it fills. It requests
no host permission on LevoZ itself — the app sends photos as data URLs
precisely so the extension never needs standing access to your account.
