# Official-source catalog baselines

Collected on 5 November 2026. `manifest.json` records the exact counts, collection timestamps, and SHA-256 of each gzip file. The build validates the hashes, bounds decompression, validates official source URLs, and refuses a production catalog smaller than these baselines.

| Provider | Entries | Provenance |
| --- | ---: | --- |
| Bin Baz | 24,136 | Titles and URLs extracted from 2,040 official listing pages; official robots.txt allowed these paths. Fatwa numbers are unique. |
| Ibn Uthaymeen | 16,781 | Titles encoded in published lesson URLs in the official sitemap, deduplicated by lesson UUID. Includes lessons as well as question-and-answer materials. |
| Al-Fawzan | 25 | 24 individual question pages and one fatwa-program recording archived from the official site. Each included recording returned a successful audio response from the archive. |

Bin Baz and Ibn Uthaymeen answers are fetched from their official sources when opened. These seeds do not contain their answer bodies. Al-Fawzan entries preserve original question text where available, the official page URL, the archived page URL/date, and a separately verified archived recording URL/date. They contain no invented answer transcript. The UI identifies the archive and plays the original recording within the app; a program recording may contain several questions.

The Al-Fawzan site's certificate was expired during collection. A fresh SSL Labs report confirmed a validity-check failure; no certificate verification was disabled. Public Internet Archive CDX responses intermittently failed, so coverage is partial. Archive maintenance preserves its resume key and verified records in ignored `catalog-cache/fawzan-archive-progress.json`.

Maintenance:

```sh
node scripts/save-fatwa-seed.mjs /path/to/verified-official-catalog.json
node --use-env-proxy scripts/collect-fawzan-archive.mjs
node scripts/save-fatwa-seed.mjs catalog-cache/fawzan-archive-catalog.json
```

The archive collector is an explicit maintenance command, not an ordinary deploy step. It uses bounded requests, a pause between captures, a time/page budget, official-source host checks, and an archive-host allowlist. Missing audio or unreadable pages never become answers. Review count and provenance changes before committing new baselines. It does not require an API key and never downloads full recordings into the repository.
