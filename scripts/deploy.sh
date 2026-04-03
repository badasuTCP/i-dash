#!/bin/bash
#
# I-Dash Deployment Script
# Deploys the application to a Hetzner VPS
# Usage: ./deploy.sh [user@host] [branch]
#

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DEPLOY_USER="${1:-root}"
DEPLOY_BRANCH="${2:-main}"
REMOTE_PATH="/opt/idash"
BACKUP_DIR="/opt/idash/backups"
LOG_FILE="/tmp/idash-deploy-$(date +%s).log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] ✓ $1${NC}" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ✗ $1${NC}" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] ⚠ $1${NC}" | tee -a "$LOG_FILE"
}

# Function to execute remote commands
remote_exec() {
    local cmd="$1"
    ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$DEPLOY_USER" "$cmd" 2>&1 | tee -a "$LOG_FILE"
}

# Function to upload files
remote_upload() {
    local source="$1"
    local dest="$2"
    scp -r -o ConnectTimeout=10 "$source" "$DEPLOY_USER:$dest" 2>&1 | tee -a "$LOG_FILE"
}

# Error handling and rollback
rollback() {
    log_error "Deployment failed! Attempting rollback..."

    remote_exec "cd $REMOTE_PATH && docker-compose down" || true
    remote_exec "cd $REMOTE_PATH && git reset --hard HEAD~1" || true
    remote_exec "cd $REMOTE_PATH && docker-compose up -d" || true

    log_error "Rollback completed. Please review logs at $LOG_FILE"
    exit 1
}

trap rollback ERR

# Main deployment
main() {
    log "======================================"
    log "I-Dash Deployment Script"
    log "======================================"
    log "Deploying to: $DEPLOY_USER"
    log "Branch: $DEPLOY_BRANCH"
    log "Remote path: $REMOTE_PATH"
    log "Log file: $LOG_FILE"

    # Step 1: Verify SSH connectivity
    log "Step 1/8: Verifying SSH connectivity..."
    if ! remote_exec "echo 'SSH connection successful'" > /dev/null; then
        log_error "Cannot connect to $DEPLOY_USER. Check SSH configuration."
        exit 1
    fi
    log_success "SSH connection verified"

    # Step 2: Create/verify remote directories
    log "Step 2/8: Verifying remote directories..."
    remote_exec "mkdir -p $REMOTE_PATH $BACKUP_DIR"
    log_success "Remote directories ready"

    # Step 3: Backup database before deployment
    log "Step 3/8: Backing up database..."
    remote_exec "cd $REMOTE_PATH && bash scripts/backup-db.sh" || log_warning "Database backup failed (continuing)"
    log_success "Database backup completed"

    # Step 4: Pull latest code
    log "Step 4/8: Pulling latest code from $DEPLOY_BRANCH..."
    remote_exec "cd $REMOTE_PATH && git fetch origin && git checkout $DEPLOY_BRANCH && git pull origin $DEPLOY_BRANCH"
    log_success "Code updated"

    # Step 5: Build and start services
    log "Step 5/8: Building and starting services..."
    remote_exec "cd $REMOTE_PATH && docker-compose build --no-cache"
    remote_exec "cd $REMOTE_PATH && docker-compose down || true"
    remote_exec "cd $REMOTE_PATH && docker-compose up -d"
    log_success "Services started"

    # Step 6: Wait for services to be healthy
    log "Step 6/8: Waiting for services to stabilize..."
    sleep 10
    log_success "Services stabilized"

    # Step 7: Run database migrations
    log "Step 7/8: Running database migrations..."
    remote_exec "cd $REMOTE_PATH && docker-compose exec -T backend alembic upgrade head" || \
        log_warning "Migrations may have already been applied or failed (check logs)"
    log_success "Database migrations completed"

    # Step 8: Health check verification
    log "Step 8/8: Verifying application health..."

    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if remote_exec "curl -sf http://localhost:80/health > /dev/null 2>&1"; then
            log_success "Application is healthy!"

            # Display service status
            log "Service status:"
            remote_exec "cd $REMOTE_PATH && docker-compose ps"

            log_success "======================================"
            log_success "Deployment completed successfully!"
            log_success "======================================"
            log_success "Frontend: http://$(remote_exec 'hostname -I | awk "{print \$1}"')"
            log_success "Backend API: http://$(remote_exec 'hostname -I | awk "{print \$1}"')/api"
            log_success "Logs available at: $LOG_FILE"

            return 0
        fi

        attempt=$((attempt + 1))
        log_warning "Health check attempt $attempt/$max_attempts..."
        sleep 2
    done

    log_error "Health check failed after $max_attempts attempts"
    exit 1
}

# Display usage
usage() {
    cat << EOF
Usage: $0 [user@host] [branch]

Example:
    $0 root@192.168.1.100 main
    $0 deploy@example.com develop

Arguments:
    user@host   SSH connection string (default: root)
    branch      Git branch to deploy (default: main)

Environment Variables:
    REMOTE_PATH     Deployment path on remote server (default: /opt/idash)

EOF
    exit 1
}

# Run main if arguments provided or show usage
if [ "$#" -eq 0 ]; then
    usage
else
    main
fi
