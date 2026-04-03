#!/bin/bash
#
# I-Dash Database Backup Script
# Backs up PostgreSQL database and cleans old backups
# Usage: ./backup-db.sh
# Add to crontab: 0 2 * * * /opt/idash/scripts/backup-db.sh >> /var/log/idash-backup.log 2>&1
#

set -euo pipefail

# Configuration
BACKUP_DIR="${1:-./backups}"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/idash_db_$TIMESTAMP.sql.gz"
DOCKER_CONTAINER="${DOCKER_CONTAINER:-idash-postgres}"
DB_USER="${DB_USER:-idash}"
DB_NAME="${DB_NAME:-idash}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✓ $1${NC}"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ✗ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠ $1${NC}"
}

main() {
    log "======================================"
    log "I-Dash Database Backup Script"
    log "======================================"

    # Create backup directory if it doesn't exist
    if [ ! -d "$BACKUP_DIR" ]; then
        log "Creating backup directory: $BACKUP_DIR"
        mkdir -p "$BACKUP_DIR"
    fi

    # Check if Docker container is running
    log "Checking Docker container: $DOCKER_CONTAINER"
    if ! docker ps | grep -q "$DOCKER_CONTAINER"; then
        log_error "Docker container $DOCKER_CONTAINER is not running"
        exit 1
    fi
    log_success "Container is running"

    # Perform backup
    log "Starting database backup..."
    log "Backup file: $BACKUP_FILE"

    if docker exec "$DOCKER_CONTAINER" pg_dump \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --no-password \
        --clean \
        --if-exists \
        --no-privileges \
        --verbose 2>/dev/null | gzip > "$BACKUP_FILE"; then

        # Get file size
        FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        log_success "Database backup completed"
        log_success "Backup size: $FILE_SIZE"
        log_success "Location: $BACKUP_FILE"
    else
        log_error "Database backup failed"
        rm -f "$BACKUP_FILE"
        exit 1
    fi

    # Cleanup old backups
    log "Cleaning up backups older than $RETENTION_DAYS days..."
    DELETED_COUNT=0

    while IFS= read -r old_backup; do
        if [ -f "$old_backup" ]; then
            log_warning "Removing old backup: $(basename "$old_backup")"
            rm -f "$old_backup"
            DELETED_COUNT=$((DELETED_COUNT + 1))
        fi
    done < <(find "$BACKUP_DIR" -name "idash_db_*.sql.gz" -type f -mtime +$RETENTION_DAYS)

    if [ $DELETED_COUNT -gt 0 ]; then
        log_success "Deleted $DELETED_COUNT old backup(s)"
    else
        log "No old backups to delete"
    fi

    # Display backup summary
    log ""
    log_success "======================================"
    log_success "Backup Summary"
    log_success "======================================"

    TOTAL_BACKUPS=$(find "$BACKUP_DIR" -name "idash_db_*.sql.gz" -type f | wc -l)
    TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)

    log "Total backups: $TOTAL_BACKUPS"
    log "Total size: $TOTAL_SIZE"
    log ""
    log "Recent backups:"
    find "$BACKUP_DIR" -name "idash_db_*.sql.gz" -type f -printf "%T@ %p\n" | \
        sort -rn | head -5 | while read -r timestamp file; do
            size=$(du -h "$file" | cut -f1)
            date=$(date -d @${timestamp%.*} +'%Y-%m-%d %H:%M:%S')
            log "  [$date] $(basename "$file") ($size)"
        done

    log ""
    log_success "Backup script completed successfully"
}

main
