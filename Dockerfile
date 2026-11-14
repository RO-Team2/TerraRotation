FROM python:3.12-slim

WORKDIR /app

# SoilGrids reads GeoTIFF data through GDAL. Build Python bindings against
# the installed native library, using this image's Python (not Debian's Python).
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgdal-dev g++ \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    "fastapi>=0.110" \
    "uvicorn>=0.29" \
    "pydantic>=2.6" \
    "httpx>=0.27" \
    "numpy>=1.26"

RUN python -m pip install --no-cache-dir setuptools wheel \
    && python -m pip install --no-cache-dir --no-build-isolation "GDAL==$(gdal-config --version)" \
    && python -c "from osgeo import gdal, gdal_array, osr; print('GDAL:', gdal.VersionInfo())"

# Field analytics uses Rasterio and Shapely independently of SoilGrids GDAL.
RUN python -m pip install --no-cache-dir "rasterio>=1.4" "shapely>=2.0"

COPY terraengine/ /app/terraengine/

EXPOSE 8000

CMD ["uvicorn", "terraengine.api:app", "--host", "0.0.0.0", "--port", "8000"]
