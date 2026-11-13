# Woordjes – Dutch flashcards

Learn Dutch words with a structured **Daily Learn Pattern**, **CEFR language difficulty levels (`A1`–`C2`)**, spaced repetition, accounts, score and progress tracking.
Words, English meanings, grammatical articles (`de`/`het`), IPA, and example sentences are downloaded online on first start (nothing is hard-coded).

## Run

```bash
docker compose up -d --build
```

Open http://localhost:3000. The first start downloads the dictionaries and builds the word list
(a few minutes, the page shows progress). Create an account and start learning.

Update after changing code: `docker compose up -d --build`. Stop: `docker compose down` (data is kept in the data volume).

### Without cloning (prebuilt x86-64 + ARM64 image)

Run this in an empty folder. It saves `docker-compose.yaml` into that folder and starts the app:

```bash
curl -fsSL -o docker-compose.yaml https://raw.githubusercontent.com/Swegu/dutch-flashcards/main/docker-compose.example.yaml && docker compose up -d
```

## Configuration (optional)

Copy `.env.example` to `.env`. Options: `PORT`, `ALLOW_REGISTRATION` (set `false` once your accounts exist), `WORD_LIMIT` (default `0` = no limit: all ranked and unranked Wiktionary Dutch lemmas).
Changing `WORD_LIMIT` refreshes the word list on the next start; accounts and progress are kept.

## How it works

- **CEFR Language Difficulty Levels (`A1`–`C2`)**:
  - Every word is classified into a CEFR level (`A1` Beginner, `A2` Elementary, `B1` Intermediate, `B2` Upper-Intermediate, `C1` Advanced, `C2` Mastery) using Wiktionary learner categories, subtitle frequency rank benchmarks (`1–750`, `751–2,000`, `2,001–4,500`, `4,501–9,000`, `9,001–18,000`, `18,000+`), word compounding/length complexity, everyday topic membership, and bilingual example availability.
  - **Auto Level (`A1 → C2`)**: Automatically targets the lowest CEFR level until 80% of its words are started, then advances to the next level while continuing spaced-repetition reviews across all previously learned levels. Learners can also pin any specific level (`A1`–`C2`) or study across all levels.

- **Daily Learn Pattern**:
  - **3-Stage Interleaved Session**: Each daily session interleaves **Due Reviews** (`🔄 Due`), **Daily New Level Words** (`🌱 New`, capped at your daily new-word goal), and **Consolidation** (`🧠 Consolidate`, reinforcing low-box words when needed to complete your daily review goal).
  - **Configurable Daily Pace**: Choose between **Casual** (`5 new / 15 reviews`), **Regular** (`10 new / 30 reviews`), **Intensive** (`20 new / 60 reviews`), or custom daily targets.
  - **Day Streak & Completion Bonus**: Tracks consecutive study days (`🔥 Day streak`) and awards a `+50` score bonus when both daily new-word and review targets are met, with an option to continue in **Free Practice / Extra Practice** mode.

- **Words & Lemmatization**: Frequency ranking from `hermitdave/FrequencyWords`, definitions/IPA/articles/examples from the Dutch Wiktionary extract on `kaikki.org`.
  - Inflected forms (e.g., `heb`, `heeft`) are grouped under their base lemma (`hebben`), inheriting the highest frequency rank and showing a *Form of* link or inflected-forms list.
  - Remaining Dutch Wiktionary lemmas outside the 50k frequency list are appended at the end of the queue as unranked entries.

- **Second-Source Cross-Check**: Definitions are cross-checked against FreeDict (`nld-eng`). Cards where the two sources disagree display a warning banner on the answer side.

- **Topic Packs & Smart Shuffle**: Filter cards by everyday topics (*Food & Drink*, *Travel & Transport*, *Home & Daily*, *Work & Money*, *Body & Health*) and toggle Windowed Shuffle (randomizes within the next usefulness tier while keeping due cards prioritized).

- **Spaced Repetition & Shortcuts**: Rate *Again / Good / Easy* (`1`, `2`, `3`; `Space`/`Enter` flips; `Z` undoes the last rating; `/` searches; `R` reports a card). Cards move through 7 Leitner boxes (`0, 1, 3, 7, 14, 30, 60` days).

- **Report Wrong & Global Skip**: Flag incorrect cards (`🚩`). Reported cards are hidden immediately from your queue and listed in the header review drawer (`🚩`), where they can be skipped globally for all users or dismissed.

- **Score**: Good = 10, Easy = 15, plus a bonus of 2 per streak step (max +20) and +50 for completing the Daily Learn Pattern. Again resets the answer streak.

## Layout

```text
src/server.js   API, auth, daily learn pattern, CEFR levels, spaced repetition, search, reports, stats
src/import.js   first-start dictionary import, lemmatization, cross-check, topics, CEFR level assignment
src/db.js       SQLite schema, migrations, and CEFR level classifier/backfill
public/         frontend (index.html, app.js, style.css)
Dockerfile, docker-compose.yml
```

## Behind a reverse proxy

Proxy to port 3000 and forward `X-Forwarded-Proto` so the login cookie is marked `Secure` on HTTPS.