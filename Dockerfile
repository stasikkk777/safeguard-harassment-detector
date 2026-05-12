# ─── SAFEGUARD — Dockerfile ───────────────────────────────────────────────────
# Uses CPU-only PyTorch to keep image ~1.5 GB instead of ~5 GB with CUDA.
# Model checkpoint (~250 MB) is downloaded from GitHub on first run
# and cached in a Docker volume (see docker-compose.yml) so it persists
# across container restarts.
# ─────────────────────────────────────────────────────────────────────────────

FROM python:3.11-slim

WORKDIR /app

# System deps needed by PyTorch / tokenizers
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ curl \
    && rm -rf /var/lib/apt/lists/*

# 1. Install CPU-only PyTorch first (much smaller than the default CUDA wheel)
RUN pip install --no-cache-dir \
    torch --index-url https://download.pytorch.org/whl/cpu

# 2. Install the rest
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 3. Copy application code
COPY app.py      .
COPY detector.py .
COPY static/     ./static/

EXPOSE 5000

# Note: Detoxify will download the model checkpoint on first startup (~250 MB).
# Subsequent starts reuse the cached file from the mounted volume.
CMD ["python", "app.py"]
