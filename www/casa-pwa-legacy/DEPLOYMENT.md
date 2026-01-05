# Casa de Sowu PWA - Deployment Guide

## Overview

This is a Progressive Web App (PWA) dashboard for controlling your Casa de Sowu smart home. It connects directly to your Home Assistant instance via WebSocket for real-time updates.

## Features

- **6 Pages**: Media, Lights, Weather, Calendar, Family, Cameras
- **Responsive Design**: Works on phones, tablets, and desktops without zooming
- **PWA Install**: Install as an app on any device
- **Real-time Updates**: WebSocket connection for instant state changes
- **Swipe Navigation**: Swipe left/right to change pages
- **Offline Support**: Service worker caches the app shell

## File Structure

```
casa-de-sowu-pwa/
├── index.html          # Main HTML
├── manifest.json       # PWA manifest
├── sw.js              # Service worker
├── css/
│   └── main.css       # All styles
├── js/
│   └── app.js         # Application logic
└── icons/
    └── icon-*.svg/png # App icons
```

## Deployment Steps

### 1. Create Directory on Your Server

```bash
# SSH into your server
ssh paul@10.0.0.60

# Create directory for the PWA
sudo mkdir -p /var/www/casa-app
sudo chown paul:paul /var/www/casa-app
```

### 2. Copy Files to Server

From your local machine or wherever you have the files:

```bash
# Option A: Using SCP
scp -r /path/to/casa-de-sowu-pwa/* paul@10.0.0.60:/var/www/casa-app/

# Option B: Using rsync
rsync -avz /path/to/casa-de-sowu-pwa/ paul@10.0.0.60:/var/www/casa-app/
```

### 3. Set Up Nginx Proxy Manager

1. Open Nginx Proxy Manager at `http://10.0.0.60:81`

2. Add a new **Proxy Host**:
   - **Domain Names**: `app.casadesowu.com`
   - **Scheme**: `http`
   - **Forward Hostname/IP**: `10.0.0.60`
   - **Forward Port**: `8090` (we'll set this up next)

3. **SSL Tab**:
   - Enable SSL
   - Force SSL
   - Request a new SSL certificate (Let's Encrypt)

### 4. Create a Simple HTTP Server Container

Create a Docker container to serve the static files:

```bash
# Create docker-compose file
cat > /home/paul/docker/casa-app/docker-compose.yaml << 'EOF'
version: "3.8"
services:
  casa-app:
    image: nginx:alpine
    container_name: casa-app
    ports:
      - "8090:80"
    volumes:
      - /var/www/casa-app:/usr/share/nginx/html:ro
    restart: unless-stopped
EOF

# Start the container
cd /home/paul/docker/casa-app
docker compose up -d
```

### 5. Generate Home Assistant Token

1. Go to `https://ha.casadesowu.com`
2. Click your profile (bottom left)
3. Scroll to **Long-Lived Access Tokens**
4. Click **Create Token**
5. Name it: `Casa PWA`
6. **Copy the token immediately** (you won't see it again!)

### 6. Test the PWA

1. Open `https://app.casadesowu.com` in your browser
2. Enter your HA URL: `https://ha.casadesowu.com`
3. Paste your long-lived access token
4. Click **Connect**

### 7. Install as App

**On iPhone/iPad:**
1. Open Safari → `https://app.casadesowu.com`
2. Tap Share button (square with arrow)
3. Tap "Add to Home Screen"
4. Name it "Casa" and tap Add

**On Android:**
1. Open Chrome → `https://app.casadesowu.com`
2. Tap menu (3 dots)
3. Tap "Add to Home Screen" or "Install App"

**On Desktop (Chrome):**
1. Open `https://app.casadesowu.com`
2. Click install icon in address bar (or menu → Install)

## Generating PNG Icons

The icons folder contains SVG files. To convert to PNG, you can use ImageMagick:

```bash
# Install ImageMagick if needed
sudo apt install imagemagick

# Convert SVGs to PNGs
cd /var/www/casa-app/icons
for svg in icon-*.svg; do
  size=$(echo $svg | grep -oP '\d+')
  convert -background none -resize ${size}x${size} $svg ${svg%.svg}.png
done
```

Or use an online converter like https://cloudconvert.com/svg-to-png

## Troubleshooting

### "Authentication failed" Error
- Make sure your token is correct (no extra spaces)
- Token must be a Long-Lived Access Token, not a regular password
- Check that your HA URL is correct

### WebSocket Connection Issues
- Ensure HA is accessible from your browser
- Check if your HA instance allows WebSocket connections
- Try using the internal IP if external URL doesn't work

### Cameras Not Loading
- Camera proxy requires authentication
- The token is passed automatically, but CORS may be an issue
- Check browser console for specific errors

### PWA Not Installing
- Must be served over HTTPS
- manifest.json must be valid
- Service worker must be registered

## Customization

### Changing Colors
Edit `css/main.css` and modify the CSS variables at the top:

```css
:root {
  --accent-purple: #667eea;  /* Main accent color */
  --bg-primary: #0d0d12;     /* Background */
  /* etc. */
}
```

### Adding/Removing Entities
Edit `js/app.js` and modify the `ENTITIES` object:

```javascript
const ENTITIES = {
  lights: [
    { entity: 'light.your_light', name: 'Your Light', type: 'light' },
    // Add more...
  ],
  // etc.
};
```

### Adding More Pages
1. Add HTML in `index.html` inside `pages-container`
2. Add navigation button in `bottom-nav`
3. Add page name to the `pages` array in `navigateToPage()` function

## Updates

To update the PWA after making changes:

1. Copy new files to server
2. Update the `CACHE_NAME` version in `sw.js` (e.g., 'casa-de-sowu-v2')
3. Refresh the page twice (first loads new SW, second activates it)

Or force update in browser dev tools → Application → Service Workers → Update

---

## Quick Reference

| URL | Purpose |
|-----|---------|
| `https://app.casadesowu.com` | PWA Dashboard |
| `https://ha.casadesowu.com` | Home Assistant |
| `http://10.0.0.60:81` | Nginx Proxy Manager |
| `http://10.0.0.60:8090` | PWA direct (internal) |
| `http://10.0.0.60:5000` | Wyze Bridge UI |

## Support

If you have issues, check:
1. Browser console (F12 → Console)
2. Home Assistant logs
3. Nginx Proxy Manager logs
