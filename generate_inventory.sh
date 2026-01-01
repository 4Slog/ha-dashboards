#!/bin/bash
echo "# Casa de Sowu - System Inventory" > system_inventory.md
echo "Generated: $(date)" >> system_inventory.md
echo "" >> system_inventory.md

echo "## Integrations" >> system_inventory.md
# List all folders in custom_components
ls -1 custom_components/ >> system_inventory.md 2>/dev/null

echo "" >> system_inventory.md
echo "## Entities (Raw Extract)" >> system_inventory.md
# Extract entity IDs from the storage registry (requires jq, simple grep fallback)
grep -o '"entity_id": "[^"]*"' .storage/core.entity_registry | cut -d'"' -f4 | sort >> system_inventory.md
