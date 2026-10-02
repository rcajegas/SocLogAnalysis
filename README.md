# SocCyber-by Reyvem — Log Analysis Challenge

A hands-on SOC exercise for cybersecurity students. Students review 40 simulated SIEM events across 15 attack categories, then answer 10 analyst questions. Scoring and explanations are shown on submit; logs and results can be downloaded.

## Project layout

```
index.html                 Page markup
assets/css/styles.css      Styles
assets/js/app.js           Dashboard, quiz, scoring, downloads
assets/js/crypto.js        SHA-256 / AES-GCM helpers (Web Crypto)
assets/data/logs.json      The 40 log events
assets/data/questions.json Question text only
assets/data/answers.json   Hashed answers + encrypted explanations (safe to publish)
tools/build_answers.py     Generates the two files above from the private key
tools/answers.source.json  PRIVATE — plaintext answers, review code (gitignored)
```

## How answers stay hidden

`answers.json` contains no readable answers:

- Each accepted answer is stored as `SHA-256(salt + normalized answer)`. The page hashes what the student types and compares.
- Each explanation is encrypted (AES-256-GCM) with a key derived from the correct answer, so it only decrypts when the student gets it right.
- A second copy is encrypted with an instructor **review code**. Students who miss a question can enter the code (after the exercise) to unlock the correct answer and explanation.

Nothing in the published repo lets a student recover the answers without either knowing them or having the review code.

## Deploy to GitHub Pages

1. Create a repo and push everything **except** `tools/answers.source.json` (the `.gitignore` already excludes it).
2. Settings → Pages → Source: *Deploy from a branch* → `main` / `root`.
3. Open `https://<username>.github.io/<repo>/`.

Note: the page loads JSON with `fetch`, so it must be served over HTTP. For local testing run `python -m http.server` in the project folder and open `http://localhost:8000`.

## Changing questions, answers or the review code

1. Edit `tools/answers.source.json` (keep it private).
2. Run `pip install cryptography` once, then `python tools/build_answers.py`.
3. Commit the regenerated `assets/data/questions.json` and `assets/data/answers.json`.

To change the logs, edit `assets/data/logs.json` (fields: `id, timestamp, source, severity, category, event`).
