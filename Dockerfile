FROM python:3.12-slim

WORKDIR /app

#zależności backend'u, instalujemy je bezpośrednio, ponieważ na pyproject.toml

RUN pip install --no-cache-dir \
    "fastapi>=0.110" \
    "uvicorn>=0.29" \
    "pydantic>=2.6" \
    "httpx>=0.27" \
    "numpy>=1.26"

COPY terraengine/ /app/terraengine/

EXPOSE 8000

CMD ["uvicorn", "terraengine.api:app", "--host", "0.0.0.0", "--port", "8000"]
