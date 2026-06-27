import asyncio
import os
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import storage
from .utils import is_valid_slug
from .models import (
    CampaignResponse,
    CharacterResponse,
    CreateCampaignRequest,
    CreateCampaignResponse,
    CreateCharacterRequest,
    DeleteCharacterRequest,
    UpdateBoardRequest,
    UpdateCharacterRequest,
    VerifyBoardRequest,
    VerifyCharacterRequest,
)
from .sse import SSEManager

app = FastAPI(title="Shadowdark Character List", version="0.1.0")

# Allowed CORS origins come from env so the frontend can be hosted separately
# (e.g. GitHub Pages) from the backend. Default "*" for the local one-box setup.
_origins_env = os.environ.get("ALLOWED_ORIGINS", "*").strip()
_allow_origins = ["*"] if _origins_env == "*" else [
    o.strip() for o in _origins_env.split(",") if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    # Auth is carried in the request body (editor_hash), not cookies, so we do
    # not need credentialed CORS. "*" origins + credentials is rejected by
    # browsers anyway, so keep credentials off.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

sse_manager = SSEManager()


def valid_campaign_id(campaign_id: str) -> str:
    if not is_valid_slug(campaign_id):
        raise HTTPException(status_code=422, detail="Invalid campaign id")
    return campaign_id


def valid_character_id(character_id: str) -> str:
    if not is_valid_slug(character_id):
        raise HTTPException(status_code=422, detail="Invalid character id")
    return character_id


@app.exception_handler(storage.CampaignNotFound)
async def handle_campaign_not_found(request: Request, exc: storage.CampaignNotFound):
    raise HTTPException(status_code=404, detail=str(exc))


@app.exception_handler(storage.CharacterNotFound)
async def handle_character_not_found(request: Request, exc: storage.CharacterNotFound):
    raise HTTPException(status_code=404, detail=str(exc))


@app.exception_handler(storage.Forbidden)
async def handle_forbidden(request: Request, exc: storage.Forbidden):
    raise HTTPException(status_code=403, detail=str(exc))


@app.exception_handler(storage.Conflict)
async def handle_conflict(request: Request, exc: storage.Conflict):
    raise HTTPException(status_code=409, detail=str(exc))


# --------------------------------------------------------------------------- #
#  Campaigns
# --------------------------------------------------------------------------- #


@app.post("/api/campaigns", status_code=201, response_model=CreateCampaignResponse)
async def create_campaign(body: CreateCampaignRequest):
    campaign = await storage.create_campaign(
        campaign_id=body.campaign_id,
        system=body.system,
        gm_hash=body.gm_hash,
    )
    return CreateCampaignResponse(
        campaign_id=campaign["campaign_id"],
        system=campaign["system"],
        created_at=campaign["created_at"],
    )


@app.get("/api/campaigns/{campaign_id}", response_model=CampaignResponse)
async def get_campaign(campaign_id: str = Depends(valid_campaign_id)):
    campaign = await storage.get_campaign(campaign_id)
    return CampaignResponse(**campaign)


@app.put("/api/campaigns/{campaign_id}/board", response_model=CampaignResponse)
async def update_board(
    body: UpdateBoardRequest,
    campaign_id: str = Depends(valid_campaign_id),
):
    campaign = await storage.update_board(
        campaign_id=campaign_id,
        gm_hash=body.gm_hash,
        board=body.board,
    )
    await sse_manager.broadcast(
        campaign_id,
        event="board_updated",
        data={"campaign_id": campaign_id},
    )
    return CampaignResponse(**campaign)


@app.post("/api/campaigns/{campaign_id}/board/verify", status_code=204)
async def verify_board(
    body: VerifyBoardRequest,
    campaign_id: str = Depends(valid_campaign_id),
):
    await storage.verify_board(
        campaign_id=campaign_id,
        gm_hash=body.gm_hash,
    )


# --------------------------------------------------------------------------- #
#  Characters
# --------------------------------------------------------------------------- #


@app.post(
    "/api/campaigns/{campaign_id}/characters",
    status_code=201,
    response_model=CharacterResponse,
)
async def create_character(
    body: CreateCharacterRequest,
    campaign_id: str = Depends(valid_campaign_id),
):
    character = await storage.create_character(
        campaign_id=campaign_id,
        editor_hash=body.editor_hash,
        data=body.data,
    )
    await sse_manager.broadcast(
        campaign_id,
        event="character_created",
        data={"campaign_id": campaign_id, "character_id": character["id"]},
    )
    return CharacterResponse(**character)


@app.put(
    "/api/campaigns/{campaign_id}/characters/{character_id}",
    response_model=CharacterResponse,
)
async def update_character(
    body: UpdateCharacterRequest,
    campaign_id: str = Depends(valid_campaign_id),
    character_id: str = Depends(valid_character_id),
):
    character = await storage.update_character(
        campaign_id=campaign_id,
        character_id=character_id,
        editor_hash=body.editor_hash,
        data=body.data,
    )
    await sse_manager.broadcast(
        campaign_id,
        event="character_updated",
        data={"campaign_id": campaign_id, "character_id": character_id},
    )
    return CharacterResponse(**character)


@app.post(
    "/api/campaigns/{campaign_id}/characters/{character_id}/verify",
    status_code=204,
)
async def verify_character(
    body: VerifyCharacterRequest,
    campaign_id: str = Depends(valid_campaign_id),
    character_id: str = Depends(valid_character_id),
):
    await storage.verify_character(
        campaign_id=campaign_id,
        character_id=character_id,
        editor_hash=body.editor_hash,
    )


@app.delete("/api/campaigns/{campaign_id}/characters/{character_id}", status_code=204)
async def delete_character(
    body: DeleteCharacterRequest,
    campaign_id: str = Depends(valid_campaign_id),
    character_id: str = Depends(valid_character_id),
):
    await storage.delete_character(
        campaign_id=campaign_id,
        character_id=character_id,
        editor_hash=body.editor_hash,
    )
    await sse_manager.broadcast(
        campaign_id,
        event="character_deleted",
        data={"campaign_id": campaign_id, "character_id": character_id},
    )


# --------------------------------------------------------------------------- #
#  SSE
# --------------------------------------------------------------------------- #


@app.get("/api/campaigns/{campaign_id}/events")
async def campaign_events(campaign_id: str = Depends(valid_campaign_id)):
    await storage.get_campaign(campaign_id)

    async def stream():
        queue = sse_manager.subscribe(campaign_id)
        try:
            yield f"event: connected\ndata: {{}}\n\n"
            while True:
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=30)
                    yield message
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            sse_manager.unsubscribe(campaign_id, queue)

    return StreamingResponse(stream(), media_type="text/event-stream")


# --------------------------------------------------------------------------- #
#  Static frontend
# --------------------------------------------------------------------------- #

# Mounted last so the /api routes above take precedence. html=True serves
# index.html for "/" and falls back to it, so the vanilla SPA works.
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


@app.get("/shadowdark")
async def shadowdark_page():
    return FileResponse(STATIC_DIR / "shadowdark.html")


@app.get("/cyberpunk")
async def cyberpunk_page():
    return FileResponse(STATIC_DIR / "cyberpunk.html")


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
