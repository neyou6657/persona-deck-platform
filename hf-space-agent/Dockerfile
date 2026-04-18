FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7860 \
    CODEX_HOME=/root/.codex

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends git nodejs npm \
    && npm install -g @openai/codex \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY . /app
RUN chmod +x /app/docker-entrypoint.sh \
    && mkdir -p /root/.codex/skills

EXPOSE 7860

ENTRYPOINT ["./docker-entrypoint.sh"]

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
