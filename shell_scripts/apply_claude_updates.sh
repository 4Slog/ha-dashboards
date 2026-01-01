#!/bin/bash
# Apply Claude's Updates from Google Drive to HA Config

HA_CONFIG="/home/paul/docker/homeassistant/config"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "========================================="
echo "Applying Claude's Updates"
echo "========================================="
echo ""

# Download latest from claude-updates folder
echo "Downloading updates from Google Drive..."
mkdir -p ~/claude-updates
rclone sync "gdrive:HomeAssistant-Config/claude-updates/" \
    "$HOME/claude-updates/" --exclude "*.md"

# Check if there are any .yaml files
if ! ls "$HOME/claude-updates/"*.yaml 1> /dev/null 2>&1; then
    echo "No update files found in Google Drive."
    echo "Claude hasn't created any updates yet."
    exit 0
fi

echo ""
echo "Found updates:"
ls -lh "$HOME/claude-updates/"*.yaml

# Check for CHANGELOG
if [ -f "$HOME/claude-updates/CHANGELOG.md" ]; then
    echo ""
    echo "=== CHANGELOG ==="
    cat "$HOME/claude-updates/CHANGELOG.md"
    echo "================="
fi

echo ""
read -p "Review the files above. Apply updates? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Update cancelled."
    exit 0
fi

# Create backup
echo ""
echo "Creating backup..."
mkdir -p "$HA_CONFIG/backups"

# Apply updates
echo "Applying updates..."
for file in "$HOME/claude-updates/"*.yaml; do
    filename=$(basename "$file")
    
    if [[ $filename == *"hp_control_center"* ]]; then
        # Backup current dashboard
        if [ -f "$HA_CONFIG/dashboards/hp_control_center.yaml" ]; then
            cp "$HA_CONFIG/dashboards/hp_control_center.yaml" \
                "$HA_CONFIG/backups/hp_control_center_${TIMESTAMP}.yaml"
        fi
        # Apply new version
        cp "$file" "$HA_CONFIG/dashboards/hp_control_center.yaml"
        echo "  ✓ Updated dashboard: $filename"
        
    elif [[ $filename == "configuration.yaml" ]]; then
        cp "$HA_CONFIG/configuration.yaml" "$HA_CONFIG/backups/configuration_${TIMESTAMP}.yaml"
        cp "$file" "$HA_CONFIG/configuration.yaml"
        echo "  ✓ Updated configuration"
        
    elif [[ $filename == "automations.yaml" ]]; then
        cp "$HA_CONFIG/automations.yaml" "$HA_CONFIG/backups/automations_${TIMESTAMP}.yaml"
        cp "$file" "$HA_CONFIG/automations.yaml"
        echo "  ✓ Updated automations"
        
    elif [[ $filename == "scripts.yaml" ]]; then
        cp "$HA_CONFIG/scripts.yaml" "$HA_CONFIG/backups/scripts_${TIMESTAMP}.yaml"
        cp "$file" "$HA_CONFIG/scripts.yaml"
        echo "  ✓ Updated scripts"
    fi
done

echo ""
echo "========================================="
echo "Updates Applied Successfully!"
echo "========================================="
echo "Backup saved to: $HA_CONFIG/backups/"
echo ""
echo "Next steps:"
echo "1. Go to Home Assistant: Developer Tools → YAML"
echo "2. Reload the appropriate configurations:"
echo "   - Dashboards (if dashboard changed)"
echo "   - Scripts (if scripts changed)"
echo "   - Automations (if automations changed)"
echo ""
