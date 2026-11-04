# Instagram feed setup (Behold)

The "From the feed" section on the public site shows the **6 most recent @abs_qu posts as cards**, automatically, using [Behold](https://behold.so). Behold is a third-party service that reads your Instagram account and serves the latest posts as a small data file; the website turns that into the cards you see. You do the one-time connection yourself (it needs your Instagram login, which this project never sees).

**Status: connected** (feed URL is set in `docs/index.html`). If you ever need to redo it, the steps below still apply. With no feed URL, the section shows a "Follow @abs_qu" card instead; nothing is broken.

> **Cost:** Behold has a free plan. When this was set up, its pricing page listed: **$0/month, 1 connected account, 1 feed, up to 6 posts, refreshed once a day, about 1,200 feed views a month**, with a small Behold logo on hover. Check [behold.so/pricing](https://behold.so/pricing) yourself before you sign up — plans change. Don't pick a paid plan unless you want one. The website keeps a copy of the feed in each visitor's browser for 3 hours, so repeat visits don't use up your monthly views.

## Steps (about 10 minutes)

1. Go to **https://behold.so** and create an account (**Sign up**), preferably with the club's email.
2. In the dashboard, click **Create feed** (wording may differ slightly) and connect **Instagram**. Log in as **@abs_qu** when Instagram asks, and approve access. *(If Behold says the account type isn't supported, switch @abs_qu to a free **Professional/Creator** account in Instagram → Settings → Account type, then retry.)*
3. Choose the **JSON feed** option (not a widget). Set the number of posts to **6**, then **Save**.
4. Behold shows a feed URL that looks like `https://feeds.behold.so/AbCdEf123456`. **Copy it.** (It's safe to put in the website — it's a public read-only link, not a password.)
5. Open `docs/index.html`, find the line:
   ```html
   <div class="feed__grid" id="feed" data-feed="">
   ```
   and paste the URL between the quotes:
   ```html
   <div class="feed__grid" id="feed" data-feed="https://feeds.behold.so/AbCdEf123456">
   ```
   (Or send the URL to Claude and ask it to do this.)
6. Deploy: `firebase deploy --only hosting`
7. Open the live site, scroll to **Gallery → From the feed**. You should see six cards. Click one — it opens that post on Instagram.

## Good to know

- **New posts** show up on the site within about a day (Behold refreshes once a day on the free plan, and visitors' browsers keep a copy for 3 hours).
- **If Behold is down or you hit the monthly view limit**, the site quietly falls back to the "Follow @abs_qu" card (or the last copy a visitor already has). Nothing else on the site is affected.
- **Private/deleted posts** disappear from the feed on Behold's next refresh.
- To **stop using Behold**, empty the `data-feed` attribute again and delete the feed in Behold.
- What the site loads from Behold: one small JSON file from `feeds.behold.so`, plus the post pictures from Behold's image CDN. No cookies and no Behold script is added to the page.
