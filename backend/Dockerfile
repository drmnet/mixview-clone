# Location: mixview/backend/Dockerfile
# Description: Fixed Docker configuration for the FastAPI backend service

# Use a slim version of Python
FROM python:3.11-slim

# Set the working directory inside the container.
WORKDIR /app

# Set the PYTHONPATH to include the app directory for correct module imports
# This helps Python find your modules when running the application.
ENV PYTHONPATH=/app

# Install system dependencies needed for Python packages like psycopg2.
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy the Python requirements file first for better Docker caching.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all files from the current build context into the container.
# This is a more robust approach for a Dockerfile located in a subdirectory.
COPY . .

# Create a log directory inside the container for the application to use.
RUN mkdir -p /app/logs

# Set the command to run the backend application with Uvicorn.
# Fixed: Use port 8001 to match the docker-compose port mapping
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001", "--reload"]