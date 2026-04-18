FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7860 \
    CODEX_HOME=/home/appuser/.codex

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends git nodejs npm \
    && npm install -g @openai/codex \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -u 1000 appuser

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY . /app
RUN chown -R appuser:appuser /app
RUN mkdir -p /home/appuser/.codex/skills && chown -R appuser:appuser /home/appuser/.codex

EXPOSE 7860

USER appuser

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
