"""Entry point for the self-contained desktop backend executable."""

import uvicorn

from app.config import settings
from app.main import app


def main() -> None:
    """Serve only on loopback using the same settings as development."""
    uvicorn.run(
        app,
        host=settings.chess_assistant_host,
        port=settings.chess_assistant_port,
        loop="asyncio",
        http="h11",
        ws="websockets",
    )


if __name__ == "__main__":
    main()
