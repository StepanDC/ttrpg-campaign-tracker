import uvicorn

if __name__ == "__main__":
    # Single worker only: per-campaign locks and the SSE subscriber registry
    # live in process memory, so multiple workers would break locking and event
    # broadcasting. reload spawns one worker, which is what we want.
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
