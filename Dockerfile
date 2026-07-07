# Container image for the Flask track-analysis backend (deployed to Cloud Run).
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py trackanalysis.py ./

# Cloud Run sets $PORT at runtime; default it for local `docker run`.
ENV PORT=8080
EXPOSE 8080

CMD exec gunicorn -b :$PORT --workers 1 --threads 8 --timeout 120 main:app
