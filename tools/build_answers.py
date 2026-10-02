#!/usr/bin/env python3
"""
Build the public answer key for SocCyber-by Reyvem.

Reads  tools/answers.source.json  (instructor only, plaintext — never publish)
Writes assets/data/questions.json  (question text only)
       assets/data/answers.json    (SHA-256 answer hashes + AES-GCM encrypted
                                    explanations; no plaintext answers)

How it stays hidden:
  * Each accepted answer is stored as SHA-256(salt + normalized answer).
  * Each explanation is encrypted with AES-256-GCM using a key derived from the
    answer itself, so it can only be decrypted once the student types the right
    answer. A second copy is encrypted with the instructor's review code, so a
    student who got it wrong can unlock it after the exercise.

Requirements: Python 3.9+ and the 'cryptography' package
    pip install cryptography
Usage:
    python tools/build_answers.py
"""
import base64
import hashlib
import json
import os
import re
import secrets
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "answers.source.json"
OUT_Q = ROOT / "assets" / "data" / "questions.json"
OUT_A = ROOT / "assets" / "data" / "answers.json"


def normalize(text: str) -> str:
    """Must match normalize() in assets/js/crypto.js."""
    return re.sub(r"\s+", " ", text.strip().lower())


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def derive_key(secret: str, salt: str) -> bytes:
    return hashlib.sha256((salt + normalize(secret)).encode()).digest()


def encrypt(plaintext: str, secret: str, salt: str) -> dict:
    key = derive_key(secret, salt)
    iv = secrets.token_bytes(12)
    ct = AESGCM(key).encrypt(iv, plaintext.encode(), None)
    return {"iv": b64(iv), "ct": b64(ct)}


def main() -> None:
    src = json.loads(SRC.read_text(encoding="utf-8"))
    review_code = src["review_code"]
    salt = secrets.token_hex(16)

    questions, answers = [], []
    for q in src["questions"]:
        questions.append({"id": q["id"], "question": q["question"]})
        answers.append(
            {
                "id": q["id"],
                "hashes": [
                    hashlib.sha256((salt + normalize(a)).encode()).hexdigest()
                    for a in q["answers"]
                ],
                # one ciphertext per accepted answer variant, keyed by that variant
                "byAnswer": [encrypt(q["explanation"], a, salt) for a in q["answers"]],
                # correct answer + explanation, unlockable with the review code
                "byReview": encrypt(
                    json.dumps({"answer": q["answers"][0], "explanation": q["explanation"]}),
                    review_code,
                    salt,
                ),
            }
        )

    OUT_Q.parent.mkdir(parents=True, exist_ok=True)
    OUT_Q.write_text(json.dumps(questions, indent=2), encoding="utf-8")
    OUT_A.write_text(
        json.dumps(
            {
                "salt": salt,
                "reviewHash": hashlib.sha256((salt + normalize(review_code)).encode()).hexdigest(),
                "questions": answers,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Wrote {OUT_Q.relative_to(ROOT)} ({len(questions)} questions)")
    print(f"Wrote {OUT_A.relative_to(ROOT)} (hashed + encrypted)")
    print("Review code is NOT stored in plaintext. Keep tools/answers.source.json private.")


if __name__ == "__main__":
    main()
