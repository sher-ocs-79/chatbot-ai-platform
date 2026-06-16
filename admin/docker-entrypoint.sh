#!/bin/bash
set -e

cd /app

# Map Railway's DATABASE_URL to DB_URL if not set separately
if [ -n "$DATABASE_URL" ] && [ -z "$DB_URL" ]; then
    export DB_URL="$DATABASE_URL"
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
