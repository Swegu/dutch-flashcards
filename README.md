# Woordjes – Dutch flashcards

Learn Dutch words with spaced repetition, accounts, score and progress tracking.
Words, English meanings, IPA and example sentences are downloaded online on first start (nothing is hard-coded).

## Run

```bash
docker compose up -d --build
```

Open <http://localhost:3000>. The first start downloads the dictionary and builds the word list
(a few minutes, the page shows progress). Create an account and start learning.

Update after changing code: `docker compose up -d --build`. Stop: `docker compose down` (data is kept in the `data` volume).

### Without cloning (prebuilt x86-64 + ARM64 image)

Run this in an empty folder. It saves `docker-compose.yaml` into that folder and starts the app:

```bash
curl -fsSL -o docker-compose.yaml https://raw.githubusercontent.com/Swegu/dutch-flashcards/main/docker-compose.example.yaml && docker compose up -d
```

## Configuration (optional)

Copy `.env.example` to `.env`. Options: `PORT`, `ALLOW_REGISTRATION` (set `false` once your accounts exist),
`WORD_LIMIT` (default `0` = no limit: every word of the 50k frequency list that has a Wiktionary entry), `MYMEMORY_EMAIL` (higher free quota for Bulgarian).
Changing `WORD_LIMIT` refreshes the word list on the next start; accounts and progress are kept.

## How it works

- **Words**: frequency ranking from [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords),
  meanings/IPA/examples from the Dutch Wiktionary extract on [kaikki.org](https://kaikki.org/). Stored in SQLite. Every card links to its Wiktionary entry so the meaning can be checked.
- **Ranking by your feedback**: after each card you rate *Again / Good / Easy* (keys `1 2 3`, `Space` flips).
  Cards move through 7 Leitner boxes (intervals 0, 1, 3, 7, 14, 30, 60 days). Due cards come first, words you
  get wrong more often than right come before the rest, then new words by frequency.
- **Score**: Good = 10, Easy = 15, plus a bonus of 2 per streak step (max +20). *Again* resets the streak.
- **Progress**: words started, mastered (box 5+), accuracy, today, last 7 days, due now.
- **Bulgarian**: language switch in the header changes the interface and shows a Bulgarian translation on the
  card back (machine translation via MyMemory, fetched on demand and cached; English meaning stays visible).

## Layout

```
src/server.js   API, auth, spaced repetition, stats
src/import.js   first-start word import
src/db.js       SQLite schema
public/         frontend (index.html, app.js, style.css)
Dockerfile, docker-compose.yml
```

## Behind a reverse proxy

Proxy to port 3000 and forward `X-Forwarded-Proto` so the login cookie is marked `Secure` on HTTPS.

## GitHub

```bash
git init && git add . && git commit -m "Initial version"
git branch -M main && git remote add origin <your-repo-url> && git push -u origin main
```
