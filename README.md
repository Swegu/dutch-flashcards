# Woordjes – Dutch flashcards

Learn Dutch words with spaced repetition, accounts, score and progress tracking.
Words, English meanings, grammatical articles (`de`/`het`), IPA, and example sentences are downloaded online on first start (nothing is hard-coded).

## Run

```bash
docker compose up -d --build

Open http://localhost:3000. The first start downloads the dictionaries and builds the word list
(a few minutes, the page shows progress). Create an account and start learning.

Update after changing code: docker compose up -d --build. Stop: docker compose down (data is kept in the data volume).
Without cloning (prebuilt x86-64 + ARM64 image)

Run this in an empty folder. It saves docker-compose.yaml into that folder and starts the app:

curl -fsSL -o docker-compose.yaml [https://raw.githubusercontent.com/Swegu/dutch-flashcards/main/docker-compose.example.yaml](https://raw.githubusercontent.com/Swegu/dutch-flashcards/main/docker-compose.example.yaml) && docker compose up -d

Configuration (optional)

Copy .env.example to .env. Options: PORT, ALLOW_REGISTRATION (set false once your accounts exist),WORD_LIMIT (default 0 = no limit: all ranked and unranked Wiktionary Dutch lemmas), MYMEMORY_EMAIL (higher free quota for Bulgarian).
Changing WORD_LIMIT refreshes the word list on the next start; accounts and progress are kept.
How it works

    Words & Lemmatization: Frequency ranking from hermitdave/FrequencyWords,
    definitions/IPA/articles/examples from the Dutch Wiktionary extract on kaikki.org.

        Inflected forms (e.g., heb, heeft) are grouped under their base lemma (hebben), inheriting the highest frequency rank and showing a Form of link or inflected-forms list.

        Remaining Dutch Wiktionary lemmas outside the 50k frequency list are appended at the end of the queue as unranked entries.

    Second-Source Cross-Check: Definitions are cross-checked against FreeDict (nld-eng). Cards where the two sources disagree display a warning banner on the answer side.

    Topic Packs & Smart Shuffle: Filter cards by everyday topics (Food & Drink, Travel & Transport, Home & Daily, Work & Money, Body & Health) and toggle Windowed Shuffle (randomizes within the next usefulness tier while keeping due cards prioritized).

    Spaced Repetition & Shortcuts: Rate Again / Good / Easy (1, 2, 3; Space/Enter flips; Z undoes the last rating; / searches; R reports a card). Cards move through 7 Leitner boxes (0, 1, 3, 7, 14, 30, 60 days).

    Report Wrong & Global Skip: Flag incorrect cards (🚩). Reported cards are hidden immediately from your queue and listed in the header review drawer (🚩), where they can be skipped globally for all users or dismissed.

    Score: Good = 10, Easy = 15, plus a bonus of 2 per streak step (max +20). Again resets the streak.

    Bulgarian: Language switch in the header translates the UI and shows a Bulgarian translation on the card back (via MyMemory, cached in SQLite; English meaning stays visible).

Layout:

src/server.js   API, auth, spaced repetition, search, reports, stats
src/import.js   first-start dictionary import, lemmatization, cross-check, topics
src/db.js       SQLite schema and migrations
public/         frontend (index.html, app.js, style.css)
Dockerfile, docker-compose.yml

Behind a reverse proxy

Proxy to port 3000 and forward X-Forwarded-Proto so the login cookie is marked Secure on HTTPS.

---

### Single Commit Command

After saving the 7 files above in your repository, stage and commit everything in a single clean commit:

```bash
git add src/db.js src/import.js src/server.js public/index.html public/app.js public/style.css README.md && git commit -m "Group inflections, add unranked Wiktionary lemmas, cross-check meanings, add topic packs, shuffle, and card reporting"