#!/bin/bash
#
# I-Dash VPS Initial Setup Script
# Prepares a fresh Hetzner VPS for I-Dash deployment
# Requires: Ubuntu 22.04 LTS or later
# Usage: sudo ./setup-vps.sh
#

set -euo pipefail

# Configuration
APP_USER="idash"
APP_PATH="/opt/idash"
DOMAIN="${1:-idash.local}"
EMAIL="${2:-admin@example.com}"

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

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    log_error "This script must be run as root (use: sudo ./setup-vps.sh)"
    exit 1
fi

main() {
    log "======================================"
    log "I-Dash VPS Setup Script"
    log "======================================"
    log "Domain: $DOMAIN"
    log "App path: $APP_PATH"
    log "App user: $APP_USER"

    # Step 1: System updates
    log "Step 1/11: Updating system packages..."
    apt-get update -qq
    apt-get upgrade -y -qq
    apt-get install -y -qq curl wget git software-properties-common apt-transport-https ca-certificates gnupg lsb-release unzip
    log_success "System updated"

    # Step 2: Install Docker
    log "Step 2/11: Installing Docker..."
    if command -v docker &> /dev/null; then
        log_warning "Docker already installed"
    else
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
            tee /etc/apt/sources.list.d/docker.list > /dev/null
        apt-get update -qq
        apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        systemctl enable docker
        systemctl start docker
        log_success "Docker installed"
    fi

    # Step 3: Install Docker Compose
    log "Step 3/11: Installing Docker Compose..."
    if command -v docker-compose &> /dev/null; then
        log_warning "Docker Compose already installed"
    else
        curl -fsSL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 -o /usr/local/bin/docker-compose
        chmod +x /usr/local/bin/docker-compose
        log_success "Docker Compose installed"
    fi

    # Step 4: Install Certbot for SSL
    log "Step 4/11: Installing Certbot..."
    apt-get install -y -qq certbot python3-certbot-nginx
    log_success "Certbot installed"

    # Step 5: Create app user
    log "Step 5/11: Creating app user..."
    if id "$APP_USER" &>/dev/null; then
        log_warning "User $APP_USER already exists"
    else
        useradd -m -s /bin/bash -G docker "$APP_USER" || true
        log_success "User $APP_USER created"
    fi

    # Step 6: Set up application directory
    log "Step 6/11: Setting up application directory..."
    mkdir -p "$APP_PATH"
    mkdir -p "$APP_PATH/backups"
    mkdir -p "$APP_PATH/logs"
    chown -R "$APP_USER:$APP_USER" "$APP_PATH"
    chmod 750 "$APP_PATH"
    log_success "Application directory configured"

    # Step 7: Configure firewall
    log "Step 7/11: Configuring firewall..."
    if ! command -v ufw &> /dev/null; then
        apt-get install -y -qq ufw
    fi

    # Enable UFW
    ufw --force enable > /dev/null 2>&1 || true

    # Configure rules
    ufw default deny incoming > /dev/null 2>&1 || true
    ufw default allow outgoing > /dev/null 2>&1 || true
    ufw allow 22/tcp > /dev/null 2>&1 || true     # SSH
    ufw allow 80/tcp > /dev/null 2>&1 || true     # HTTP
    ufw allow 443/tcp > /dev/null 2>&1 || true    # HTTPS

    log_success "Firewall configured"

    # Step 8: Install and configure Fail2Ban
    log "Step 8/11: Installing Fail2Ban..."
    apt-get install -y -qq fail2ban
    systemctl enable fail2ban
    systemctl start fail2ban

    # Configure Fail2Ban for SSH
    cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
filter = sshd
maxretry = 3
EOF

    systemctl restart fail2ban
    log_success "Fail2Ban configured"

    # Step 9: Set up log rotation
    log "Step 9/11: Configuring log rotation..."
    cat > /etc/logrotate.d/idash << EOF
$APP_PATH/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 640 $APP_USER $APP_USER
    sharedscripts
    postrotate
        docker-compose -f $APP_PATH/docker-compose.yml restart backend > /dev/null 2>&1 || true
    endscript
}
EOF

    log_success "Log rotation configured"

    # Step 10: Set up swap (if not already configured)
    log "Step 10/11: Checking swap configuration..."
    if [ ! -f /swapfile ]; then
        log_warning "Creating 2GB swap file..."
        fallocate -l 2G /swapfile
        chmod 600 /swapfile
        mkswap /swapfile > /dev/null
        swapon /swapfile
        echo '/swapfile none swap sw 0 0' | tee -a /etc/fstab > /dev/null
        sysctl vm.swappiness=10
        echo 'vm.swappiness=10' | tee -a /etc/sysctl.conf > /dev/null
        log_success "Swap configured"
    else
        log_warning "Swap already exists"
    fi

    # Step 11: Display summary and next steps
    log "Step 11/11: Setup complete!"
    log ""
    log_success "======================================"
    log_success "VPS Setup Completed Successfully!"
    log_success "======================================"
    log ""
    log "Next steps:"
    log "1. Clone the I-Dash repository:"
    log "   sudo -u $APP_USER git clone <repo-url> $APP_PATH"
    log ""
    log "2. Create .env.production file:"
    log "   sudo -u $APP_USER cp $APP_PATH/docker/.env.production.example $APP_PATH/docker/.env.production"
    log "   # Edit with your configuration"
    log ""
    log "3. Set up SSL certificate (optional):"
    log "   sudo certbot certonly --standalone -d $DOMAIN"
    log ""
    log "4. Deploy the application:"
    log "   sudo -u $APP_USER bash $APP_PATH/scripts/deploy.sh"
    log ""
    log "System Information:"
    log "- OS: $(lsb_release -ds)"
    log "- Kernel: $(uname -r)"
    log "- Docker: $(docker --version)"
    log "- Docker Compose: $(docker-compose --version)"
    log "- Certbot: $(certbot --version)"
    log ""
}

main
