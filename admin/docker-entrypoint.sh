#!/bin/bash
set -e

cd /app

# Parse DATABASE_URL into components Laravel understands.
# Laravel's URL parser strips query params, so sslmode must be set separately.
if [ -n "$DATABASE_URL" ]; then
    # Extract sslmode from query string before passing the URL to Laravel
    SSLMODE=$(echo "$DATABASE_URL" | grep -oP '(?<=sslmode=)[^&]+' || true)
    export DB_SSLMODE="${SSLMODE:-prefer}"

    # Strip the query string — Laravel doesn't parse it from DB_URL
    export DB_URL=$(echo "$DATABASE_URL" | sed 's/?.*//')
fi

# Create required storage directories
mkdir -p storage/app/extractions/posts \
         storage/app/extractions/pages \
         storage/framework/cache/data \
         storage/framework/sessions \
         storage/framework/views \
         storage/logs \
         bootstrap/cache

chmod -R 775 storage bootstrap/cache

# Run migrations and seed default admin/settings
php artisan migrate --force
php artisan db:seed --force

# Start Laravel server
exec php artisan serve --host=0.0.0.0 --port=${PORT:-8000}
