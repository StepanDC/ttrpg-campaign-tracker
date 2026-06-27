import hashlib
import re
import uuid

SLUG_PATTERN = re.compile(r"^[a-zA-Z0-9_-]+$")


def generate_uuid() -> str:
    return str(uuid.uuid4())


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def is_valid_slug(value: str) -> bool:
    return bool(SLUG_PATTERN.match(value)) and len(value) <= 128
