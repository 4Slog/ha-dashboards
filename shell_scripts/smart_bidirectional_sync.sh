#!/bin/bash
# Smart Bidirectional Sync for Home Assistant ↔ Google Drive
# Only syncs when changes are detected

HA_CONFIG="/home/paul/docker/homeassistant/config"
GDRIVE_BASE="gdrive:HomeAssistant-Config"
STATE_DIR="$HOME/.ha_gdrive_sync"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create state directory if it doesn't exist
mkdir -p "$STATE_DIR"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1"
}

# Calculate hash of important files
calculate_ha_hash() {
    {
        # Config files
        cat "$HA_CONFIG/configuration.yaml" 2>/dev/null || true
        cat "$HA_CONFIG/automations.yaml" 2>/dev/null || true
        cat "$HA_CONFIG/scripts.yaml" 2>/dev/null || true
        
        # Dashboards
        find "$HA_CONFIG/dashboards/" -name "*.yaml" -exec cat {} \; 2>/dev/null || true
        
        # Entity registry (for new devices)
        cat "$HA_CONFIG/.storage/core.entity_registry" 2>/dev/null || true
    } | md5sum | cut -d' ' -f1
}

# Check if HA files have changed since last sync
ha_files_changed() {
    local current_hash=$(calculate_ha_hash)
    local last_hash=$(cat "$STATE_DIR/last_ha_hash" 2>/dev/null || echo "")
    
    if [ "$current_hash" != "$last_hash" ]; then
        echo "$current_hash" > "$STATE_DIR/last_ha_hash"
        return 0  # Changed
    else
        return 1  # No change
    fi
}

# Check if Google Drive has new updates for us
gdrive_has_updates() {
    # Get last modified time of claude-updates folder
    local latest_time=$(rclone lsl "$GDRIVE_BASE/claude-updates/" 2>/dev/null | \
                       awk '{print $2, $3}' | sort -r | head -1)
    
    local last_check=$(cat "$STATE_DIR/last_gdrive_check" 2>/dev/null || echo "")
    
    if [ "$latest_time" != "$last_check" ] && [ -n "$latest_time" ]; then
        echo "$latest_time" > "$STATE_DIR/last_gdrive_check"
        return 0  # Has updates
    else
        return 1  # No updates
    fi
}

# Sync HA → Google Drive (only if changes detected)
sync_ha_to_gdrive() {
    log "Checking HA for changes..."
    
    if ha_files_changed; then
        log "✓ Changes detected! Syncing to Google Drive..."
        
        # Run the enhanced sync script
        "$HOME/scripts/sync_to_gdrive_enhanced.sh" > /dev/null 2>&1
        
        log "✓ HA → Google Drive sync complete"
        return 0
    else
        log "→ No changes in HA files, skipping sync"
        return 1
    fi
}

# Sync Google Drive → HA (only if Claude made updates)
sync_gdrive_to_ha() {
    log "Checking Google Drive for Claude updates..."
    
    if gdrive_has_updates; then
        log "✓ New updates from Claude detected!"
        
        # Download from claude-updates folder
        mkdir -p "$HOME/claude-updates"
        rclone sync "$GDRIVE_BASE/claude-updates/" "$HOME/claude-updates/" \
            --exclude "*.md" --exclude "*.txt" 2>/dev/null
        
        # Check if there are any YAML files
        if ls "$HOME/claude-updates/"*.yaml 1> /dev/null 2>&1; then
            log "  → Found updated YAML files"
            log "  → Ready to apply with: ~/scripts/apply_claude_updates.sh"
        else
            log "  → No YAML files to apply"
        fi
        
        return 0
    else
        log "→ No new updates from Claude, skipping"
        return 1
    fi
}

# Main sync function
main() {
    log "======================================"
    log "Smart Bidirectional Sync Starting"
    log "======================================"
    
    # Track if any syncs happened
    local synced=false
    
    # Sync HA → Google Drive (if HA changed)
    if sync_ha_to_gdrive; then
        synced=true
    fi
    
    echo ""
    
    # Sync Google Drive → HA (if Claude made updates)
    if sync_gdrive_to_ha; then
        synced=true
    fi
    
    echo ""
    log "======================================"
    if [ "$synced" = true ]; then
        log "Sync Complete - Changes Detected"
    else
        log "Sync Complete - No Changes"
    fi
    log "======================================"
}

# Run main function
main
