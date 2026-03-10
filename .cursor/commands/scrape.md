Use the @.cursor/skills/scrape/ skill to scrape the URL provided by the user. Parse the user's natural language input to determine:
1. The URL to scrape (Amazon book, series, or author URL)
2. The scraping strategy (how deep to cascade - only the item, shallow links, or full cascade)

Then enqueue the URL, run the worker until idle, and report the results.
