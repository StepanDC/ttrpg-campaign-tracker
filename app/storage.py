import asyncio
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from .utils import generate_uuid, is_valid_slug, sha256

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# NOTE: _locks and the SSE subscriber registry live in process memory, so this
# backend MUST run as a single worker (see run.py). With multiple workers the
# per-campaign locking and event broadcasting would silently break.
_locks: dict[str, asyncio.Lock] = {}


def _campaign_path(campaign_id: str) -> Path:
    # Defence in depth: never build a path from an unvalidated id. Handlers
    # validate too, but this guards every storage entry point against traversal.
    if not is_valid_slug(campaign_id):
        raise CampaignNotFound(campaign_id)
    return DATA_DIR / f"{campaign_id}.json"


def _get_lock(campaign_id: str) -> asyncio.Lock:
    if campaign_id not in _locks:
        _locks[campaign_id] = asyncio.Lock()
    return _locks[campaign_id]


class CampaignNotFound(Exception):
    def __init__(self, campaign_id: str):
        super().__init__(f"Campaign '{campaign_id}' not found")
        self.campaign_id = campaign_id


class CharacterNotFound(Exception):
    def __init__(self, character_id: str):
        super().__init__(f"Character '{character_id}' not found")
        self.character_id = character_id


class Forbidden(Exception):
    def __init__(self):
        super().__init__("Invalid editor hash")


class Conflict(Exception):
    def __init__(self, campaign_id: str):
        super().__init__(f"Campaign '{campaign_id}' already exists")
        self.campaign_id = campaign_id


def _migrate(campaign: dict) -> dict:
    # Backfill fields added after a campaign was first written so older files
    # still satisfy the response models.
    campaign.setdefault("system", "shadowdark")
    campaign.setdefault("board", {})
    return campaign


def _read_campaign(campaign_id: str) -> dict:
    path = _campaign_path(campaign_id)
    if not path.exists():
        raise CampaignNotFound(campaign_id)
    return _migrate(json.loads(path.read_text(encoding="utf-8")))


def _write_campaign(campaign: dict) -> None:
    path = _campaign_path(campaign["campaign_id"])
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(campaign, ensure_ascii=False, indent=2)
    # Atomic write: dump to a temp file in the same dir, then rename over the
    # target. A crash mid-write leaves the old file intact instead of a truncated
    # one. The rename is atomic because src and dst share a filesystem.
    fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=path.name, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(payload)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_name, path)
    except BaseException:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _public_character(character: dict) -> dict:
    # Never leak the editor secret/digest to clients. Anyone who can read the
    # campaign can view sheets, but only the holder of the secret can edit.
    return {k: v for k, v in character.items() if k != "editor_hash_digest"}


async def create_campaign(campaign_id: str, system: str, gm_hash: str) -> dict:
    lock = _get_lock(campaign_id)
    async with lock:
        path = _campaign_path(campaign_id)
        if path.exists():
            raise Conflict(campaign_id)
        now = _now_iso()
        campaign = {
            "campaign_id": campaign_id,
            "system": system,
            "gm_digest": sha256(gm_hash),
            "created_at": now,
            "updated_at": now,
            "characters": {},
            "board": {},
        }
        _write_campaign(campaign)
        return campaign


async def get_campaign(campaign_id: str) -> dict:
    lock = _get_lock(campaign_id)
    async with lock:
        return _read_campaign(campaign_id)


async def update_board(campaign_id: str, gm_hash: str, board: dict) -> dict:
    lock = _get_lock(campaign_id)
    async with lock:
        campaign = _read_campaign(campaign_id)
        # Only the GM (who knows the campaign password) may edit the journal.
        if campaign.get("gm_digest") != sha256(gm_hash):
            raise Forbidden()
        now = _now_iso()
        campaign["board"] = board
        campaign["updated_at"] = now
        _write_campaign(campaign)
        return campaign


async def verify_board(campaign_id: str, gm_hash: str) -> None:
    lock = _get_lock(campaign_id)
    async with lock:
        campaign = _read_campaign(campaign_id)
        if campaign.get("gm_digest") != sha256(gm_hash):
            raise Forbidden()


async def create_character(campaign_id: str, editor_hash: str, data: dict) -> dict:
    lock = _get_lock(campaign_id)
    async with lock:
        campaign = _read_campaign(campaign_id)
        now = _now_iso()
        char_id = generate_uuid()
        character = {
            "id": char_id,
            "editor_hash_digest": sha256(editor_hash),
            "data": data,
            "created_at": now,
            "updated_at": now,
        }
        campaign["characters"][char_id] = character
        campaign["updated_at"] = now
        _write_campaign(campaign)
        return _public_character(character)


async def update_character(campaign_id: str, character_id: str, editor_hash: str, data: dict) -> dict:
    lock = _get_lock(campaign_id)
    async with lock:
        campaign = _read_campaign(campaign_id)
        characters = campaign.get("characters", {})
        if character_id not in characters:
            raise CharacterNotFound(character_id)
        character = characters[character_id]
        if character.get("editor_hash_digest") != sha256(editor_hash):
            raise Forbidden()
        now = _now_iso()
        character["data"] = data
        character["updated_at"] = now
        campaign["updated_at"] = now
        _write_campaign(campaign)
        return _public_character(character)


async def verify_character(campaign_id: str, character_id: str, editor_hash: str) -> None:
    lock = _get_lock(campaign_id)
    async with lock:
        campaign = _read_campaign(campaign_id)
        characters = campaign.get("characters", {})
        if character_id not in characters:
            raise CharacterNotFound(character_id)
        if characters[character_id].get("editor_hash_digest") != sha256(editor_hash):
            raise Forbidden()


async def delete_character(campaign_id: str, character_id: str, editor_hash: str) -> None:
    lock = _get_lock(campaign_id)
    async with lock:
        campaign = _read_campaign(campaign_id)
        characters = campaign.get("characters", {})
        if character_id not in characters:
            raise CharacterNotFound(character_id)
        if characters[character_id].get("editor_hash_digest") != sha256(editor_hash):
            raise Forbidden()
        del characters[character_id]
        campaign["updated_at"] = _now_iso()
        _write_campaign(campaign)
