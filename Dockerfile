FROM python:3.11-slim

# Install system deps for audio decoding
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    git \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy all project files
COPY . .

# Download Whisper CT2 models at build time
RUN python backend/download_models.py

# Default env (can be overwritten in DigitalOcean)
ENV HMH_ASR_EN_REPO=ct2/en \
    HMH_ASR_TL_REPO=ct2/tl \
    HMH_ASR_DEVICE=cpu \
    HMH_ASR_COMPUTE_TYPE=int8 \
    PORT=8000

EXPOSE 8000

# IMPORTANT: adjust this depending on your Flask entry file  
# If your Flask app is in backend/app.py and named "app":
CMD ["gunicorn", "-b", "0.0.0.0:8000", "backend.app:app"]
