from typing import Literal

from pydantic import BaseModel, Field

System = Literal["shadowdark", "cyberpunk_red"]


class CreateCampaignRequest(BaseModel):
    campaign_id: str = Field(
        min_length=1,
        max_length=128,
        pattern=r"^[a-zA-Z0-9_-]+$",
        examples=["gloomy-dungeon"],
    )
    system: System = "shadowdark"
    # Digest of the GM password (client sends sha256(password)); required to edit
    # the campaign board. Stored double-hashed server-side, never returned.
    gm_hash: str = Field(min_length=1)


class CreateCampaignResponse(BaseModel):
    campaign_id: str
    system: System
    created_at: str


class CampaignResponse(BaseModel):
    campaign_id: str
    system: System
    created_at: str
    updated_at: str
    characters: dict[str, "CharacterResponse"]
    # Shared campaign journal (notes / quests). Opaque to the backend.
    board: dict = Field(default_factory=dict)


class UpdateBoardRequest(BaseModel):
    gm_hash: str
    board: dict = Field(default_factory=dict)


class VerifyBoardRequest(BaseModel):
    gm_hash: str


class CreateCharacterRequest(BaseModel):
    editor_hash: str
    data: dict = Field(default_factory=dict)


class UpdateCharacterRequest(BaseModel):
    editor_hash: str
    data: dict


class DeleteCharacterRequest(BaseModel):
    editor_hash: str


class VerifyCharacterRequest(BaseModel):
    editor_hash: str


class CharacterResponse(BaseModel):
    id: str
    data: dict
    created_at: str
    updated_at: str
