# API image. Slim base + no build toolchain: every dependency here ships a
# manylinux wheel (psycopg[binary], bcrypt, cryptography), so there is nothing
# to compile and the image stays small.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependencies first, in their own layer: application edits then rebuild in
# seconds instead of reinstalling the world.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini .
COPY migrations ./migrations
COPY app ./app

# Run as a non-root user. Nothing here needs to write to the image, and the
# database lives in Postgres.
RUN useradd --create-home --uid 10001 imperium
USER imperium

EXPOSE 8000

# The app migrates itself on startup (see app/db.py init_db), so there is no
# separate release step to forget. One worker: the WebSocket registry and the
# rate-limit counters are both in process, so a second worker would split the
# sockets and double the effective limit.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
